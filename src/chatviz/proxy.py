"""Async proxy forwarding with streaming passthrough."""
import asyncio
import json
import os
import uuid
from typing import AsyncGenerator
from urllib.parse import urlparse, urlunparse, urlencode, parse_qsl

import botocore.auth
import botocore.awsrequest
import boto3
import httpx
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse

from chatviz.detector import detect_api_family, UnknownAPIFamily
from chatviz.parser import parse_request, parse_response, assemble_stream
from chatviz.store import store
from chatviz.sse import broadcaster

_UPSTREAM_DEFAULTS = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com",
    "ollama": "http://localhost:11434",
}

_FAMILY_ENV_VARS = {
    "anthropic": "CHATVIZ_ANTHROPIC_UPSTREAM",
    "openai": "CHATVIZ_OPENAI_UPSTREAM",
    "ollama": "CHATVIZ_OLLAMA_UPSTREAM",
}


def _upstream_base(api_family: str) -> str:
    global_override = os.environ.get("CHATVIZ_UPSTREAM")
    if global_override:
        return global_override.rstrip("/")
    family_override = os.environ.get(_FAMILY_ENV_VARS[api_family])
    if family_override:
        return family_override.rstrip("/")
    return _UPSTREAM_DEFAULTS[api_family]


def _strip_aws_unsupported_body(body: bytes) -> bytes:
    try:
        obj = json.loads(body)
    except Exception:
        return body
    obj.pop("betas", None)
    obj.pop("output_config", None)
    return json.dumps(obj).encode()


def _strip_aws_unsupported_params(url: str) -> str:
    parsed = urlparse(url)
    query = urlencode([(k, v) for k, v in parse_qsl(parsed.query) if k != "beta"])
    return urlunparse(parsed._replace(query=query))


_boto_session: boto3.Session | None = None

def _get_boto_session() -> boto3.Session:
    global _boto_session
    if _boto_session is None:
        profile = os.environ.get("CHATVIZ_AWS_PROFILE")
        _boto_session = boto3.Session(profile_name=profile) if profile else boto3.Session()
    return _boto_session


def _sigv4_sign(url: str, body: bytes, headers: dict) -> tuple[dict, bool, str]:
    """Return (headers, signed) — headers with SigV4 Authorization added if upstream is AWS."""
    host = urlparse(url).hostname or ""
    # e.g. bedrock-mantle.eu-west-1.api.aws
    if not host.endswith(".api.aws"):
        return headers, False, url
    url = _strip_aws_unsupported_params(url)
    parts = host.split(".")
    # parts: [service, region, "api", "aws"]
    service, region = parts[0], parts[1]
    # resolve_credentials() refreshes STS tokens if expired; get_frozen_credentials() does not
    credentials = _get_boto_session().get_credentials().get_frozen_credentials()
    aws_request = botocore.awsrequest.AWSRequest(
        method="POST",
        url=url,
        data=body,
        headers={k: v for k, v in headers.items()
                 if k.lower() not in {"host", "authorization", "x-api-key", "anthropic-beta"}
                 and not k.lower().startswith("x-amz-")},
    )
    botocore.auth.SigV4Auth(credentials, service, region).add_auth(aws_request)
    signed = dict(aws_request.headers)
    # strip auth-related headers from original before merging so signed values win
    clean = {k: v for k, v in headers.items()
             if k.lower() not in {"host", "authorization", "x-api-key", "anthropic-beta"}
             and not k.lower().startswith("x-amz-")}
    merged = {**clean, **signed}
    return merged, True, url


def _forward_headers(request: Request) -> dict:
    skip = {"content-length", "transfer-encoding"}
    return {k: v for k, v in request.headers.items() if k.lower() not in skip}


def _make_client(headers: dict, override_host: str | None = None) -> httpx.AsyncClient:
    """Return an AsyncClient that optionally forces the Host header after httpx sets it."""
    async def _fix_host(req: httpx.Request) -> None:
        if override_host:
            req.headers["host"] = override_host

    return httpx.AsyncClient(
        timeout=120,
        event_hooks={"request": [_fix_host]},
    )


async def handle_proxy(request: Request) -> Response:
    path = request.url.path
    query = str(request.url.query)
    url_with_query = path + (f"?{query}" if query else "")

    try:
        api_family = detect_api_family(path)
    except UnknownAPIFamily:
        # pass through unknown paths without capturing
        return await _passthrough(request, path)

    body_bytes = await request.body()
    try:
        body = json.loads(body_bytes) if body_bytes else {}
    except json.JSONDecodeError:
        body = {}

    request_id = str(uuid.uuid4())
    model = body.get("model", "unknown")
    is_streaming = body.get("stream", False)

    # capture request messages
    req_msgs = parse_request(body, api_family, request_id)
    for m in req_msgs:
        store.add(m)
        await broadcaster.publish(m)

    upstream = _upstream_base(api_family) + url_with_query
    headers = _forward_headers(request)

    if is_streaming:
        return StreamingResponse(
            _stream_forward(upstream, headers, body_bytes, api_family, model, request_id),
            media_type="text/event-stream",
        )
    else:
        return await _full_forward(upstream, headers, body_bytes, api_family, model, request_id)


async def _full_forward(
    upstream: str, headers: dict, body: bytes, api_family: str, model: str, request_id: str
) -> Response:
    if (urlparse(upstream).hostname or "").endswith(".api.aws"):
        body = _strip_aws_unsupported_body(body)
    headers, aws_signed, upstream = _sigv4_sign(upstream, body, headers)
    override_host = None if aws_signed else headers.get("host")
    async with _make_client(headers, override_host) as client:
        resp = await client.post(upstream, headers=headers, content=body)


    try:
        resp_body = resp.json()
    except Exception:
        resp_body = {}

    resp_model = resp_body.get("model", model)
    resp_msgs = parse_response(resp_body, api_family, resp_model, request_id)
    for m in resp_msgs:
        store.add(m)
        await broadcaster.publish(m)

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=dict(resp.headers),
        media_type=resp.headers.get("content-type"),
    )


async def _stream_forward(
    upstream: str, headers: dict, body: bytes, api_family: str, model: str, request_id: str
) -> AsyncGenerator[bytes, None]:
    buffer: list[str] = []
    if (urlparse(upstream).hostname or "").endswith(".api.aws"):
        body = _strip_aws_unsupported_body(body)
    headers, aws_signed, upstream = _sigv4_sign(upstream, body, headers)
    override_host = None if aws_signed else headers.get("host")
    async with _make_client(headers, override_host) as client:
        async with client.stream("POST", upstream, headers=headers, content=body) as resp:
            async for chunk in resp.aiter_text():
                yield chunk.encode()
                buffer.append(chunk)

    # assemble and capture response after stream ends
    assembled = assemble_stream(buffer, api_family)
    resp_model = assembled.get("model", model)
    resp_msgs = parse_response(assembled, api_family, resp_model, request_id)
    for m in resp_msgs:
        store.add(m)
        await broadcaster.publish(m)


async def handle_get_proxy(request: Request) -> Response:
    """Forward GET requests (e.g. /v1/models, /api/tags) to the upstream."""
    path = request.url.path
    query = str(request.url.query)
    url_with_query = path + (f"?{query}" if query else "")

    try:
        api_family = detect_api_family(path)
    except UnknownAPIFamily:
        api_family = "openai"

    upstream = _upstream_base(api_family) + url_with_query
    headers = _forward_headers(request)

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(upstream, headers=headers)

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers=dict(resp.headers),
        media_type=resp.headers.get("content-type"),
    )


async def _passthrough(request: Request, path: str) -> Response:
    return Response(content=b"Not proxied", status_code=404)

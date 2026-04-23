import asyncio
import json
from pathlib import Path

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from chatviz.proxy import handle_proxy, handle_get_proxy
from chatviz.store import store
from chatviz.sse import broadcaster


async def health(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


async def get_messages(request: Request) -> JSONResponse:
    return JSONResponse([m.to_dict() for m in store.all()])


async def clear_messages(request: Request) -> JSONResponse:
    store.clear()
    return JSONResponse({"cleared": True})


async def sse_stream(request: Request) -> StreamingResponse:
    q = broadcaster.connect()

    async def event_generator():
        # replay history first
        for m in store.all():
            yield f"event: message\ndata: {json.dumps(m.to_dict())}\n\n"
        # then stream live events
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"event: message\ndata: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.disconnect(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


STATIC_DIR = Path(__file__).parent / "static"

_proxy_routes = [
    Route("/v1/messages", handle_proxy, methods=["POST"]),
    Route("/v1/chat/completions", handle_proxy, methods=["POST"]),
    Route("/v1/models", handle_get_proxy, methods=["GET"]),
    Route("/api/chat", handle_proxy, methods=["POST"]),
    Route("/api/generate", handle_proxy, methods=["POST"]),
    Route("/api/tags", handle_get_proxy, methods=["GET"]),
]

_chatviz_routes = [
    Route("/chatviz/health", health),
    Route("/chatviz/events", sse_stream),
    Route("/chatviz/messages", get_messages),
    Route("/chatviz/clear", clear_messages, methods=["DELETE"]),
]

routes = _proxy_routes + _chatviz_routes

if STATIC_DIR.exists():
    routes.append(Mount("/", app=StaticFiles(directory=STATIC_DIR, html=True)))

app = Starlette(
    routes=routes,
    middleware=[
        Middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )
    ],
)

"""Parse LLM API request/response bodies into CapturedMessage instances."""
import json
import re
from chatviz.store import CapturedMessage


def _mcp_server_from_tool_name(name: str) -> str | None:
    # Anthropic MCP tool names: mcp__<server>__<tool>
    m = re.match(r"^mcp__([^_]+(?:_[^_]+)*)__", name)
    return m.group(1) if m else None


def parse_request(body: dict, api_family: str, request_id: str) -> list[CapturedMessage]:
    msgs: list[CapturedMessage] = []
    model = body.get("model", "unknown")
    now = CapturedMessage.now()

    def last_non_system(messages: list) -> dict | None:
        for m in reversed(messages):
            if m.get("role") != "system":
                return m
        return None

    if api_family == "anthropic":
        # Only emit the last (newest) turn — full history lives in raw_body for the detail panel
        last = last_non_system(body.get("messages", []))
        if last:
            role = last.get("role", "user")
            content = last.get("content", "")
            if role == "assistant":
                # Assistant turn may contain text + tool_use blocks — emit each block separately
                blocks = content if isinstance(content, list) else [{"type": "text", "text": content}]
                for block in blocks:
                    btype = block.get("type", "text") if isinstance(block, dict) else "text"
                    # Skip empty text blocks (model sometimes emits blank text alongside tool_use)
                    if btype == "text" and not (block.get("text") or "").strip():
                        continue
                    bname = block.get("name", "") if btype == "tool_use" else ""
                    msgs.append(CapturedMessage(
                        id=CapturedMessage.make_id(), timestamp=now, api_family=api_family,
                        model=model, direction="request",
                        message_type="tool_use" if btype == "tool_use" else "assistant",
                        content=block, mcp_server=_mcp_server_from_tool_name(bname) if bname else None,
                        stream_complete=True, request_id=request_id, raw_body=body,
                    ))
            else:
                # User turn: may be plain text or tool_result block(s)
                blocks = content if isinstance(content, list) else []
                is_tool_result = any(
                    isinstance(b, dict) and b.get("type") == "tool_result" for b in blocks
                )
                if is_tool_result:
                    for block in blocks:
                        if isinstance(block, dict) and block.get("type") == "tool_result":
                            msgs.append(CapturedMessage(
                                id=CapturedMessage.make_id(), timestamp=now, api_family=api_family,
                                model=model, direction="request", message_type="tool_result",
                                content=block.get("content", ""), mcp_server=None,
                                stream_complete=True, request_id=request_id, raw_body=body,
                                tool_use_id=block.get("tool_use_id"),
                            ))
                else:
                    msgs.append(CapturedMessage(
                        id=CapturedMessage.make_id(), timestamp=now, api_family=api_family,
                        model=model, direction="request", message_type="user",
                        content=content, mcp_server=None, stream_complete=True,
                        request_id=request_id, raw_body=body,
                    ))

    elif api_family == "openai":
        last = last_non_system(body.get("messages", []))
        if last:
            role = last.get("role", "user")
            msg_type = {"user": "user", "assistant": "assistant", "tool": "tool_result"}.get(role, "user")
            msgs.append(CapturedMessage(
                id=CapturedMessage.make_id(), timestamp=now, api_family=api_family,
                model=model, direction="request", message_type=msg_type,
                content=last.get("content", ""), mcp_server=None, stream_complete=True,
                request_id=request_id, raw_body=body,
            ))

    elif api_family == "ollama":
        last = last_non_system(body.get("messages", []))
        if last:
            role = last.get("role", "user")
            msg_type = {"user": "user", "assistant": "assistant"}.get(role, "user")
            msgs.append(CapturedMessage(
                id=CapturedMessage.make_id(), timestamp=now, api_family=api_family,
                model=model, direction="request", message_type=msg_type,
                content=last.get("content", ""), mcp_server=None, stream_complete=True,
                request_id=request_id, raw_body=body,
            ))

    return msgs


def parse_response(body: dict, api_family: str, model: str, request_id: str) -> list[CapturedMessage]:
    msgs: list[CapturedMessage] = []
    now = CapturedMessage.now()

    # Extract actual token counts from API usage field
    usage = body.get("usage", {})
    input_tokens: int | None = usage.get("input_tokens") or usage.get("prompt_tokens") or None
    output_tokens: int | None = usage.get("output_tokens") or usage.get("completion_tokens") or None

    if api_family == "anthropic":
        for block in body.get("content", []):
            block_type = block.get("type", "text")
            # Skip text blocks that are empty/whitespace-only
            if block_type == "text" and not block.get("text", "").strip():
                continue
            msg_type = "tool_use" if block_type == "tool_use" else "assistant"
            name = block.get("name", "") if block_type == "tool_use" else ""
            msgs.append(CapturedMessage(
                id=CapturedMessage.make_id(), timestamp=now, api_family=api_family,
                model=model, direction="response", message_type=msg_type,
                content=block, mcp_server=_mcp_server_from_tool_name(name) if name else None,
                stream_complete=True, request_id=request_id, raw_body=body,
                input_tokens=input_tokens, output_tokens=output_tokens,
            ))

    elif api_family == "openai":
        choice = body.get("choices", [{}])[0]
        message = choice.get("message", {})
        msg_type = "tool_use" if message.get("tool_calls") else "assistant"
        msgs.append(CapturedMessage(
            id=CapturedMessage.make_id(), timestamp=now, api_family=api_family,
            model=model, direction="response", message_type=msg_type,
            content=message.get("content") or message.get("tool_calls", ""),
            mcp_server=None, stream_complete=True,
            request_id=request_id, raw_body=body,
            input_tokens=input_tokens, output_tokens=output_tokens,
        ))

    elif api_family == "ollama":
        message = body.get("message", {})
        msgs.append(CapturedMessage(
            id=CapturedMessage.make_id(), timestamp=now, api_family=api_family,
            model=model, direction="response", message_type="assistant",
            content=message.get("content", ""), mcp_server=None, stream_complete=True,
            request_id=request_id, raw_body=body,
            input_tokens=input_tokens, output_tokens=output_tokens,
        ))

    return msgs


def assemble_anthropic_stream(chunks: list[str]) -> dict:
    """Reconstruct a full Anthropic response dict from SSE stream chunks."""
    assembled: dict = {"content": [], "model": "unknown", "stop_reason": None}
    current_block: dict | None = None

    for chunk in chunks:
        for line in chunk.splitlines():
            if not line.startswith("data:"):
                continue
            raw = line[5:].strip()
            if not raw or raw == "[DONE]":
                continue
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue

            t = event.get("type", "")
            if t == "message_start":
                msg = event.get("message", {})
                assembled["model"] = msg.get("model", "unknown")
            elif t == "content_block_start":
                current_block = event.get("content_block", {})
            elif t == "content_block_delta":
                delta = event.get("delta", {})
                if current_block is not None:
                    if delta.get("type") == "text_delta":
                        current_block["text"] = current_block.get("text", "") + delta.get("text", "")
                    elif delta.get("type") == "input_json_delta":
                        # Accumulate as string; only concat if not already a parsed dict
                        existing = current_block.get("input", "")
                        if isinstance(existing, dict):
                            existing = ""
                        current_block["input"] = existing + delta.get("partial_json", "")
            elif t == "content_block_stop":
                if current_block is not None:
                    if "input" in current_block and isinstance(current_block["input"], str):
                        try:
                            current_block["input"] = json.loads(current_block["input"])
                        except json.JSONDecodeError:
                            pass
                    assembled["content"].append(current_block)
                    current_block = None
            elif t == "message_delta":
                delta = event.get("delta", {})
                assembled["stop_reason"] = delta.get("stop_reason")
                usage = event.get("usage", {})
                if usage:
                    assembled.setdefault("usage", {}).update(usage)

    return assembled


def assemble_openai_stream(chunks: list[str]) -> dict:
    """Reconstruct a full OpenAI response dict from SSE stream chunks."""
    content = ""
    model = "unknown"
    tool_calls: list = []

    for chunk in chunks:
        for line in chunk.splitlines():
            if not line.startswith("data:"):
                continue
            raw = line[5:].strip()
            if not raw or raw == "[DONE]":
                continue
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue

            model = event.get("model", model)
            delta = event.get("choices", [{}])[0].get("delta", {})
            content += delta.get("content") or ""
            for tc in delta.get("tool_calls", []):
                idx = tc.get("index", 0)
                while len(tool_calls) <= idx:
                    tool_calls.append({"function": {"arguments": ""}})
                tool_calls[idx]["function"]["arguments"] += tc.get("function", {}).get("arguments", "")

    return {
        "model": model,
        "choices": [{"message": {"role": "assistant", "content": content, "tool_calls": tool_calls or None}}],
    }


def assemble_ollama_stream(chunks: list[str]) -> dict:
    content = ""
    model = "unknown"
    for chunk in chunks:
        for line in chunk.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                model = event.get("model", model)
                content += event.get("message", {}).get("content", "")
            except json.JSONDecodeError:
                continue
    return {"model": model, "message": {"role": "assistant", "content": content}}


def assemble_stream(chunks: list[str], api_family: str) -> dict:
    if api_family == "anthropic":
        return assemble_anthropic_stream(chunks)
    if api_family == "openai":
        return assemble_openai_stream(chunks)
    return assemble_ollama_stream(chunks)

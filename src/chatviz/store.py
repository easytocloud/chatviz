import threading
from collections import deque
from dataclasses import dataclass, asdict, field
from typing import Any
import time
import uuid


@dataclass
class CapturedMessage:
    id: str
    timestamp: float
    api_family: str
    model: str
    direction: str          # "request" | "response"
    message_type: str       # "system" | "user" | "assistant" | "tool_use" | "tool_result"
    content: Any
    mcp_server: str | None
    stream_complete: bool
    request_id: str
    raw_body: dict = field(default_factory=dict)
    input_tokens: int | None = None
    output_tokens: int | None = None
    tool_use_id: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def make_id() -> str:
        return str(uuid.uuid4())

    @staticmethod
    def now() -> float:
        return time.time() * 1000


class MessageStore:
    def __init__(self, maxlen: int = 1000) -> None:
        self._messages: deque[CapturedMessage] = deque(maxlen=maxlen)
        self._lock = threading.Lock()
        self._listeners: list = []

    def add(self, msg: CapturedMessage) -> None:
        with self._lock:
            self._messages.append(msg)

    def all(self) -> list[CapturedMessage]:
        with self._lock:
            return list(self._messages)

    def clear(self) -> None:
        with self._lock:
            self._messages.clear()


store = MessageStore()

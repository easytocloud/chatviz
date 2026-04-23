import asyncio
import json
from chatviz.store import CapturedMessage


class SSEBroadcaster:
    def __init__(self) -> None:
        self._queues: list[asyncio.Queue] = []

    def connect(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._queues.append(q)
        return q

    def disconnect(self, q: asyncio.Queue) -> None:
        try:
            self._queues.remove(q)
        except ValueError:
            pass

    async def publish(self, msg: CapturedMessage) -> None:
        data = json.dumps(msg.to_dict())
        dead = []
        for q in self._queues:
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.disconnect(q)


broadcaster = SSEBroadcaster()

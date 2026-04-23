class UnknownAPIFamily(Exception):
    pass


def detect_api_family(path: str) -> str:
    if path.startswith("/v1/messages"):
        return "anthropic"
    if path.startswith("/v1/chat/completions"):
        return "openai"
    if path.startswith("/api/chat") or path.startswith("/api/generate"):
        return "ollama"
    raise UnknownAPIFamily(path)

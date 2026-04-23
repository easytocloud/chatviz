import os
import subprocess
import sys
import threading

import uvicorn


def main() -> None:
    args = sys.argv[1:]

    # parse our flags, collect remainder for subcommand
    port = 7890
    upstream = None
    profile = None
    subcommand = []

    i = 0
    while i < len(args):
        if args[i] == "--port" and i + 1 < len(args):
            port = int(args[i + 1])
            i += 2
        elif args[i] == "--upstream" and i + 1 < len(args):
            upstream = args[i + 1]
            i += 2
        elif args[i] == "--profile" and i + 1 < len(args):
            profile = args[i + 1]
            i += 2
        else:
            subcommand = args[i:]
            break

    if upstream:
        os.environ["CHATVIZ_UPSTREAM"] = upstream
    if profile:
        os.environ["CHATVIZ_AWS_PROFILE"] = profile

    if subcommand:
        _run_with_subcommand(port, subcommand)
    else:
        _print_banner(port)
        uvicorn.run("chatviz.server:app", host="0.0.0.0", port=port, log_level="info")


def _run_with_subcommand(port: int, subcommand: list[str]) -> None:
    base_url = f"http://127.0.0.1:{port}"

    # detect which agent and set the right env var
    cmd = subcommand[0]
    env = os.environ.copy()

    if cmd == "claude":
        env["ANTHROPIC_BASE_URL"] = base_url
        # keep claude from trying to sign — proxy handles auth
        env.setdefault("ANTHROPIC_API_KEY", "chatviz-proxy")
        env["CLAUDE_CODE_SKIP_BEDROCK_AUTH"] = "1"
        env["CLAUDE_CODE_SKIP_MANTLE_AUTH"] = "1"
    else:
        # generic: set common base url vars and let the subcommand figure it out
        env["OPENAI_BASE_URL"] = base_url
        env["ANTHROPIC_BASE_URL"] = base_url

    _print_banner(port)

    # redirect our stdout/stderr to log file before starting the server
    log_file = open("chatviz.log", "w")
    sys.stdout = log_file
    sys.stderr = log_file

    # start uvicorn in a background thread
    server = uvicorn.Server(
        uvicorn.Config("chatviz.server:app", host="0.0.0.0", port=port, log_level="info")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    # wait for server to be ready
    import time
    import urllib.request
    for _ in range(50):
        try:
            urllib.request.urlopen(f"{base_url}/chatviz/health", timeout=1)
            break
        except Exception:
            time.sleep(0.1)

    try:
        result = subprocess.run(subcommand, env=env)
        sys.exit(result.returncode)
    finally:
        server.should_exit = True


def _print_banner(port: int) -> None:
    print(f"# chatviz listening on http://0.0.0.0:{port}")
    print(f"# Open http://localhost:{port}")
    upstream = os.environ.get("CHATVIZ_UPSTREAM", "not set (pass-through to Anthropic/OpenAI/Ollama)")
    print(f"# Upstream: {upstream}")


if __name__ == "__main__":
    main()

import os
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error

import uvicorn


def _find_claude_base_url_setting() -> tuple[str, str] | tuple[None, None]:
    """Scan Claude settings files for a *BASE_URL env var.

    Returns (var_name, url) of the first match, or (None, None).
    Checks local settings first, then global ~/.claude/settings.json.
    """
    import json
    candidates = [
        os.path.join(".claude", "settings.local.json"),
        os.path.join(".claude", "settings.json"),
        os.path.expanduser("~/.claude/settings.local.json"),
        os.path.expanduser("~/.claude/settings.json"),
    ]
    for path in candidates:
        try:
            with open(path) as f:
                data = json.load(f)
            env_section = data.get("env", {})
            for key, val in env_section.items():
                if key.endswith("BASE_URL") and val:
                    return key, val
        except (FileNotFoundError, json.JSONDecodeError, PermissionError):
            continue
    return None, None


def main() -> None:
    args = sys.argv[1:]

    # parse our flags, collect remainder for subcommand
    port = 7890
    upstream = None
    profile = None
    force = False
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
        elif args[i] == "--force":
            force = True
            i += 1
        elif args[i] == "--version":
            from chatviz import __version__
            print(f"chatviz {__version__}")
            sys.exit(0)
        else:
            subcommand = args[i:]
            break

    if upstream:
        os.environ["CHATVIZ_UPSTREAM"] = upstream
    if profile:
        os.environ["CHATVIZ_AWS_PROFILE"] = profile

    if subcommand:
        _run_with_subcommand(port, subcommand, force=force)
    else:
        _print_banner(port)
        uvicorn.run("chatviz.server:app", host="0.0.0.0", port=port, log_level="info")


def _check_upstream_compatibility(upstream: str) -> bool:
    """Return True if the upstream speaks the Anthropic Messages API."""
    import json
    url = upstream.rstrip("/") + "/v1/messages"
    body = json.dumps({
        "model": "chatviz-probe",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}],
    }).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json", "x-api-key": "probe"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
        return True
    except urllib.error.HTTPError as e:
        # any HTTP response (even 401/400/404 with JSON body) means the endpoint exists
        try:
            body = e.read()
            import json as _json
            _json.loads(body)
            # got a JSON error back — endpoint exists and speaks JSON
            return e.code != 404
        except Exception:
            return False
    except Exception:
        return False


def _run_with_subcommand(port: int, subcommand: list[str], force: bool = False) -> None:
    base_url = f"http://127.0.0.1:{port}"

    # detect which agent and set the right env var
    cmd = subcommand[0]
    env = os.environ.copy()

    if cmd == "claude":
        # discover *BASE_URL from Claude settings if --upstream not given
        base_url_var, upstream_from_settings = _find_claude_base_url_setting()
        if base_url_var and not os.environ.get("CHATVIZ_UPSTREAM"):
            os.environ["CHATVIZ_UPSTREAM"] = upstream_from_settings
            env["CHATVIZ_UPSTREAM"] = upstream_from_settings
            # redirect the same variable name to our proxy
            env[base_url_var] = base_url
        else:
            env["ANTHROPIC_BASE_URL"] = base_url
        # keep claude from trying to sign — proxy handles auth
        env.setdefault("ANTHROPIC_API_KEY", "chatviz-proxy")
        env["CLAUDE_CODE_SKIP_BEDROCK_AUTH"] = "1"
        env["CLAUDE_CODE_SKIP_MANTLE_AUTH"] = "1"
    else:
        # generic: set common base url vars and let the subcommand figure it out
        env["OPENAI_BASE_URL"] = base_url
        env["ANTHROPIC_BASE_URL"] = base_url

    # check upstream compatibility before starting
    upstream = os.environ.get("CHATVIZ_UPSTREAM")
    if upstream and not force:
        if not _check_upstream_compatibility(upstream):
            print(f"# WARNING: upstream {upstream} does not appear to speak the Anthropic Messages API (/v1/messages).")
            print("# Responses from this upstream may not be captured correctly.")
            print("# Pass --force to suppress this warning and start anyway.")
            sys.exit(1)

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

# chatviz

Real-time visualization of AI agent conversations. chatviz sits between your agent and its LLM, capturing every message and rendering it live in a browser.

## Install

```sh
uvx chatviz          # run directly, no install needed
pip install chatviz  # or install persistently
```

## Two modes of operation

### Standalone proxy

You run chatviz separately, then point your agent at it.

```
┌─────────┐   Anthropic API    ┌─────────┐   Anthropic API    ┌──────────────┐
│  Agent  │ ─────────────────► │ chatviz │ ─────────────────► │  LLM (upstream)│
└─────────┘                    └────┬────┘                    └──────────────┘
                                    │ SSE
                                    ▼
                              ┌───────────┐
                              │  Browser  │
                              │ :7890     │
                              └───────────┘
```

Start chatviz:

```sh
uvx chatviz [--port 7890] [--upstream URL] [--profile AWS_PROFILE]
```

Then configure your agent to use `http://localhost:7890` as its base URL. For Claude Code:

```sh
export ANTHROPIC_BASE_URL=http://localhost:7890
export ANTHROPIC_API_KEY=any-value   # chatviz ignores it
claude
```

Open `http://localhost:7890` in a browser to watch the conversation.

---

### Inline — chatviz launches your agent

chatviz starts the proxy, then launches your agent as a subprocess with the right environment already set.

```
                              ┌─────────────────────────────────┐
                              │           chatviz               │
                              │                                 │
┌─────────┐  spawns + env    │  ┌────────────┐                 │
│ terminal│ ───────────────► │  │   Agent    │                 │
└─────────┘                  │  └─────┬──────┘                 │
                              │        │ Anthropic API          │
                              │        ▼                        │
                              │  ┌─────────────┐   upstream    │
                              │  │ proxy :7890 │ ────────────► │ LLM
                              │  └──────┬──────┘               │
                              │         │ SSE                   │
                              └─────────┼───────────────────────┘
                                        ▼
                                  ┌───────────┐
                                  │  Browser  │
                                  │ :7890     │
                                  └───────────┘
```

Start chatviz and Claude Code together:

```sh
uvx chatviz claude
```

With options:

```sh
uvx chatviz --port 7890 --upstream https://bedrock-mantle.eu-west-1.api.aws/anthropic --profile MyProfile claude
```

- The proxy server logs go to `chatviz.log` in the current directory.
- Claude's own output appears in the terminal as normal.
- chatviz checks that the upstream speaks the Anthropic Messages API before starting. Pass `--force` to skip this check.

---

## Options

| Flag | Default | Description |
|---|---|---|
| `--port PORT` | `7890` | Port to listen on |
| `--upstream URL` | env `CHATVIZ_UPSTREAM` | Override upstream LLM endpoint |
| `--profile NAME` | env `CHATVIZ_AWS_PROFILE` | AWS profile for Bedrock Mantle signing |
| `--force` | off | Skip upstream compatibility check |

## Environment variables

| Variable | Description |
|---|---|
| `CHATVIZ_UPSTREAM` | Upstream LLM base URL (default: pass requests through to Anthropic/OpenAI/Ollama) |
| `CHATVIZ_AWS_PROFILE` | AWS named profile for SigV4 signing when upstream is `*.api.aws` |

## AWS Bedrock Mantle

See [docs/bedrock.md](docs/bedrock.md) for full setup instructions.

```sh
uvx chatviz --upstream https://bedrock-mantle.eu-west-1.api.aws/anthropic --profile MyProfile claude
```

## Visualization

Open `http://localhost:7890` while a conversation is running.

- **Color-coded messages** by role: system prompt, user, assistant, tool calls, and tool results each have distinct colors. Each message is tagged with the API family and model used.
- **Token counter** — the header shows cumulative input/output token totals across all captured messages (e.g. `↑12.3k ↓4.1k tokens`).
- **Sequence view** — when tool calls are present the UI automatically switches to a timeline/sequence layout showing the full call-and-result chain. Pure chat sessions use the standard chat bubble view.
- **Detail panel** — click any message to open a side panel with full content, metadata, and the raw request body. Tool call panels show the tool name, input arguments, and the matching result in a structured layout.
- **JSON modal** — double-click any message bubble to open a full-screen folding JSON viewer with collapsible nodes and path highlighting. Press Escape or click outside to close.

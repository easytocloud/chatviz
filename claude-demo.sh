#!/usr/bin/env bash

ANTHROPIC_BASE_URL="http://localhost:7890" \
ANTHROPIC_AUTH_TOKEN="local" \
ANTHROPIC_DEFAULT_SONNET_MODEL="qwen/qwen3-coder-next" \
ANTHROPIC_DEFAULT_HAIKU_MODEL="unsloth/nemotron-3-nano-30b-a3b" \
ANTHROPIC_DEFAULT_OPUS_MODEL="qwen/qwen3-coder-next" \
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1" \
DISABLE_AUTOUPDATER="1" \
uv run chatviz --upstream http://localhost:1234 claude

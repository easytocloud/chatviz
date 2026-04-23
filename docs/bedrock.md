# Using chatviz with AWS Bedrock (Mantle)

chatviz can proxy requests to AWS Bedrock via the Mantle endpoint, which exposes the native Anthropic Messages API. The proxy handles SigV4 request signing transparently, so your agent needs no AWS credentials or special configuration.

## How it works

1. Your agent sends standard Anthropic API requests to the local chatviz proxy.
2. chatviz strips Anthropic-only fields that Bedrock Mantle rejects (`betas`, `output_config`, `anthropic-beta` header, `?beta=true` query param).
3. chatviz signs the request with SigV4 using your local AWS credentials and forwards it to the Bedrock Mantle endpoint.

## Prerequisites

- An AWS account with access to the Bedrock Mantle endpoint in your region.
- AWS credentials configured locally (IAM, SSO, or assume-role profile).
- `boto3` installed — it is included in chatviz's dependencies.

## Starting chatviz

```sh
export CHATVIZ_UPSTREAM=https://bedrock-mantle.<region>.api.aws/anthropic
export CHATVIZ_AWS_PROFILE=<your-aws-profile>   # omit to use the default credential chain

python -m chatviz
```

Example for `eu-west-1`:

```sh
export CHATVIZ_UPSTREAM=https://bedrock-mantle.eu-west-1.api.aws/anthropic
export CHATVIZ_AWS_PROFILE=MyBedrockProfile
python -m chatviz
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `CHATVIZ_UPSTREAM` | Yes | Full base URL of the upstream, including the `/anthropic` path prefix. |
| `CHATVIZ_AWS_PROFILE` | No | AWS named profile to use for signing. Defaults to the standard AWS credential chain (env vars, `~/.aws/credentials`, instance role, etc.). |

## Configuring Claude Code

When using [Claude Code](https://docs.anthropic.com/en/docs/claude-code) as your agent, add the following to your `.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_USE_MANTLE": "1",
    "CLAUDE_CODE_SKIP_MANTLE_AUTH": "1",
    "ANTHROPIC_BEDROCK_MANTLE_BASE_URL": "http://127.0.0.1:7890",
    "AWS_REGION": "<region>",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "<model-id>",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "<model-id>",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "<model-id>",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  }
}
```

- `CLAUDE_CODE_USE_MANTLE=1` — routes Claude Code to the Mantle endpoint (Anthropic Messages API shape).
- `CLAUDE_CODE_SKIP_MANTLE_AUTH=1` — tells Claude Code not to sign requests; the proxy handles signing.
- `ANTHROPIC_BEDROCK_MANTLE_BASE_URL` — points Claude Code at the local chatviz proxy instead of the real Mantle endpoint.
- Model IDs must match what is available on your Mantle deployment. Use `GET /v1/models` (signed) to list them.

### Listing available models

```sh
python - <<'EOF'
import urllib.request, json, boto3, botocore.auth, botocore.awsrequest, os

profile = os.environ.get("CHATVIZ_AWS_PROFILE")
session = boto3.Session(profile_name=profile) if profile else boto3.Session()
creds = session.get_credentials().get_frozen_credentials()

url = "https://bedrock-mantle.eu-west-1.api.aws/v1/models"
aws_req = botocore.awsrequest.AWSRequest(method="GET", url=url, headers={"Content-Type": "application/json"})
botocore.auth.SigV4Auth(creds, "bedrock-mantle", "eu-west-1").add_auth(aws_req)
req = urllib.request.Request(url, headers=dict(aws_req.headers), method="GET")
with urllib.request.urlopen(req) as resp:
    for m in json.loads(resp.read())["data"]:
        print(m["id"])
EOF
```

## Notes

- Bedrock Mantle uses the **OpenAI API** as its primary interface (`/v1/chat/completions`). The `/anthropic/v1/messages` path is a secondary surface that accepts the native Anthropic Messages API format, which is what chatviz uses.
- Fields introduced in newer versions of the Anthropic API (such as `betas` and `output_config`) may not be supported by Bedrock Mantle. chatviz strips these automatically.
- SigV4 credentials are refreshed automatically per request via boto3's credential provider chain, so short-lived STS tokens (SSO, assume-role) are handled correctly.

"""Quick test: sign a minimal request to Bedrock Mantle and print the response."""
import json
import os
import urllib.request

import boto3
import botocore.auth
import botocore.awsrequest

UPSTREAM = os.environ.get("CHATVIZ_UPSTREAM", "https://bedrock-mantle.eu-west-1.api.aws/anthropic")
PROFILE = os.environ.get("CHATVIZ_AWS_PROFILE")

url = UPSTREAM.rstrip("/") + "/v1/messages"
body = json.dumps({
    "model": "eu.anthropic.claude-haiku-4-5-20251001-v1:0",
    "max_tokens": 16,
    "messages": [{"role": "user", "content": "hi"}],
}).encode()

session = boto3.Session(profile_name=PROFILE) if PROFILE else boto3.Session()
creds = session.get_credentials().get_frozen_credentials()

print(f"Using profile : {PROFILE!r}")
print(f"Access key ID : {creds.access_key[:8]}...")
print(f"POST {url}")

aws_req = botocore.awsrequest.AWSRequest(
    method="POST",
    url=url,
    data=body,
    headers={"Content-Type": "application/json"},
)
from urllib.parse import urlparse
host = urlparse(url).hostname
parts = host.split(".")
service, region = parts[0], parts[1]
print(f"Service: {service}  Region: {region}")

botocore.auth.SigV4Auth(creds, service, region).add_auth(aws_req)

req = urllib.request.Request(url, data=body, headers=dict(aws_req.headers), method="POST")
try:
    with urllib.request.urlopen(req) as resp:
        print(f"Status: {resp.status}")
        print(resp.read().decode())
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.reason}")
    print(e.read().decode())

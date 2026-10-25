"""
Smoke-test the active Shield AI provider (Vertex or Bedrock).

Usage (from backend/ with the venv active):
    python -m app.scripts.test_ai_provider
    python -m app.scripts.test_ai_provider --prompt "Reply with the word ok"
"""

from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke-test Shield AI via the active provider")
    parser.add_argument(
        "--prompt",
        default="Reply with exactly: vertex-ok",
        help="User prompt to send",
    )
    args = parser.parse_args()

    from app.core.config import settings
    from app.services.shield_ai_service import ShieldAIError, converse

    print(f"AI_PROVIDER     = {settings.ai_provider}")
    print(f"configured      = {settings.ai_configured}")
    print(f"model           = {settings.ai_model_id or '(none)'}")
    print(f"region/location = {settings.ai_region}")
    if settings.ai_provider == "vertex":
        print(f"project         = {settings.GOOGLE_CLOUD_PROJECT or '(none)'}")

    if not settings.ai_configured:
        print(
            "\nShield AI is not configured.\n"
            "  Vertex:  set GOOGLE_CLOUD_PROJECT and run "
            "`gcloud auth application-default login`\n"
            "  Bedrock: set BEDROCK_MODEL_ID and AWS credentials\n",
            file=sys.stderr,
        )
        return 1

    try:
        reply = converse(
            [{"role": "user", "content": args.prompt}],
            system="You are a connectivity probe. Answer in one short line.",
            max_tokens=64,
            temperature=0.0,
        )
    except ShieldAIError as exc:
        print(f"\nFAILED: {exc}", file=sys.stderr)
        return 1

    print(f"\nOK - model replied:\n{reply}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

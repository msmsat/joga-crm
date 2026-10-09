"""Offline SMTP configuration presence check. Never display secret values."""
import os
import sys

required = ("SMTP_HOST", "SMTP_USER", "SMTP_PASS")
missing = [name for name in required if not os.getenv(name, "").strip()]
if missing:
    print("Release blocked: email sign-in SMTP configuration missing: " + ", ".join(missing), file=sys.stderr)
    raise SystemExit(1)
try:
    port = int(os.getenv("SMTP_PORT", "587"))
    if not 1 <= port <= 65535:
        raise ValueError
except ValueError:
    raise SystemExit("Release blocked: SMTP_PORT must be between 1 and 65535")
print("Email sign-in SMTP configuration present (provider delivery is not checked).")

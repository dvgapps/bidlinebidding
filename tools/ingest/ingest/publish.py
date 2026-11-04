"""Upload a finished package JSON to your Cloudflare Worker so the iPad can download it.

    python -m ingest.publish --server https://bidline-api.<you>.workers.dev data/2701.json

The passphrase is read from the BIDLINE_PASSPHRASE environment variable or typed at a hidden prompt; it is never
written to a file. Only the package JSON is uploaded (not the PDFs, not your employee id).
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Cloudflare blocks the default Python user agent on some zones, so identify ourselves.
USER_AGENT = "bidline-ingest/1.0"


class PublishError(RuntimeError):
    pass


def _request(url: str, method: str, body: bytes | None, token: str | None = None, timeout: int = 120) -> dict:
    headers = {"User-Agent": USER_AGENT, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.loads(e.read().decode("utf-8")).get("error", "")
        except Exception:  # noqa: BLE001 - best effort message
            pass
        raise PublishError(f"{method} {url.split('?')[0]} failed: HTTP {e.code} {detail}".strip()) from e
    except urllib.error.URLError as e:
        raise PublishError(f"cannot reach {url}: {e.reason}") from e


def publish(bundle_path: str | Path, server: str, passphrase: str | None = None) -> dict:
    """Log in and upload the bundle. Returns the server's answer (id, lines, trips, bytes...)."""
    server = server.strip().rstrip("/")
    if not server.startswith(("https://", "http://")):
        raise PublishError("the server address must start with https://")
    data = Path(bundle_path).read_bytes()
    try:
        b = json.loads(data.decode("utf-8"))
        bid = b["bidPeriod"]["id"]
        assert b["schema"] == 1 and isinstance(b["lines"], list) and isinstance(b["trips"], list)
    except Exception as e:  # noqa: BLE001
        raise PublishError(f"{bundle_path} is not a Bidline Bidding package (schema 1)") from e
    if os.environ.get("BIDLINE_REQUIRE_CLEAN_CHECKS", "1") == "1" and b.get("checks", {}).get("problems", 0):
        raise PublishError("this package has failed cross-checks; fix the ingest first (or set BIDLINE_REQUIRE_CLEAN_CHECKS=0)")
    pw = passphrase or os.environ.get("BIDLINE_PASSPHRASE") or getpass.getpass("Worker passphrase: ")
    login = _request(f"{server}/api/login", "POST", json.dumps({"passphrase": pw}).encode())
    return _request(f"{server}/api/package/{bid}", "PUT", data, token=login["token"])


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m ingest.publish", description=__doc__)
    ap.add_argument("bundle", help="package JSON written by `python -m ingest`")
    ap.add_argument("--server", required=True, help="your Worker address, e.g. https://bidline-api.<you>.workers.dev")
    a = ap.parse_args(argv)
    try:
        r = publish(a.bundle, a.server)
    except PublishError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    print(f"Published bid {r['id']}: {r['lines']} lines, {r['trips']} trips, {r['bytes'] / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())

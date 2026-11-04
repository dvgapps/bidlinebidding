"""publish() against a tiny fake Worker (no network)."""
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from ingest.publish import PublishError, publish


class Fake(BaseHTTPRequestHandler):
    seen: list = []

    def log_message(self, *a):  # silence
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n))
        Fake.seen.append(("login", self.headers.get("User-Agent")))
        if body.get("passphrase") == "right":
            self._send(200, {"token": "tok123", "expires": 1})
        else:
            self._send(401, {"error": "Wrong passphrase"})

    def do_PUT(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n)
        Fake.seen.append(("put", self.path, self.headers.get("Authorization"), self.headers.get("User-Agent")))
        if self.headers.get("Authorization") != "Bearer tok123":
            return self._send(401, {"error": "Not signed in"})
        b = json.loads(raw)
        self._send(200, {"stored": True, "id": b["bidPeriod"]["id"], "lines": len(b["lines"]), "trips": len(b["trips"]), "bytes": len(raw)})


@pytest.fixture()
def server():
    Fake.seen = []
    s = HTTPServer(("127.0.0.1", 0), Fake)
    t = threading.Thread(target=s.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{s.server_address[1]}"
    s.shutdown()


def _bundle(tmp_path, **over):
    b = {"schema": 1, "bidPeriod": {"id": "2701"}, "lines": [{}, {}], "trips": [{}], "checks": {"problems": 0}}
    b.update(over)
    p = tmp_path / "2701.json"
    p.write_text(json.dumps(b), encoding="utf8")
    return p


def test_logs_in_then_uploads_with_token_and_own_user_agent(server, tmp_path):
    r = publish(_bundle(tmp_path), server, passphrase="right")
    assert r == {"stored": True, "id": "2701", "lines": 2, "trips": 1, "bytes": r["bytes"]}
    assert Fake.seen[0] == ("login", "bidline-ingest/1.0")
    assert Fake.seen[1][:3] == ("put", "/api/package/2701", "Bearer tok123")
    assert Fake.seen[1][3] == "bidline-ingest/1.0"


def test_wrong_passphrase_is_a_clear_error(server, tmp_path):
    with pytest.raises(PublishError, match="401 Wrong passphrase"):
        publish(_bundle(tmp_path), server, passphrase="nope")


def test_refuses_non_packages_and_failed_checks(server, tmp_path):
    bad = tmp_path / "x.json"
    bad.write_text('{"hello": 1}', encoding="utf8")
    with pytest.raises(PublishError, match="not a Bidline Bidding package"):
        publish(bad, server, passphrase="right")
    with pytest.raises(PublishError, match="failed cross-checks"):
        publish(_bundle(tmp_path, checks={"problems": 3}), server, passphrase="right")
    with pytest.raises(PublishError, match="must start with https"):
        publish(_bundle(tmp_path), "bidline.example.com", passphrase="right")

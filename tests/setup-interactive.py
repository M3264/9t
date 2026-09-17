"""Exercise the real terminal wizard, hidden password entry, and cancellation.

Run on Linux/macOS: python3 tests/setup-interactive.py
No dependencies or services are installed by this test.
"""
import json
import os
import pathlib
import pty
import select
import shutil
import subprocess
import tempfile
import time

source = pathlib.Path(__file__).resolve().parents[1]
fixture = tempfile.mkdtemp(prefix="9t-prompt-test-")
master, slave = pty.openpty()
script = (
    "import {setup} from " + json.dumps((source / "scripts/setup.mjs").as_uri())
    + "; await setup([], " + json.dumps(fixture) + ");"
)
env = dict(os.environ)
for key in ("PORT", "NINE_T_HOST", "NINE_T_DATA_DIR", "NINE_T_BUILD_DIR", "NINE_T_ADMIN_PASSWORD"):
    env.pop(key, None)
process = subprocess.Popen(["node", "--input-type=module", "-e", script],
                           stdin=slave, stdout=slave, stderr=slave, env=env)
os.close(slave)
transcript = b""
pending = b""


def expect(label):
    global transcript, pending
    target = label.encode()
    deadline = time.monotonic() + 15
    while target not in pending:
        if time.monotonic() > deadline:
            raise AssertionError("Wizard did not reach: " + label)
        if select.select([master], [], [], 0.2)[0]:
            chunk = os.read(master, 65536)
            transcript += chunk
            pending += chunk
    pending = pending.split(target, 1)[1]


try:
    for label, answer in [
        ("Access:", "local"),
        ("Listen on port", "43321"),
        ("Text and code snippets", "y"),
        ("File transfers", "y"),
        ("Saved links", "n"),
        ("Board (", "n"),
        ("Appearance", "dark"),
        ("Maximum upload size", "23"),
        ("Keep trashed items", "2"),
        ("Data folder", ""),
        ("Administrator username", "test-owner"),
        ("Administrator password (hidden):", "secret-prompt-fixture-9t"),
        ("Confirm password (hidden):", "secret-prompt-fixture-9t"),
        ("After installation", "later"),
        ("Add a 9t command", "n"),
        ("Install with these settings?", "n"),
    ]:
        expect(label)
        os.write(master, (answer + "\n").encode())
    expect("Cancelled. No installation files were written.")
    assert process.wait(timeout=10) == 0
    assert b"secret-prompt-fixture-9t" not in transcript, "Password was echoed"
    assert b"Theme: dark" in transcript
    assert b"Upload limit: 23 MB" in transcript
    assert not list(pathlib.Path(fixture).iterdir()), "Cancellation created files"
    print("PASS: interactive preferences, hidden password + confirmation, summary, clean cancellation.")
finally:
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=10)
    os.close(master)
    shutil.rmtree(fixture)

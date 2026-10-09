"""Executable regressions for fail-closed release evidence and promotion."""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from release_artifacts import check_junit, promote


class ReleaseEvidenceTests(unittest.TestCase):
    def test_smtp_preflight_blocks_missing_config_without_printing_values(self):
        environment = {key: value for key, value in os.environ.items() if not key.startswith("SMTP_")}
        script = Path(__file__).with_name("check_miniapp_mailer.py")
        missing = subprocess.run([sys.executable, str(script)], env=environment, capture_output=True, text=True)
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("SMTP_HOST", missing.stderr)
        environment.update(SMTP_HOST="smtp.example.invalid", SMTP_USER="fake-private-user", SMTP_PASS="fake-private-password")
        configured = subprocess.run([sys.executable, str(script)], env=environment, capture_output=True, text=True)
        self.assertEqual(configured.returncode, 0)
        self.assertNotIn("fake-private", configured.stdout + configured.stderr)
        environment["SMTP_PORT"] = "not-a-port"
        invalid = subprocess.run([sys.executable, str(script)], env=environment, capture_output=True, text=True)
        self.assertNotEqual(invalid.returncode, 0)

    def test_report_rejects_skips_failures_and_empty_runs(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "report.xml"
            for body in ("", "<skipped/>", "<failure/>", "<error/>"):
                report.write_text(f'<testsuite tests="1"><testcase>{body}</testcase></testsuite>')
                if body:
                    with self.assertRaises(ValueError):
                        check_junit(report)
                else:
                    self.assertEqual(check_junit(report), 1)
            report.write_text('<testsuite tests="0"/>')
            with self.assertRaises(ValueError):
                check_junit(report)
            report.write_text('<testsuite tests="1" skipped="1"><testcase/></testsuite>')
            with self.assertRaises(ValueError):
                check_junit(report)

    def test_tampered_artifact_cannot_touch_live_index(self):
        with tempfile.TemporaryDirectory() as directory:
            evidence, live = Path(directory) / "evidence", Path(directory) / "live"
            (evidence / "miniapp-dist").mkdir(parents=True)
            live.mkdir()
            (live / "index.html").write_text("old")
            data = b"new"
            (evidence / "miniapp-dist" / "index.html").write_bytes(data)
            (evidence / "release.json").write_text(json.dumps({
                "sha": "a" * 40, "files": {"index.html": hashlib.sha256(data).hexdigest()},
            }))
            (evidence / "miniapp-dist" / "index.html").write_text("corrupt")
            with self.assertRaises(ValueError):
                promote(evidence, live, "a" * 40)
            self.assertEqual((live / "index.html").read_text(), "old")
            with self.assertRaises(ValueError):
                promote(evidence, live, "b" * 40)

    def test_promotion_retains_old_assets_and_matches_verified_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            evidence, live = Path(directory) / "evidence", Path(directory) / "live"
            dist = evidence / "miniapp-dist"
            (dist / "assets").mkdir(parents=True)
            (live / "assets").mkdir(parents=True)
            (live / "assets" / "old.js").write_text("old")
            (dist / "assets" / "new.js").write_text("new bundle")
            (dist / "index.html").write_text('assets/new.js')
            files = {str(p.relative_to(dist)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest()
                     for p in dist.rglob("*") if p.is_file()}
            (evidence / "release.json").write_text(json.dumps({"sha": "a" * 40, "files": files}))
            promote(evidence, live, "a" * 40)
            self.assertEqual((live / "index.html").read_text(), "assets/new.js")
            self.assertEqual((live / "assets" / "old.js").read_text(), "old")
            self.assertEqual((live / "assets" / "new.js").read_text(), "new bundle")

    def test_path_escape_is_rejected_before_promotion(self):
        with tempfile.TemporaryDirectory() as directory:
            evidence, live = Path(directory) / "evidence", Path(directory) / "live"
            (evidence / "miniapp-dist").mkdir(parents=True)
            (evidence / "release.json").write_text(json.dumps({
                "sha": "a" * 40, "files": {"../escape": "x", "index.html": "x"},
            }))
            with self.assertRaises(ValueError):
                promote(evidence, live, "a" * 40)
            self.assertFalse(live.exists())


if __name__ == "__main__":
    unittest.main()

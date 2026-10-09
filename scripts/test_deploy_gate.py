"""Exercise the real shell wrapper with sandboxed Git/Docker executables."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


WRAPPER = Path(__file__).with_name("deploy-miniapp.sh")
BASH = shutil.which("bash") or (r"C:\Program Files\Git\bin\bash.exe" if os.name == "nt" else None)
OLD, CANDIDATE = "1" * 40, "2" * 40


class DeploymentBarrierTests(unittest.TestCase):
    def run_wrapper(self, mode="--deploy", retry_after_failure=False, historical_front=False, **flags):
        if not BASH or not Path(BASH).is_file():
            self.fail("Bash is required to execute deployment barrier regressions")
        with tempfile.TemporaryDirectory(prefix="miniapp-gate-") as directory:
            root = Path(directory)
            repo, binary, log = root / "repo", root / "bin", root / "commands.log"
            (repo / ".git").mkdir(parents=True)
            binary.mkdir()
            commands = {
                "git": r'''#!/usr/bin/env bash
echo "git $*" >> "$COMMAND_LOG"
case "$1" in
  rev-parse)
    case "$2" in
      --show-toplevel) pwd ;;
      --absolute-git-dir) printf '%s/.git\n' "$PWD" ;;
      HEAD) if [[ -f "$COMMAND_LOG.head" ]]; then cat "$COMMAND_LOG.head"; else echo 1111111111111111111111111111111111111111; fi ;;
      --verify) echo 2222222222222222222222222222222222222222 ;;
    esac ;;
  status) [[ ${DIRTY:-0} == 1 ]] && echo ' M local-file' || true ;;
  symbolic-ref) echo main ;;
  fetch) exit 0 ;;
  merge-base) [[ ${DIVERGED:-0} != 1 ]] ;;
  diff)
    if [[ "$*" == *' front admin' ]]; then
      if [[ ${HISTORICAL_FRONT:-0} == 1 && $3 == 1111111111111111111111111111111111111111 ]]; then exit 1; fi
      [[ ${OTHER_APP:-0} != 1 ]];
    elif [[ "$*" == *'back/migrations'* ]]; then [[ ${SCHEMA_CHANGED:-0} != 1 ]];
    else [[ ${BACKEND_CHANGED:-0} != 1 || $3 == "$4" ]]; fi ;;
  archive) tar -cf - --files-from /dev/null ;;
  merge) echo 2222222222222222222222222222222222222222 >"$COMMAND_LOG.head" ;;
esac
''',
                "docker": r'''#!/usr/bin/env bash
echo "docker $*" >> "$COMMAND_LOG"
if [[ "$1" == build && ${BUILD_FAILURE:-0} == 1 ]]; then exit 2; fi
if [[ "$1" == run && "$*" == *'-tests' && ${GATE_FAILURE:-0} == 1 ]]; then exit 3; fi
if [[ "$*" == *'release_artifacts.py verify'* && ${VERIFY_FAILURE:-0} == 1 ]]; then exit 4; fi
if [[ "$*" == *'check_miniapp_mailer.py'* && ${MAILER_FAILURE:-0} == 1 ]]; then exit 6; fi
if [[ "$1" == compose && "$*" == *'ps '* ]]; then echo previous-container; fi
if [[ "$1" == inspect && "$*" == *'.State.Running'* ]]; then
  [[ ${WORKER_FAILURE:-0} != 1 ]] && echo true || echo false
elif [[ "$1" == inspect ]]; then echo sha256:previous-image; fi
if [[ "$1" == compose && "$*" == *'up -d'* && ${START_FAILURE:-0} == 1 && ! -f "$COMMAND_LOG.failed" ]]; then
  touch "$COMMAND_LOG.failed"; exit 7
fi
exit 0
''',
                "flock": r'''#!/usr/bin/env bash
[[ ${LOCK_FAILURE:-0} != 1 ]]
''',
            }
            for name, source in commands.items():
                path = binary / name
                path.write_text(source, encoding="utf-8", newline="\n")
                path.chmod(0o755)
            environment = {**os.environ, **{key: str(value) for key, value in flags.items()},
                           "COMMAND_LOG": str(log), "FAKE_BIN": str(binary), "GATE_WRAPPER": str(WRAPPER), "GATE_MODE": mode}
            if historical_front:
                (repo / ".git" / "miniapp-release.deployed-sha").write_text(OLD + "\n", newline="\n")
                Path(str(log) + ".head").write_text("3" * 40 + "\n", newline="\n")
                environment["HISTORICAL_FRONT"] = "1"
            setup = ('export FAKE_BIN="$(cygpath -u "$FAKE_BIN")"; export COMMAND_LOG="$(cygpath -u "$COMMAND_LOG")"; '
                     if os.name == "nt" else '')
            command = setup + 'export PATH="$FAKE_BIN:$PATH"; exec bash "$GATE_WRAPPER" "$GATE_MODE" origin/main'
            result = subprocess.run([BASH, "-c", command], cwd=repo,
                                    env=environment, text=True, capture_output=True, timeout=90)
            if retry_after_failure:
                first_result = result
                environment.pop("START_FAILURE", None)
                result = subprocess.run([BASH, "-c", command], cwd=repo,
                                        env=environment, text=True, capture_output=True, timeout=90)
                result.first_returncode = first_result.returncode
                result.first_output = first_result.stdout + first_result.stderr
            return result, log.read_text() if log.exists() else ""

    def assert_blocked(self, **flags):
        result, commands = self.run_wrapper(**flags)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("git merge --ff-only", commands)
        self.assertNotIn("release_artifacts.py promote", commands)
        self.assertNotIn("docker compose", commands)

    def test_test_failure_cannot_update_source_or_live_bundle(self):
        self.assert_blocked(GATE_FAILURE=1)

    def test_build_failure_cannot_update_source_or_live_bundle(self):
        self.assert_blocked(BUILD_FAILURE=1)

    def test_artifact_verification_failure_cannot_promote(self):
        self.assert_blocked(VERIFY_FAILURE=1)

    def test_dirty_diverged_other_app_and_concurrent_release_are_blocked(self):
        for flag in ("DIRTY", "DIVERGED", "OTHER_APP", "LOCK_FAILURE", "SCHEMA_CHANGED", "MAILER_FAILURE"):
            with self.subTest(flag=flag):
                self.assert_blocked(**{flag: 1})

    def test_backend_start_failure_attempts_previous_runtime_and_index_restore(self):
        result, commands = self.run_wrapper(BACKEND_CHANGED=1, START_FAILURE=1)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("git merge --ff-only", commands)
        self.assertIn("release_artifacts.py restore /live /evidence", commands)
        self.assertEqual(commands.count("up -d --no-build --force-recreate api worker"), 2)
        self.assertIn("Runtime rollback attempted", result.stderr)

    def test_backend_canary_precedes_the_first_live_mutation(self):
        result, commands = self.run_wrapper(BACKEND_CHANGED=1)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertLess(commands.index("uvicorn main:app --host 0.0.0.0 --port 8000"), commands.index("git merge --ff-only"))
        self.assertNotIn("alembic upgrade", commands)

    def test_retry_after_rollback_promotes_backend_even_when_head_is_candidate(self):
        result, commands = self.run_wrapper(BACKEND_CHANGED=1, START_FAILURE=1, retry_after_failure=True)
        self.assertNotEqual(result.first_returncode, 0, result.first_output)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(commands.count("uvicorn main:app --host 0.0.0.0 --port 8000"), 2)
        self.assertEqual(commands.count("up -d --no-build --force-recreate api worker"), 3)
        self.assertIn(f"git diff --quiet {OLD} {CANDIDATE} -- back docker-compose.yml", commands)

    def test_worker_start_failure_rolls_back_instead_of_recording_success(self):
        result, commands = self.run_wrapper(BACKEND_CHANGED=1, WORKER_FAILURE=1)
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("release_artifacts.py restore /live /evidence", commands)
        self.assertIn("Runtime rollback attempted", result.stderr)

    def test_check_mode_tests_the_exact_sha_without_mutating_live(self):
        result, commands = self.run_wrapper(mode="--check")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"git archive {CANDIDATE}", commands)
        self.assertIn(f"MINIAPP_RELEASE_SHA={CANDIDATE}", commands)
        self.assertNotIn("git merge --ff-only", commands)
        self.assertNotIn("release_artifacts.py promote", commands)

    def test_check_mode_accepts_crm_candidate_and_checks_exact_sha_without_mutation(self):
        result, commands = self.run_wrapper(mode="--check", OTHER_APP=1)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"git archive {CANDIDATE}", commands)
        self.assertIn(f"MINIAPP_RELEASE_SHA={CANDIDATE}", commands)
        self.assertNotIn("git merge --ff-only", commands)
        self.assertNotIn("release_artifacts.py promote", commands)
        self.assertNotIn("docker compose", commands)

    def test_historical_front_release_does_not_block_a_later_miniapp_api_release(self):
        result, commands = self.run_wrapper(historical_front=True, BACKEND_CHANGED=1)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(f"git diff --quiet {'3' * 40} {CANDIDATE} -- front admin", commands)
        self.assertIn(f"git diff --quiet {OLD} {CANDIDATE} -- back docker-compose.yml", commands)
        self.assertIn("git merge --ff-only", commands)
        self.assertIn("up -d --no-build --force-recreate api worker", commands)


if __name__ == "__main__":
    unittest.main()

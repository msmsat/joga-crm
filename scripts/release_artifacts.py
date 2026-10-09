"""Check release evidence and promote only the bytes that passed the gate."""
import hashlib
import json
import os
import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path, PurePosixPath


def check_junit(path: Path) -> int:
    root = ET.parse(path).getroot()
    cases = root.findall(".//testcase")
    if not cases:
        raise ValueError(f"No executed tests in {path.name}")
    for element in root.iter():
        if element.tag in ("failure", "error", "skipped"):
            raise ValueError(f"Non-passing test ({element.tag}) in {path.name}")
        for attribute in ("failures", "errors", "skipped", "disabled"):
            if float(element.get(attribute, "0")) != 0:
                raise ValueError(f"Nonzero {attribute} in {path.name}")
    return len(cases)


def verified_files(evidence: Path, sha: str) -> dict[str, Path]:
    manifest = json.loads((evidence / "release.json").read_text(encoding="utf-8"))
    if manifest.get("sha") != sha or len(sha) != 40:
        raise ValueError("Release SHA does not match the tested candidate")
    hashes = manifest.get("files")
    if not isinstance(hashes, dict) or "index.html" not in hashes:
        raise ValueError("Release contains no verified index.html")
    dist = (evidence / "miniapp-dist").resolve()
    actual = {p.relative_to(dist).as_posix() for p in dist.rglob("*") if p.is_file()}
    if actual != set(hashes):
        raise ValueError("Artifact file list changed after verification")
    files = {}
    for name, digest in hashes.items():
        relative = PurePosixPath(name)
        if relative.is_absolute() or ".." in relative.parts or "\\" in name:
            raise ValueError("Unsafe artifact path")
        source = dist.joinpath(*relative.parts)
        if source.is_symlink() or not source.resolve().is_relative_to(dist):
            raise ValueError("Artifact escapes its verified directory")
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise ValueError(f"Artifact changed after verification: {name}")
        files[name] = source
    return files


def promote(evidence: Path, live: Path, sha: str) -> None:
    files = verified_files(evidence, sha)
    live = live.resolve()
    # Keep the bound directory inode stable. Existing pages may still reference
    # their old hashed assets; retain them and switch the entry point last.
    for name in sorted(files, key=lambda value: (value == "index.html", value)):
        destination = live / name
        if not destination.resolve().is_relative_to(live):
            raise ValueError("Live asset path escapes the destination")
        destination.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=".release-", dir=destination.parent)
        os.close(descriptor)
        try:
            shutil.copyfile(files[name], temporary)
            os.chmod(temporary, 0o644)
            os.replace(temporary, destination)
        finally:
            Path(temporary).unlink(missing_ok=True)


def backup_index(live: Path, evidence: Path) -> None:
    index = live / "index.html"
    if not index.is_file():
        raise ValueError("Existing live index.html is required for rollback")
    shutil.copyfile(index, evidence / "previous-index.html")


def restore_index(live: Path, evidence: Path) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=".rollback-", dir=live)
    os.close(descriptor)
    try:
        shutil.copyfile(evidence / "previous-index.html", temporary)
        os.chmod(temporary, 0o644)
        os.replace(temporary, live / "index.html")
    finally:
        Path(temporary).unlink(missing_ok=True)


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "junit":
        for report in sys.argv[2:]:
            count = check_junit(Path(report))
            print(f"{Path(report).name}: {count} passed, zero skips/failures")
    elif len(sys.argv) == 5 and sys.argv[1] == "promote":
        promote(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4])
    elif len(sys.argv) == 4 and sys.argv[1] == "verify":
        verified_files(Path(sys.argv[2]), sys.argv[3])
    elif len(sys.argv) == 4 and sys.argv[1] in ("backup", "restore"):
        (backup_index if sys.argv[1] == "backup" else restore_index)(Path(sys.argv[2]), Path(sys.argv[3]))
    else:
        raise SystemExit("Usage: release_artifacts.py junit REPORT... | verify EVIDENCE SHA | promote EVIDENCE LIVE SHA")

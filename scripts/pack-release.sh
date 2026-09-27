#!/usr/bin/env bash
# Buyer zip of HEAD for MayDo.
# Archives the current commit, omits docs/CHECKSUMS.md and release/,
# refuses any other dirty path, pins entry times, and writes docs/CHECKSUMS.md.
# Versions the new zip from package.json. Never rewrites a sealed historical zip.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 - "$ROOT" <<'PY'
import hashlib
import io
import os
import re
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

root = Path(sys.argv[1]).resolve()
os.chdir(root)

version = subprocess.check_output(
    ["node", "-p", "require('./package.json').version"], text=True
).strip()
if not version or any(c in version for c in "/\\ \n"):
    sys.exit(f"pack-release: refuse version {version!r}")

slug = f"maydo-{version}"
prefix = f"{slug}/"
out_rel = Path("release") / f"{slug}.zip"
stamp = (2026, 9, 26, 0, 0, 0)
comment = slug.encode("ascii")

# Historical buyer zips. pack-release must not rewrite these bytes.
SEALED = {
    "release/maydo-0.1.0.zip": "5aaba05786a24e23977e1646aca2a0915c5de28b3f9b98d440b245e70027586e",
}


def verify_sealed() -> None:
    current = out_rel.as_posix()
    if current in SEALED:
        sys.exit(f"pack-release: refuse to rewrite sealed zip {current}")
    for rel, expected in SEALED.items():
        path = root / rel
        if not path.is_file():
            sys.exit(f"pack-release: sealed zip missing: {rel}")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            sys.exit(
                f"pack-release: sealed zip digest changed for {rel}: {actual} != {expected}"
            )


def historical_rows(current_rel: str) -> list[tuple[str, str]]:
    text = ""
    checksums_path = root / "docs" / "CHECKSUMS.md"
    if checksums_path.is_file():
        text = checksums_path.read_text()
    found: dict[str, str] = {}
    for match in re.finditer(r"`(release/[^`]+)`\s*\|\s*`([0-9a-f]{64})`", text):
        rel, row_digest = match.group(1), match.group(2)
        if rel == current_rel:
            continue
        if rel in SEALED and row_digest != SEALED[rel]:
            sys.exit(
                f"pack-release: checksum row disagrees with sealed digest for {rel}"
            )
        found[rel] = row_digest
    for rel, row_digest in SEALED.items():
        found[rel] = row_digest
    return [(rel, found[rel]) for rel in sorted(found)]


verify_sealed()

REQUIRED = [
    ".env.example",
    "LICENSE",
    "package.json",
    "package-lock.json",
    "SUPPORT.md",
    "BUYER_START_HERE.md",
    "CHANGELOG.md",
    "docs/START_HERE.md",
    "docs/DEMO_60S.md",
    "docs/COMMERCIAL_GRANT.md",
    "docs/POLAR_DELIVERABLES.md",
    "docs/REFUND_GLOSSARY.md",
    "packages/db/migrations/001_init.sql",
    "scripts/demo-60s.sh",
    "status/index.html",
]


def allowed_dirty(path: str) -> bool:
    return path == "docs/CHECKSUMS.md" or path == "release" or path.startswith("release/")


raw = subprocess.check_output(["git", "status", "--porcelain=v1", "-z", "-uall"])
parts = raw.split(b"\0")
bad = []
i = 0
while i < len(parts):
    rec = parts[i]
    i += 1
    if rec == b"":
        continue
    text = rec.decode()
    if len(text) < 4 or text[2] != " ":
        bad.append(text)
        continue
    xy = text[:2]
    paths = [text[3:]]
    if "R" in xy or "C" in xy:
        if i >= len(parts) or parts[i] == b"":
            sys.exit("pack-release: truncated rename record")
        paths.append(parts[i].decode())
        i += 1
    for path in paths:
        if not allowed_dirty(path):
            bad.append(path)

if bad:
    print(
        "pack-release: refuse dirty tree outside docs/CHECKSUMS.md and release/",
        file=sys.stderr,
    )
    for path in bad:
        print(f"  {path}", file=sys.stderr)
    sys.exit(1)

missing = []
for rel in REQUIRED:
    probe = subprocess.run(
        ["git", "cat-file", "-e", f"HEAD:{rel}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if probe.returncode != 0:
        missing.append(rel)
if missing:
    print("pack-release: required files missing from HEAD:", file=sys.stderr)
    for rel in missing:
        print(f"  {rel}", file=sys.stderr)
    sys.exit(1)


def omitted(rel: str) -> bool:
    parts = [p for p in rel.split("/") if p]
    if any(p in {"node_modules", ".git", "dumps"} for p in parts):
        return True
    if rel == "docs/CHECKSUMS.md" or rel == "release" or rel.startswith("release/"):
        return True
    base = parts[-1] if parts else ""
    if base == ".env" or (base.startswith(".env.") and base != ".env.example"):
        return True
    if base.endswith(".zip"):
        return True
    return False


archive = subprocess.check_output(
    [
        "git",
        "-c",
        "tar.umask=0002",
        "archive",
        "--format=tar",
        f"--prefix={prefix}",
        "HEAD",
        "--",
        ".",
        ":(exclude)docs/CHECKSUMS.md",
        ":(exclude)release",
    ]
)

files = {}
with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as tar:
    for member in tar.getmembers():
        name = member.name
        if name.rstrip("/") == slug:
            continue
        if not name.startswith(prefix):
            if name in {"pax_global_header"} or name.startswith("PaxHeader"):
                continue
            sys.exit(f"pack-release: unexpected archive member {name}")
        rel = name[len(prefix) :].rstrip("/")
        if rel == "":
            continue
        if omitted(rel):
            continue
        if not member.isfile():
            if member.isdir():
                continue
            sys.exit(f"pack-release: refuse non-file {rel}")
        extracted = tar.extractfile(member)
        if extracted is None:
            sys.exit(f"pack-release: unreadable {rel}")
        # git archive applies tar.umask (group-writable by default). Keep the
        # executable bit and store a normal 0644 or 0755 in the buyer zip.
        mode = 0o755 if (member.mode & 0o111) else 0o644
        files[prefix + rel] = (extracted.read(), mode)

for rel in REQUIRED:
    if prefix + rel not in files:
        sys.exit(f"pack-release: required file absent from zip: {rel}")

dirs = {prefix}
for arc in files:
    parts = arc.split("/")
    for i in range(1, len(parts)):
        dirs.add("/".join(parts[:i]) + "/")

entries = [(d, None, 0o755) for d in dirs]
entries.extend((arc, data, mode) for arc, (data, mode) in files.items())
entries.sort(key=lambda item: item[0])

buffer = io.BytesIO()
with zipfile.ZipFile(buffer, "w") as zf:
    for arc, data, mode in entries:
        info = zipfile.ZipInfo(arc)
        info.date_time = stamp
        info.create_system = 3
        info.create_version = 20
        info.extract_version = 20
        info.flag_bits = 0
        info.extra = b""
        if arc.endswith("/"):
            info.compress_type = zipfile.ZIP_STORED
            info.external_attr = ((0o040000 | mode) << 16) | 0x10
            payload = b""
            zf.writestr(info, payload)
        else:
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100000 | mode) << 16
            zf.writestr(info, data, compresslevel=9)
    zf.comment = comment

blob = buffer.getvalue()
with zipfile.ZipFile(io.BytesIO(blob)) as zf:
    if zf.comment != comment:
        sys.exit("pack-release: zip comment mismatch")
    names = set(zf.namelist())
    for info in zf.infolist():
        if info.date_time != stamp:
            sys.exit(f"pack-release: mtime not pinned for {info.filename}: {info.date_time}")
        rel = info.filename[len(prefix) :].rstrip("/") if info.filename.startswith(prefix) else info.filename
        if rel and omitted(rel):
            sys.exit(f"pack-release: omitted path in zip: {info.filename}")
    for rel in REQUIRED:
        if prefix + rel not in names:
            sys.exit(f"pack-release: zip missing {rel}")

digest = hashlib.sha256(blob).hexdigest()
verify_sealed()
out_rel.parent.mkdir(parents=True, exist_ok=True)
(root / out_rel).write_bytes(blob)
verify_sealed()

current_rel = out_rel.as_posix()
rows = [(current_rel, digest)] + historical_rows(current_rel)
table = "\n".join(f"| `{rel}` | `{row_digest}` |" for rel, row_digest in rows)
sealed_notes = "\n".join(
    f"- `{rel}` stays sealed. SHA-256 must remain `{row_digest}`."
    for rel, row_digest in historical_rows(current_rel)
)

checksums = f"""# Checksums

SHA-256 of buyer zips. For the current tag, paste that row's hex into the Polar file checksum field. Sealed rows are historical. Do not regenerate those zips.

| File | SHA-256 |
| --- | --- |
{table}

## Current pack

- Version: `{version}`
- Zip path: `release/{slug}.zip`
- Zip comment: `{slug}`
- Archive prefix: `{prefix}`
- Pinned entry time: `2026-09-26T00:00:00Z`
- Built by `scripts/pack-release.sh` from `git archive` of HEAD.
- The zip omits this file and `release/`.

## Sealed

{sealed_notes}

`npm run pack:release` writes `release/{slug}.zip` from `package.json` and refreshes that row only. A clean tree must succeed. The only dirty paths the script allows are this file and `release/`.
"""
(root / "docs" / "CHECKSUMS.md").write_text(checksums)
print(f"wrote {out_rel}")
print(f"sha256 {digest}")
PY

#!/usr/bin/env python3
"""Find and remove the whitespace-hidden JavaScript payload described in
docs/migration/SECURITY_INCIDENT_2026-09-19.md, and check a machine for its traces.

Deliberately standard-library Python: running `npm`, `jest` or `next` inside an
infected checkout executes the payload, so the checker must not depend on Node.

    python3 scripts/security/hidden_payload.py scan PATH...        # report only
    python3 scripts/security/hidden_payload.py scan --fix PATH...  # strip known payloads
    python3 scripts/security/hidden_payload.py host                # look for traces on this machine

Exit status is 1 when anything is found, so `scan` can gate CI or a pre-run check.
"""

import argparse
import glob
import os
import re
import subprocess
import sys

SOURCE_SUFFIXES = (".js", ".cjs", ".mjs", ".jsx", ".ts", ".cts", ".mts", ".tsx")
SKIP_DIRS = {"node_modules", ".git", ".next", "dist", "build", "coverage", ".turbo", ".cache"}
MAX_FILE_BYTES = 5 * 1024 * 1024

# Code pushed off-screen: code, then a long whitespace run, then more code on the same line.
# The leading `(?<=\S)` keeps deeply indented lines in third-party libraries from matching.
HIDDEN_TAIL = re.compile(r"(?<=\S)[ \t]{60,}(?=\S)")
# Markers seen in every observed variant; only tails matching one are removed automatically.
PAYLOAD_MARKERS = re.compile(
    r"global\.[a-z]\s*=\s*'\d+-\d+'|global\[_\$_[0-9a-f]{4}|var _\$_[0-9a-f]{4}\s*=|String\.fromCharCode\(127\)"
)
PROCESS_MARKERS = re.compile(r"global\.[ior]='\d+-\d+'|181\.214\.149\.")


def iter_source_files(root):
    if os.path.isfile(root):
        yield root
        return
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name.endswith(SOURCE_SUFFIXES):
                yield os.path.join(dirpath, name)


def scan_file(path, fix):
    """Returns (findings, fixed) for one file; each finding is (line_number, verdict)."""
    try:
        if os.path.getsize(path) > MAX_FILE_BYTES:
            return [], False
        with open(path, "r", encoding="utf-8", newline="") as handle:
            text = handle.read()
    except (OSError, UnicodeDecodeError):
        return [], False

    lines = text.splitlines(keepends=True)
    findings = []
    changed = False
    for index, line in enumerate(lines):
        match = HIDDEN_TAIL.search(line)
        if not match:
            continue
        tail = line[match.start():]
        if not PAYLOAD_MARKERS.search(tail):
            findings.append((index + 1, "suspicious hidden code, unknown variant: review by hand"))
            continue
        findings.append((index + 1, "known payload" + (": removed" if fix else "")))
        if fix:
            ending = "\r\n" if line.endswith("\r\n") else ("\n" if line.endswith("\n") else "")
            lines[index] = line[:match.start()].rstrip(" \t") + ending
            changed = True

    if changed:
        with open(path, "w", encoding="utf-8", newline="") as handle:
            handle.write("".join(lines))
    return findings, changed


def run_scan(paths, fix):
    found = 0
    for root in paths:
        for path in iter_source_files(root):
            findings, _ = scan_file(path, fix)
            for line_number, verdict in findings:
                print(f"{path}:{line_number}: {verdict}")
                found += 1
    print(f"{found} finding(s)" + (" (known payloads removed)" if fix and found else ""))
    return 1 if found else 0


def windows_home():
    profile = os.environ.get("USERPROFILE")
    if profile and os.path.isdir(profile):
        return profile
    try:
        out = subprocess.run(["cmd.exe", "/c", "echo %USERPROFILE%"], capture_output=True, text=True, timeout=20)
        path = subprocess.run(["wslpath", out.stdout.strip()], capture_output=True, text=True, timeout=20).stdout.strip()
        return path if os.path.isdir(path) else None
    except (OSError, subprocess.SubprocessError):
        return None


def run_host_check():
    hits = []
    homes = [os.path.expanduser("~")]
    win = windows_home()
    if win:
        homes.append(win)
    for home in homes:
        for name in (".node_module", ".node_modules"):
            package = os.path.join(home, name, "package.json")
            if os.path.isfile(package):
                with open(package, encoding="utf-8", errors="replace") as handle:
                    if "socket.io-client" in handle.read():
                        hits.append(f"payload package folder: {os.path.dirname(package)}")
        for archive in glob.glob(os.path.join(home, ".npm", "*$*_*#*.zip")):
            hits.append(f"data-theft archive: {archive}")
        marker = os.path.join(home, "AppData", "Local", "Temp", ".ses")
        if os.path.isfile(marker):
            hits.append(f"possible payload session marker (verify): {marker}")

    try:
        ps = subprocess.run(["ps", "-eo", "pid,args"], capture_output=True, text=True, timeout=20).stdout
        hits += [f"process: {line.strip()[:120]}" for line in ps.splitlines() if PROCESS_MARKERS.search(line)]
    except (OSError, subprocess.SubprocessError):
        pass
    try:
        query = "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }"
        wps = subprocess.run(["powershell.exe", "-NoProfile", "-Command", query], capture_output=True, text=True, timeout=90).stdout
        hits += [f"windows process: {line.strip()[:120]}" for line in wps.splitlines() if PROCESS_MARKERS.search(line)]
    except (OSError, subprocess.SubprocessError):
        pass

    for hit in hits:
        print(hit)
    print(f"{len(hits)} trace(s) found")
    return 1 if hits else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    scan = sub.add_parser("scan", help="scan JS/TS files for whitespace-hidden code")
    scan.add_argument("--fix", action="store_true", help="remove tails that match known payload markers")
    scan.add_argument("paths", nargs="+")
    sub.add_parser("host", help="look for payload folders, archives and processes on this machine")
    args = parser.parse_args()
    sys.exit(run_scan(args.paths, args.fix) if args.command == "scan" else run_host_check())


if __name__ == "__main__":
    main()

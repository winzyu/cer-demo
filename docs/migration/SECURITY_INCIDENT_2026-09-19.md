# Security incident, 2026-09-19

Malware committed into the upstream Clean Earth Rovers repositories executed on the developer machine and stole credentials.
This record was first written on 2026-09-19, lost with the machine rebuild before it was committed, and reconstructed on 2026-09-21 from the surviving Claude transcripts and a fresh analysis of the infected files.

cer-demo itself was never infected.
Verified twice: on 2026-09-04 by a long-line scan, and again on 2026-09-21 by signature and structural scans of the whole checkout.

## What the malware is

Obfuscated JavaScript appended to three tooling config files in the upstream repositories:

| File | Infected size | Clean size | Clean blob |
|---|---|---|---|
| `user-dashboard/postcss.config.js` | 8536 B | 82 B | `ec2b283` |
| `clean-earth-rovers-server/jest.config.js` | 8510 B | 57 B | `0c91404` |
| `clean-earth-rovers-server/test/setup/jest.config.js` | 8907 B | 454 B | `0c91404` |

The payload sits on the same line as the real config, after several hundred spaces, so it renders off-screen in an editor and in a GitHub diff.
The clean blobs match the infected files up to the final byte, verified with `cmp` on 2026-09-21: bytes 1-81, 1-56 and 1-453 are identical, and at the last byte the clean file has a newline where the infected file has `;` (postcss) or a space (both jest configs) before the padding and the payload. Restoring them therefore loses no legitimate change.

These files are loaded automatically by Next.js (`next dev`, `next build`) and Jest (`npm test`, and `npm run predeploy` which calls it).
Execution needs no install step and no unusual command.

## What it does

Decoded statically on 2026-09-21 without executing any attacker code.
Four layers: a `global.r=require` prelude, a shuffled string table, a Function-constructor decompressor, and the payload below.

1. Rate-limits itself to once per 30 seconds per process via `global._p_t`.
2. Queries public Ethereum RPC (`ethereum-rpc.publicnode.com`, `eth.drpc.org`, `eth-mainnet.public.blastapi.io`) for `eth_blockNumber`, then walks back through block windows 2^0 to 2^12 calling `eth_getBlockByNumber`, looking for a transaction matching campaign marker `33ff3edaf55a8e03dcbc7cb40d498a49`.
3. Decodes that transaction's `to` address as packed bytes: offsets 2-10 and 14-22 are IPv4 quads, 10-14 and 22-26 are ports. One address carries two C2 endpoints.
4. Fetches `http://<ip>:<port>/boot` with header `X: <marker>:<version>`.
5. Runs the response two ways: `eval` in-process, and `spawn('node', ['-e', prelude + code], {detached: true, stdio: 'ignore', windowsHide: true})`.
6. If `os.platform() === 'linux'` and `os.release()` contains `microsoft-standard-WSL2`, also spawns Windows `node.exe` with the same payload, crossing the WSL boundary deliberately.
7. Repeats against the second endpoint at `/0/boot`.

Because the C2 address is resolved from the blockchain on every run, blocking an IP achieves nothing and there is nothing to take down.
The address observed on 2026-09-19 was `181.214.149.148:443`.

The second stage served from `/boot` was never captured and its behavior is unknown.
It is known to have dropped a Python downloader and to have installed `axios` and `socket.io-client` into `~/.node_module`, `~/.node_modules` and `C:\Users\winsy\.node_modules`.

## Version tags

The payload stamps a build number in `global.i` / `global.o`, which also appears as `channel` in the stolen-data archives.
Useful for fingerprinting which wave a machine or branch carries.

- `8-4593`: the build removed by the 2026-08-19 cleanup commit.
- `8-16430`, `8-16431`: the build reintroduced 2026-08-26 and still at HEAD.

## How it reached the repositories

| Date | Commit | Effect |
|---|---|---|
| 2025-12-18 | `3475e51` (user-dashboard, `login_fixes`) | postcss.config.js 82 B to 7958 B. Earliest known. |
| 2026-04-28 | `15b5747` (user-dashboard) | 5657 B, different build. |
| 2026-08-19 | `ec2b283` (user-dashboard) | Removed, back to 82 B. Titled "Remove obfuscated malicious code from postcss.config.js". |
| 2026-08-26 | `9ce674b` (user-dashboard), `500ceac` (server) | Reintroduced in both repos. Both titled "Ignore local env files". |
| 2026-09-23 | `c7ecede` (user-dashboard `main`), `a5b745e` (server `develop`) | Removed upstream, byte-identical to our local `5dff5fd` and `693fc96`. |
| 2026-09-24 | `d3b4a3f` (user-dashboard `develop`), `3ed15ff` (server `main`) | Removed upstream on the remaining two tips. |

Both reinfection commits also touch `.gitignore`, consistent with an unrelated commit picking up a one-line config change made by something running on the committing machine.
This reads as a compromised workstation rather than intent.
Cleaning the repositories alone will not hold: it was cleaned once and returned within seven days.

Infected branches as of 2026-09-21: `main` and `develop` in both repositories, plus `fix/charts-maps-api`, `login_fixes`, `new-version-nextjs-13` (user-dashboard) and `fix/charts-maps-api`, `mvc-migration`, `reset_password_flow` (server).

## What was stolen

Three unencrypted archives were written to `C:\Users\winsy\.npm\` on 2026-09-18 between 02:45 and 02:47 local, named `LAPTOP-K1T118OS$winsy_260918_<HHMMSS>#<id>.zip`.
Each `_info.json` carried `channel: 8-16431`, tying the theft to the payload in `user-dashboard/postcss.config.js`, and both a `client_utc` and a `server_utc` one second apart, showing the malware was in contact with its server as each archive was built.
Treat them as uploaded.

- 1Password desktop vault: `1password.sqlite` (3.2 MB), `-wal` (5.1 MB), `-shm`, `1password_resources.sqlite`.
- 1Password browser extension storage for Chrome and Edge, including a 6.4 MB LevelDB log.
- Windows Credential Manager, 37 entries with 33 non-empty passwords, already decrypted: GitHub, Docker Hub, Microsoft account, OneDrive, Xbox, Minecraft, Termius, a Nexus Mods API key, Logitech G Hub.
- Browser saved passwords, cookies and autofill from Chrome (all profiles), Edge, Opera and WebView2 apps.
- VS Code state (`state.vscdb`).

The 1Password database is encrypted at rest, but the attacker had code execution for roughly 28 hours, so capture of the master password could not be ruled out.
The archives were deleted on 2026-09-19 at 21:30 and the machine was wiped afterward, so the only surviving record is the transcript named under "Evidence" below.

## Remediation

Done:

- Machine fully rebuilt. Windows reinstalled 2026-09-20 (new SID, `Windows.old` empty), fresh WSL distro 2026-09-21. Verified clean on 2026-09-21: no payload signatures outside the three upstream files, no malicious processes, no C2 connections, no persistence in cron, systemd, autostart, Run keys, startup folders, scheduled tasks or services.
- New SSH key generated. 1Password account password changed and Secret Key regenerated. Highest-value vault items rotated.
- Clean Earth Rovers notified 2026-09-21.
- The user confirmed on 2026-09-24 that the payload ran on a build machine and was told every credential has been rotated.

Outstanding:

- Upstream removed the payload from every remaining branch tip on 2026-09-23/24 (table above); the other infected branches listed above no longer exist on `origin`, and older history still carries the payload. Local cleanup was executed 2026-09-21 in both checkouts and **not pushed**: branch `security/remove-payload` holds the one cleanup commit (user-dashboard `5dff5fd` off `main` `9ce674b`; clean-earth-rovers-server `693fc96` off `develop` `500ceac`), and branch `local` is cut from it in each repo as the base for local development. Both branches are created with `--no-track` and have no upstream, so nothing can be pushed by accident; pushing still needs explicit consent.
- Build and deploy only from the clean feature branches, with no build cache or image from before the cleanup.
- Google Cloud ADC (`adc-tapout-backup.json`) and GitHub recovery codes sit in plaintext on the 2026-09-19 backup drive, which was written by the compromised machine.

## Detection

Catches all builds seen, including the two different obfuscators:

```bash
grep -rlE ' {200,}' --exclude-dir=node_modules --exclude-dir=.git .
```

Re-run it after any clone, fetch, pull or branch switch in the two upstream repositories, because their history still carries the payload.
A branch sweep on 2026-09-21 (`git grep -lE ' {200,}'` against every `origin/*` head) reproduced the infected list above; `CER-35-forgot-password`, `login_fixes_server` and `migration-to-nestjs` in the server repo were the only clean remote branches.
A reusable Python scanner with a `--fix` mode was written on 2026-09-19 and lost before it was committed; it has not been rebuilt.

## Publishing the local work, 2026-09-24

The `local` commits go to new feature branches on `origin`, cut from the clean tips, for pull requests the user merges after the supervisor demo.
Both repositories were fetched first (no new commits) and scanned with the long-line command above.

| scope | user-dashboard | clean-earth-rovers-server |
|---|---|---|
| remote tips | `main` `c7ecede`, `develop` `d3b4a3f`: clean | `main` `3ed15ff`, `develop` `a5b745e`, `CER-35-forgot-password`, `login_fixes_server`, `migration-to-nestjs`: clean |
| positive control | `c7ecede^` flags `postcss.config.js` | `a5b745e^` flags both jest configs |
| working tree of `local` | clean | clean |
| feature branch | `feature/gilligan-rag-assistant` off `main`, 4 commits, tip `da5412f`: clean | `feature/gilligan-rag-assistant` off `develop`, 5 commits, tip `b2074b8`: clean |
| pushed | 2026-09-24, remote tip `da5412f` | 2026-09-24, remote tip `b2074b8` |
| pull request | held back by the user; draft body in [`UPSTREAM_PR_BODIES.md`](UPSTREAM_PR_BODIES.md) | held back by the user; draft body in [`UPSTREAM_PR_BODIES.md`](UPSTREAM_PR_BODIES.md) |

Each branch is `local` cherry-picked without our payload-removal commit, which upstream had made identically; each branch tree equals `git merge-tree` of `local` into its base.
The audit found no secrets, `.env` files or credential files; the dashboard adds only `remark-gfm`, resolved from `registry.yarnpkg.com`.
The server ships four development-only switches, each inert under `NODE_ENV=production`, which the Dockerfile sets: the passthrough (`DEV_UPSTREAM_BASE_URL` with `DEV_LOCAL_PATHS`), `DEV_UNVERIFIED_AUTH` and `DEV_CHAT_STORE`.
The user approved shipping the passthrough on 2026-09-24.
`CER_RAG_BASE_URL` falls back to `http://localhost:8010`; it is unused while `GILLIGAN_BACKEND` is `gemini` and must be set at cutover.

## Evidence

- `~/code/clean-earth-rovers/incident-logs/` holds all 156 Claude transcripts recovered from the 2026-09-19 backup.
- `cer-demo/6b6cab78-43ba-4b10-a873-7b26f241944b.jsonl` is the forensic session and the only surviving record of the stolen-data archives. Back it up off this machine.
- The 2026-09-19 triage capture (process listings, socket table, sample files) is on the backup drive under `incident-2026-09-19/`.
- No transcript records a malware process being killed and returning unprompted. Every observed reappearance follows a fresh `yarn dev` or `npx jest`. Codex session logs from the period were never backed up and are unrecoverable, so this is not conclusive.

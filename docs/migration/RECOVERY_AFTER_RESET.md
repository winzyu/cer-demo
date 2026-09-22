# Recovery after resetting the PC

Written 2026-09-19 alongside [`SECURITY_INCIDENT_2026-09-19.md`](SECURITY_INCIDENT_2026-09-19.md), which explains why the machine is being reset.
This file lives in OneDrive, so it survives the reset; everything in WSL and in `/tmp` does not.

## The reusable fix

`scripts/security/hidden_payload.py` in this repository is the local fix.
It needs only Python 3 and never runs `npm`, `jest` or `next`, which is the point: those commands are what execute the payload.

```bash
python3 scripts/security/hidden_payload.py scan ~/code            # report only, exit 1 if anything is found
python3 scripts/security/hidden_payload.py scan --fix ~/code      # strip tails matching known payload markers
python3 scripts/security/hidden_payload.py host                   # look for payload folders, archives, processes
```

It was verified against all nine infected file versions in the two upstream repositories' history, and its `--fix` output is byte-identical to the pre-infection files (the dashboard's `postcss.config.js` keeps the injected `};` in place of `}`, which is harmless).
Run `scan` on every freshly cloned CER repository **before** running `npm install`, `yarn`, `jest` or `next`, until the upstream branches are fixed.
An unknown variant is reported as "suspicious hidden code" and is never auto-fixed; inspect those by hand.

## Before the reset: what to back up

Copy these to OneDrive (or another machine). Copy data and text only, never programs or `node_modules`.

| What | Where it is | How |
|---|---|---|
| This repository, with the incident documents and patches | `…/repo/cer-demo` | Already in OneDrive; also push the branch when the machine is clean |
| Incident evidence | the session scratchpad `incident/` folder | `cp -r <scratchpad>/incident ~/OneDrive/.../incident-2026-09-19` (it is in `/tmp` and is lost on reboot) |
| Sandbox-only commits and edits | `~/code/cer-local-stack` | Already saved as patches in [`patches/`](patches) |
| Shell and Git settings | `~/.bashrc`, `~/.profile`, `~/.gitconfig`, `/etc/wsl.conf` | Copy the files; review them before restoring |
| Claude Code setup | `~/.claude/` | Copy `settings.json`, `CLAUDE.md`, `projects/*/memory/`. **Do not copy `.credentials.json`**: log in again instead |
| Codex setup | `~/.codex/` | Copy `config.toml` only, not the auth files |
| Installed packages, for reference | apt and npm | `apt-mark showmanual > apt-packages.txt`, `npm ls -g --depth=0 > npm-globals.txt` (287 apt packages, Node v22.14.0 via nvm) |
| Local environment files | `cer-local-stack/*/.env`, `.env.local` | Save the variable names only; the values are compromised and must be reissued. The required keys are in [`WSL_SANDBOX.md`](WSL_SANDBOX.md) §7 |

Do **not** back up: SSH keys (`~/.ssh`, `C:\Users\<user>\.ssh` - generate new ones), any `.env` values, browser profiles, `node_modules`, or any CER checkout that has not been scanned.

## After the reset

1. Install Windows updates, then WSL and Ubuntu, then Node via nvm (v22.14.0), Python 3 and Git.
2. Restore the dotfiles you saved, reading each one before you use it.
3. Sign in to Claude Code and Codex again rather than restoring their old credential files.
4. Create new SSH keys **with a passphrase** (`ssh-keygen -t ed25519`) and add the public keys to GitHub and anywhere else they are needed.
5. Clone this repository from OneDrive or from its remote, then rebuild the local stack following [`WSL_SANDBOX.md`](WSL_SANDBOX.md).
6. **Before** installing dependencies in any CER repository, run `python3 scripts/security/hidden_payload.py scan <path>` and fix anything it finds.
7. Recreate the `.env` files with newly issued keys and tokens only.
8. Reapply the sandbox work:

```bash
cd ~/code/cer-local-stack/cer-demo
git am < <cer-demo>/docs/migration/patches/sandbox-cer-demo-offline-mode.patch

cd ../clean-earth-rovers-server
git am < <cer-demo>/docs/migration/patches/sandbox-server-offline-mode-and-relay.patch
git apply <cer-demo>/docs/migration/patches/sandbox-server-relay-history-and-device.patch
cp <cer-demo>/docs/migration/patches/sandbox-server-OfflineGilliganStore.test.ts \
   test/unit/services/OfflineGilliganStore.test.ts
```

The relay patch makes `GilliganController.question` send `history` (rebuilt from the offline chat store) and an optional `device` to cer-demo, which was verified end to end on 2026-09-19; the accompanying test covers the store's `findHistory`.

## Credentials still to reissue

Track these as you go; the incident report has the full list and the reasoning.
Fireworks API key, device API token, `ACCESS_TOKEN_SECRET` (team decision), Google and gcloud access, GitHub tokens and SSH keys, Docker Hub, Microsoft account, Termius, Nexus Mods, 1Password master password and Secret Key, and every password saved in a browser.

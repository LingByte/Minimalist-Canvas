# Auto-update (Tauri updater)

Minimalist Canvas uses [`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/) with a static `latest.json` published to GitHub Releases.

## How it works

1. Release CI builds signed updater artifacts (`.sig` + archives / installers).
2. `tauri-action` uploads `latest.json` to the GitHub release.
3. The desktop app checks:

   `https://github.com/LingByte/Minimalist-Canvas/releases/latest/download/latest.json`

4. Users can install from the version dialog (green dot when an update exists). The app also checks once on launch.

## One-time setup: signing key

A keypair was generated for this project. The **public** key is embedded in `src-tauri/tauri.conf.json`.

The **private** key must live only in:

- local file: `.tauri/updater.key` (gitignored), and
- GitHub Actions secret: `TAURI_SIGNING_PRIVATE_KEY`

Optional secret if you regenerate the key with a password:

- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

### Add the GitHub secret

```bash
# One-liner (requires `gh auth login` first)
gh secret set TAURI_SIGNING_PRIVATE_KEY < .tauri/updater.key
```

Or paste manually: GitHub → **Settings → Secrets and variables → Actions** → create `TAURI_SIGNING_PRIVATE_KEY` with the **full private key contents**. Leave `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` empty unless the key was created with a password.

Ship steps (tag → macOS + Windows + website download): see [RELEASE.md](./RELEASE.md).

If `.tauri/updater.key` is missing on your machine, regenerate (this **breaks** updates for existing installs that already have the old pubkey):

```bash
bunx tauri signer generate -w .tauri/updater.key
# Copy the new public key into src-tauri/tauri.conf.json → plugins.updater.pubkey
```

## Local signed release build

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat .tauri/updater.key)"
# export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""  # if needed
bun run tauri:build
```

## Publish a release

1. Bump `version` in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Tag and push: `git tag v0.1.2 && git push origin v0.1.2`
3. Wait for the Release workflow. Confirm the release assets include `latest.json` and `.sig` files.

## macOS notes

Current builds use ad-hoc signing (`signingIdentity: "-"`) and are **not notarized**. Auto-update can still download/install, but Gatekeeper may block first launches or replacements until users allow the app (right-click → Open, or remove quarantine).

For production-quality macOS auto-update, configure Apple Developer ID signing + notarization in CI.

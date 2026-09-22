# Desktop release (macOS + Windows)

CI workflow: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

Publishes:

| Asset | Used by |
| --- | --- |
| `Minimalist-Canvas-macOS.dmg` | Website `/download` + GitHub latest |
| `Minimalist-Canvas-Windows-x64.exe` | Website `/download` + GitHub latest |
| `latest.json` + `.sig` | In-app auto-update |

Website download page (`canvas.lingecho.com/download`) already resolves
`https://github.com/LingByte/Minimalist-Canvas/releases/latest/...` — no web URL change needed when asset names stay the same.

## Prerequisites (one-time)

1. GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` = contents of `.tauri/updater.key`
2. Optional: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key was password-protected
3. Public key in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` must match that private key

See [AUTO_UPDATE.md](./AUTO_UPDATE.md).

## Ship a version

1. Bump version in all three places (keep them identical):
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Commit and push to `main`.
3. Tag and push:

```bash
git tag v0.1.2
git push origin v0.1.2
```

4. Or run **Actions → Release → Run workflow** (`workflow_dispatch`).
5. Confirm the GitHub Release has:
   - `Minimalist-Canvas-macOS.dmg`
   - `Minimalist-Canvas-Windows-x64.exe`
   - `latest.json`
   - updater `.sig` / archive assets

After that, `/download` and in-app updater both pick up the new build automatically.

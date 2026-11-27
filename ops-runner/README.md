# Ops runner

In-repo Playwright automation for Douyin / Kuaishou / Xiaohongshu creator consoles.
Tauri resolves this folder as `Minimalist-Canvas/ops-runner` (override with `OPS_RUNNER_DIR`).

## Setup

```bash
cd ops-runner
bun install
# optional fallback when system Chrome is missing:
bunx playwright install chromium
```

Prefer system Chrome/Edge — creator sites fingerprint bundled Chromium harshly.
Login uses an off-screen Chrome window and streams the QR into the app UI.

## CLI

```bash
bun run cli.ts @/tmp/request.json
```

Stdout is NDJSON: `progress` / `qr` / `done` / `error`.

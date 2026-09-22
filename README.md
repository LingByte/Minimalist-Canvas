# Minimalist Canvas

Infinite canvas desktop app built with Tauri 2 + React 19 + TypeScript.

## Tech Stack

- **Frontend**: React 19, TypeScript, Rsbuild, Ant Design, Tailwind CSS
- **Desktop**: Tauri 2 (Rust backend)
- **State**: Zustand, TanStack Query
- **i18n**: i18next (en, zh, zh-TW, fr, ja, ru, vi)

## Prerequisites

- [Bun](https://bun.sh/) (package manager)
- [Rust](https://rustup.rs/) (stable toolchain)
- macOS: Xcode Command Line Tools

## Getting Started

```bash
# Install dependencies
bun install

# Run in development (web only)
bun run dev

# Run as desktop app (Tauri)
bun run tauri:dev

# Build desktop app (produces DMG)
bun run tauri:build
```

## Build Output

After `bun run tauri:build`, the DMG will be at:
```
src-tauri/target/release/bundle/dmg/Minimalist Canvas_0.1.0_aarch64.dmg
```

## Auto-update

Desktop builds can check GitHub Releases and install updates in-app (Tauri updater).

See [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md) for signing keys, CI secrets, and release steps.

## macOS Distribution

The app is built with ad-hoc signing (no Apple Developer account required).

Users on macOS 15+ will need to:
1. Open System Settings → Privacy & Security
2. Click "Open Anyway" for the first launch

Or run:
```bash
xattr -d com.apple.quarantine "/Applications/Minimalist Canvas.app"
```

## License

MIT

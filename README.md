# Minimalist Canvas

至简未来桌面端：无限画布 + 本地 Agent / Skills + 云端存储。

基于 **Tauri 2 + React 19 + TypeScript**，默认按本机优先设计；网页 `bun run dev` 可预览，完整能力请用桌面端。

## Features

- **无限画布**：节点、连线、分镜 Script、图/视频/音频生成与本地项目库
- **Agent / Skills**：内置与本地技能、梗库检索、画布工具调用
- **云端存储**：文件管理、CDN 趋势、本机数据目录可从配置页打开
- **自动更新（桌面端）**：启动后检查 GitHub Releases，可在应用内下载安装

## Tech Stack

| Layer | Stack |
| --- | --- |
| Frontend | React 19, TypeScript, Rsbuild, Ant Design, Tailwind |
| Desktop | Tauri 2 (Rust) |
| State | Zustand, TanStack Query |
| i18n | i18next（en / zh / zh-TW / fr / ja / ru / vi） |

## Prerequisites

- [Bun](https://bun.sh/)
- [Rust](https://rustup.rs/) stable
- macOS：Xcode Command Line Tools

## Getting Started

```bash
bun install

# Web preview
bun run dev

# Desktop (recommended)
bun run tauri:dev

# Production desktop build (DMG / NSIS)
bun run tauri:build
```

当前版本见 `package.json` / `src-tauri/tauri.conf.json`。构建产物大致在：

```text
src-tauri/target/release/bundle/dmg/
src-tauri/target/release/bundle/nsis/
```

## Auto-update

**有。** 桌面端已接入 `tauri-plugin-updater`：

| 能力 | 说明 |
| --- | --- |
| 启动检查 | `UserLayout` → `scheduleAutoUpdateCheck()`，约 4s 后静默检查 |
| 提示安装 | 发现新版本后 toast「立即更新」，下载完成后可 relaunch |
| 更新源 | `https://github.com/LingByte/Minimalist-Canvas/releases/latest/download/latest.json` |
| 签名 | `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`；私钥仅存 CI / `.tauri/updater.key` |

相关实现：

- `src/features/infinite-canvas/services/app-updater.ts`（启动 toast 流程，**当前在用**）
- `src/features/infinite-canvas/hooks/use-version-check.ts` + `version-release-modal.tsx`（版本弹窗能力已写好，需挂到 UI 才可见手动「检查更新」）

发版与密钥细节见：

- [docs/AUTO_UPDATE.md](docs/AUTO_UPDATE.md)
- [docs/RELEASE.md](docs/RELEASE.md)

> 说明：`bun run tauri:dev` 开发态一般不会走完整安装更新；需正式 Release 包 + 对应平台产物在 `latest.json` 里。macOS 目前为 ad-hoc 签名，首次打开可能被 Gatekeeper 拦截。

## macOS first launch

若系统拦截未公证安装包：

1. 系统设置 → 隐私与安全性 → 仍要打开  
2. 或：`xattr -d com.apple.quarantine "/Applications/Minimalist Canvas.app"`

## Scripts

| Command | Purpose |
| --- | --- |
| `bun run dev` | Rsbuild web |
| `bun run tauri:dev` | Tauri desktop |
| `bun run tauri:build` | Signed updater artifacts + installers |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | oxlint |

## License

MIT

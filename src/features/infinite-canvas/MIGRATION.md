# Infinite Canvas → web 嵌入迁移

## 当前状态：完成 ✅

### 嵌入与功能
- 源码在 `src/features/infinite-canvas/`（alias `@canvas`）
- 路由 `/canvas`、`/canvas/*`，受 **HeaderNavModules.canvas** 与登录策略控制
- Gateway bridge、定价/`/v1/models` 模型同步、独立 i18n

### 插件
- `web/public/plugins/*.js` 已入库；更新源码：`packages/canvas-plugins/`
- `bun run canvas:plugins:build`；CI：`.github/workflows/publish-canvas-plugins.yml`

### Monorepo 布局

| 路径 | 说明 |
|------|------|
| `packages/canvas-plugins/` | 插件 SDK + 官方节点 |
| `packages/canvas-agent/` | 本地 Agent |
| `packages/codex-plugin/` | Codex 插件 |

## 开发

```bash
cd web && bun install && bun run dev
```

注意：**不要**在 `public/` 下创建名为 `canvas/` 的静态目录，会与 SPA 路由 `/canvas` 冲突导致重定向循环。

# 默认动作包

用户可说：「做一个红袍魔法师，八方向走、跑、待机和攻击」。有描述或参考就沿用；只要部分动作时按其范围执行。

## 范围与张数（默认）

| 步骤 | 内容 |
| --- | --- |
| 设定 | 1 次角色候选（可多张选 1） |
| 方向 | 5 张实生成 + 3 张镜像（或 8 张实生成） |
| 动作 | 每个动作 × 5 个实朝向（镜像补另外 3 向） |

默认动作：`walk` · `run` · `idle` · `attack`。帧数建议（可改）：走/跑/待机 6–12 关键关键关键；攻击 4–8 关键。若模型一次只出单帧，则按帧序多次生成或先出条带再切帧（切帧后仍验收）。

## 执行顺序

1. `layout --name <id>` 建目录。
2. 出设定图 → 选中 → 写入 `refs/`。
3. 按 [角色表](character-sheet.md) 准备 `directions/`。
4. 对每个动作、每个实朝向提交生成：提示词锁定「同一角色 + 该朝向参考 + 动作描述 + 透明底 + 画风」。
5. 五向完成后镜像补齐；导出 GIF（可选）与 `manifest.json`。

```bash
node "{baseDir}/scripts/game-assets.mjs" layout --name mage --out ./game-assets
node "{baseDir}/scripts/game-assets.mjs" mirror-dir \
  --in ./game-assets/mage/directions \
  --map left:right,frontLeft:frontRight,backLeft:backRight
node "{baseDir}/scripts/game-assets.mjs" manifest --root ./game-assets/mage
```

## 动作提示（可写入请求）

- **walk**：循环步伐，重心平稳，双脚交替，不要飘。
- **run**：步幅更大、躯干前倾，与 walk 可区分。
- **idle**：轻微呼吸或待机循环，脚不打滑。
- **attack**：预备 → 击发 → 回收；攻击 GIF 通常播放一次，其余循环。

## 验收

跑和走有区别；待机稳；攻击过程完整；镜像后朝向正确；`manifest.json` 中路径真实存在。

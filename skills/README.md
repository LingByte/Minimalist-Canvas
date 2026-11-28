# Local Agent Skills

## Built-in screenwriting packs

The app ships vendored screenwriting skills under `skills/bundled/` (loaded as `shipped:` builtins).

| Upstream | What you get |
| --- | --- |
| [shuohao-skills](https://github.com/eternityspring/shuohao-skills) | Novel → outline / characters / art / script / staging / storyboard |
| [drama-skills](https://github.com/zenstory-ai/drama-skills) | Short-drama pipeline (write / storyboard / prompts / review…) |
| [screenwriting-skills](https://github.com/jtydhr88/screenwriting-skills) | Craft skills (structure, dialogue, series bible, …) |
| [shanyin-screenwriting-master](https://github.com/Shanyin-ai/shanyin-screenwriting-master) | Full-format screenwriting master |
| [story-to-script](https://github.com/oleo17/story-to-script) | Duration-budgeted script writer |
| [write-screenplay-skill](https://github.com/egguy886/write-screenplay-skill) | Commercial short-drama / overseas screenplay |

Refresh from GitHub:

```bash
bun run skills:fetch   # clone/pull skills/_vendor then rebuild skills/bundled
# or
bun run skills:sync    # rebuild bundled/ from existing _vendor
```

`skills/_vendor/` is a local clone cache (gitignored). Commit `skills/bundled/` so CI/desktop builds ship offline.

Attribution: `skills/bundled/ATTRIBUTION.md`.

## Publishable external skills (Integrate page)

Built-in novel/drama packs live under `skills/bundled/`. Installable packs for other repos:

| Path | Role |
| --- | --- |
| `skills/minimalist-canvas-media/` | Image / video via live desktop media API |
| `skills/minimalist-canvas-game-assets/` | Game asset pipeline (sheets, 8-dir, action packs, VFX) |
| `skills/cursor-media/` | npm package (`minimalist-canvas-media`) + CLI bin |

Download / preview both from the in-app **外部接入** page.

### Install elsewhere

```bash
# Media CLI
npx minimalist-canvas-media image --prompt "海报" --out ./out.png

# Cursor / Claude skills from this GitHub repo
npx skills add LingByte/Minimalist-Canvas --skill minimalist-canvas-media -g -a cursor -y
npx skills add LingByte/Minimalist-Canvas --skill minimalist-canvas-game-assets -g -a cursor -y
```

Details: [`skills/cursor-media/README.md`](./cursor-media/README.md).

## Optional user installs

You can still drop extra folders under `{storageRoot}/skills/<name>/SKILL.md`, or upload a skill zip from the Skills library page.

```bash
# Example (macOS Tauri data dir; adjust to your storageRoot)
cp -R skills/script-generation \
  "$HOME/Library/Application Support/com.lingbyte.minimalist-canvas/skills/"
```

User installs override a built-in skill with the same `name`.

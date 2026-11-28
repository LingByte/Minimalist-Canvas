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

## Cursor personal skill (cross-project media)

`skills/cursor-media/` is a Cursor Agent Skill that reuses Minimalist Canvas desktop
channels to generate images/videos from **any** local project.

Copy it into your Cursor **user Agent Store** `skills/` as `minimalist-canvas-media`
(or keep the vendored folder and point agents at `skills/cursor-media/SKILL.md`).

Then in another repo ask Cursor to use `minimalist-canvas-media` / 用画布渠道生图.

## Optional user installs

You can still drop extra folders under `{storageRoot}/skills/<name>/SKILL.md`, or upload a skill zip from the Skills library page.

```bash
# Example (macOS Tauri data dir; adjust to your storageRoot)
cp -R skills/script-generation \
  "$HOME/Library/Application Support/com.lingbyte.minimalist-canvas/skills/"
```

User installs override a built-in skill with the same `name`.

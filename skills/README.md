# Local Agent Skills

Put skill folders under the app storage root as `{storageRoot}/skills/<name>/SKILL.md`.

This repo ships a template you can copy:

```bash
# Example (macOS Tauri data dir; adjust to your storageRoot)
cp -R skills/script-generation \
  "$HOME/Library/Application Support/com.lingbyte.minimalist-canvas/skills/"
```

After copying, restart the app (or reload skills) so `use_skill` can see `script-generation`.

The built-in script harness already teaches Script-node workflows via the system prompt; this skill is an optional reinforcement, not required.

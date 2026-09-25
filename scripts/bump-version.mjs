import fs from 'node:fs'

for (const f of ['package.json', 'src-tauri/tauri.conf.json']) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'))
  j.version = '0.1.5'
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n')
  console.log(f, '->', j.version)
}

const tomlPath = 'src-tauri/Cargo.toml'
const toml = fs.readFileSync(tomlPath, 'utf8').replace(/^version = "0\.1\.4"/m, 'version = "0.1.5"')
fs.writeFileSync(tomlPath, toml)

const lockPath = 'src-tauri/Cargo.lock'
const lock = fs.readFileSync(lockPath, 'utf8').replace(/(name = "minimalist-canvas"\r?\nversion = ")0\.1\.4/, '$10.1.5')
fs.writeFileSync(lockPath, lock)
console.log('done')

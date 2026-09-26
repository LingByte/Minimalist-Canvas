import fs from 'node:fs'

const target = process.argv[2]
if (!target) {
  console.error('usage: node scripts/bump-version.mjs <version>')
  process.exit(1)
}

const source = (() => {
  const j = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  return j.version
})()

for (const f of ['package.json', 'src-tauri/tauri.conf.json']) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'))
  j.version = target
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n')
  console.log(f, '->', j.version)
}

const srcEsc = source.replace(/\./g, '\\.')
const tomlPath = 'src-tauri/Cargo.toml'
const toml = fs.readFileSync(tomlPath, 'utf8').replace(new RegExp(`^version = "${srcEsc}"`, 'm'), `version = "${target}"`)
fs.writeFileSync(tomlPath, toml)

const lockPath = 'src-tauri/Cargo.lock'
const lock = fs.readFileSync(lockPath, 'utf8').replace(new RegExp(`(name = "minimalist-canvas"\\r?\\nversion = ")${srcEsc}`), `$1${target}`)
fs.writeFileSync(lockPath, lock)
console.log('done', source, '->', target)

// This file is executed directly by Node - only use erasable TypeScript syntax

import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'

const crates = [
  {
    cwd: 'rust/cmp-wasm',
    outDir: '../../src/comparison/wasm',
    outName: 'cmp_wasm'
  },
  {
    cwd: 'rust/fsb5-convert',
    outDir: '../../src/viewers/sound/wasm',
    outName: 'index'
  }
]

const unwantedFiles = ['.gitignore', 'package.json', 'README.md']

for (const crate of crates) {
  const cmd = `wasm-pack build --target web --release --out-dir ${crate.outDir} --out-name ${crate.outName}`
  console.log(`Building WASM crate: ${crate.cwd}...`)

  execSync(cmd, {
    cwd: path.resolve(process.cwd(), crate.cwd),
    stdio: 'inherit'
  })

  const resolvedOutDir = path.resolve(process.cwd(), crate.cwd, crate.outDir)

  for (const file of unwantedFiles) {
    const filePath = path.join(resolvedOutDir, file)
    rmSync(filePath, { force: true })
  }
}

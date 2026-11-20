/**
 * Runs the local API server and the Vite dev server together.
 * Usage: npm run dev:all
 */
import { spawn } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = []

function start(args, name) {
  const child = spawn(npm, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev:all] ${name} exited with code ${code}`)
    }
    shutdown(code ?? 0)
  })
  children.push(child)
}

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('[dev:all] Starting API server (3001) and Vite (5173)…')
start(['run', 'api:dev'], 'api')
start(['run', 'dev'], 'vite')

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const node = process.execPath
const children = []

function stopAll(exitCode = 0) {
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }
  process.exitCode = exitCode
}

function start(label, args) {
  const child = spawn(node, args, { cwd: root, stdio: 'inherit', env: process.env, shell: false })
  child.on('error', (error) => {
    process.stderr.write(`${label} could not start: ${error.message}\n`)
    stopAll(1)
  })
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`${label} stopped with exit code ${code}\n`)
      stopAll(code)
    }
  })
  children.push(child)
  return child
}

async function waitForAuthServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:4000/api/health', { signal: AbortSignal.timeout(700) })
      if (response.ok) {
        const data = await response.json()
        if (data.service === 'neurogrip-auth') return
      }
    } catch {
      // Keep waiting briefly while Node starts the local authentication service.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Authentication service did not become ready on port 4000.')
}

process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))

start('Authentication server', ['server/index.mjs'])
try {
  await waitForAuthServer()
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  stopAll(1)
  process.exit(1)
}
start('Vite', ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'])
process.stdout.write('Authentication is ready. Vite will be available at http://localhost:5173/\n')

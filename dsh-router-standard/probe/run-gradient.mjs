/**
 * Fine-grained phase-transition probe: 21 mode points (0.05 steps) × n runs,
 * both models. Answers whether model behavior is continuously tunable along
 * the react↔spec axis or exhibits a phase transition (threshold).
 * Output: per point — classification histogram, first-token histogram,
 * we/letMe means. Sanitized (no reasoning text).
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { USER_PROMPT, buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '2')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'
const points = []
for (let i = 0; i <= 20; i++) points.push(Number((i / 20).toFixed(2)))

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const tools = buildTools(['bash', 'read', 'edit', 'write', 'glob', 'grep'])

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, points, n: nRuns, note: '--run to send requests' }, null, 2))
  process.exit(0)
}

const results = []
for (const mode of points) {
  const system = personaFor(mode)
  const rows = []
  for (let i = 0; i < nRuns; i++) {
    const r = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: USER_PROMPT }], model: creds.model, tools })
    rows.push(r)
    await new Promise((r2) => setTimeout(r2, 300))
  }
  const labels = {}
  const firstTokens = {}
  let we = 0, letMe = 0
  for (const r of rows) {
    labels[r.classification] = (labels[r.classification] || 0) + 1
    firstTokens[r.metrics.firstToken] = (firstTokens[r.metrics.firstToken] || 0) + 1
    we += r.metrics.we; letMe += r.metrics.letMe
  }
  const n = rows.length
  const line = {
    mode,
    labels,
    firstTokens: Object.entries(firstTokens).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}x${v}`).join(' '),
    avg: { we: (we / n).toFixed(1), letMe: (letMe / n).toFixed(1) },
  }
  console.log(JSON.stringify(line))
  results.push(line)
}

await mkdir(resolve('results'), { recursive: true })
const outPath = resolve('results', `gradient-${model.replace(/[^a-z0-9]/gi, '')}-${new Date().toISOString().replaceAll(':', '-')}.json`)
await writeFile(outPath, `${JSON.stringify({ model, results }, null, 2)}\n`, 'utf8')
console.log(`saved: ${outPath}`)

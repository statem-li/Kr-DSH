/**
 * Recommended-config verification (larger n): the optimal first-turn surface
 * from the matrix — minimal persona + 7 file tools — plus promote-keep and
 * short-description workflow variants. Sanitized output, no reasoning text.
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn, appendSyntheticToolResults } from './probe.mjs'
import { MINIMAL_SYSTEM, USER_PROMPT, buildTools, FULL_CATALOG, fn } from './scaffolds.mjs'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '5')
const WORK7 = ['bash', 'read', 'edit', 'write', 'glob', 'grep', 'todo_write']

const cells = [
  { id: 'V1-work7-stable', tools: buildTools(WORK7) },
  { id: 'V2-work7-plus-short-workflow', tools: [...buildTools(WORK7), fn('workflow', 'Run a workflow.', { script: { type: 'string' } }, ['script'])] },
  { id: 'V3-promote-work7-to-full', tools: buildTools(WORK7), promote: true },
]

const creds = loadDshCredentials()
const modelOverride = process.argv[process.argv.indexOf('--model') + 1]
if (modelOverride) creds.model = modelOverride
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const messages = [{ role: 'system', content: MINIMAL_SYSTEM }, { role: 'user', content: USER_PROMPT }]

function strip(turn) {
  const { message, ...rest } = turn
  return rest
}

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model: creds.model, n: nRuns, cells: cells.map((c) => c.id) }, null, 2))
  process.exit(0)
}

const results = []
for (const cell of cells) {
  const tools = cell.tools
  const rows = []
  for (let i = 0; i < nRuns; i++) {
    const first = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
    rows.push(strip(first))
    if (cell.promote && first.toolNames.length) {
      const secondMessages = appendSyntheticToolResults(messages, first.message)
      const second = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages: secondMessages, model: creds.model, tools: FULL_CATALOG() })
      rows.push({ ...strip(second), phase: 'promoted' })
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  const labels = {}
  const firstTokens = {}
  let letMe = 0, we = 0, lets = 0, marker = 0
  for (const r of rows) {
    labels[r.classification] = (labels[r.classification] || 0) + 1
    firstTokens[r.metrics.firstToken] = (firstTokens[r.metrics.firstToken] || 0) + 1
    letMe += r.metrics.letMe; we += r.metrics.we; lets += r.metrics.lets
    if (r.metrics.markerFirstLine) marker += 1
  }
  const n = rows.length
  const line = {
    id: cell.id, n,
    labels,
    firstTokens: Object.entries(firstTokens).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}x${v}`).join(' '),
    avg: { we: (we / n).toFixed(1), letMe: (letMe / n).toFixed(1), lets: (lets / n).toFixed(1), marker },
    toolNames: rows.flatMap((r) => r.toolNames),
  }
  console.log(JSON.stringify(line))
  results.push({ ...line, runs: rows })
}

await mkdir(resolve('results'), { recursive: true })
const outPath = resolve('results', `verify-${new Date().toISOString().replaceAll(':', '-')}.json`)
await writeFile(outPath, `${JSON.stringify({ model: creds.model, results }, null, 2)}\n`, 'utf8')
console.log(`saved: ${outPath}`)

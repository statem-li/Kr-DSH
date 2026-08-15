/**
 * Matrix runner: finds the optimal reasoning-trigger surface for the model
 * routed by DSH (credentials read from $DSH_HOME/.credentials.yaml, never
 * printed). Output is sanitized: no reasoning text, no API keys.
 *
 * Usage:
 *   node matrix.mjs                # dry-run: print matrix, no requests
 *   node matrix.mjs --run          # run the full matrix
 *   node matrix.mjs --run --limit A --n 3
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadDshCredentials } from './creds.mjs'
import { sendTurn, appendSyntheticToolResults } from './probe.mjs'
import {
  MINIMAL_SYSTEM, PARAPHRASED_SYSTEM, STANDARD_SYSTEM, USER_PROMPT,
  buildTools, FULL_CATALOG,
} from './scaffolds.mjs'

const run = process.argv.includes('--run')

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1]
}

const nRuns = Number(option('--n', '2'))
const limit = option('--limit', 'ALL')

const FILE6 = ['bash', 'read', 'edit', 'write', 'glob', 'grep']
const WORK = [...FILE6, 'todo_write']

const matrix = [
  // ── A 组：触发边界 ──
  { id: 'A1-minimal-baseline', group: 'A', system: MINIMAL_SYSTEM, tools: ['bash', 'read'] },
  { id: 'A2-minimal-fullcatalog', group: 'A', system: MINIMAL_SYSTEM, tools: 'full', catalogInUser: false },
  { id: 'A3-minimal-file6', group: 'A', system: MINIMAL_SYSTEM, tools: FILE6 },
  { id: 'A4-minimal-text-in-user', group: 'A', system: MINIMAL_SYSTEM, tools: ['bash', 'read'], catalogInUser: true },
  { id: 'A5-standard-persona-2tools', group: 'A', system: STANDARD_SYSTEM, tools: ['bash', 'read'] },
  { id: 'A6-paraphrased-2tools', group: 'A', system: PARAPHRASED_SYSTEM, tools: ['bash', 'read'] },
  // ── B 组：最优面搜索（minimal persona 下仍 minimal-like 的最大工具面）──
  { id: 'B1-plus-edit', group: 'B', system: MINIMAL_SYSTEM, tools: ['bash', 'read', 'edit'] },
  { id: 'B2-plus-grep', group: 'B', system: MINIMAL_SYSTEM, tools: ['bash', 'read', 'grep'] },
  { id: 'B3-plus-glob', group: 'B', system: MINIMAL_SYSTEM, tools: ['bash', 'read', 'glob'] },
  { id: 'B4-work-surface', group: 'B', system: MINIMAL_SYSTEM, tools: WORK },
  // ── C 组：晋升保持（首轮窄 → 第二轮 full）──
  { id: 'C1-promote', group: 'C', system: MINIMAL_SYSTEM, tools: ['bash', 'read'], promote: true },
]

function catalogText() {
  return FULL_CATALOG().map((t) => `${t.function.name}: ${t.function.description}`).join('\n')
}

function buildMessages(system, tools, catalogInUser) {
  const user = catalogInUser
    ? `${USER_PROMPT}\n\nThe following tools are available to you (visible as text only):\n${catalogText()}`
    : USER_PROMPT
  return [{ role: 'system', content: system }, { role: 'user', content: user }]
}

function summarize(rows) {
  const labels = {}
  const firstTokens = {}
  let we = 0, letMe = 0, lets = 0, marker = 0
  for (const r of rows) {
    labels[r.classification] = (labels[r.classification] || 0) + 1
    const ft = r.metrics.firstToken
    firstTokens[ft] = (firstTokens[ft] || 0) + 1
    we += r.metrics.we; letMe += r.metrics.letMe; lets += r.metrics.lets
    if (r.metrics.markerFirstLine) marker += 1
  }
  const n = rows.length
  const topTokens = Object.entries(firstTokens).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => `${k}x${v}`).join(' ')
  return {
    n,
    labels,
    firstTokens: topTokens,
    avg: { we: (we / n).toFixed(1), letMe: (letMe / n).toFixed(1), lets: (lets / n).toFixed(1), marker },
    toolNames: rows.flatMap((r) => r.toolNames),
  }
}

function strip(turn) {
  const { message, ...rest } = turn
  return rest
}

const creds = loadDshCredentials()
const modelOverride = option('--model', '')
if (modelOverride) creds.model = modelOverride
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')

if (!run) {
  console.log(JSON.stringify({
    dryRun: true,
    endpoint: `${creds.baseUrl.replace(/\/$/, '')}/chat/completions`,
    model: creds.model,
    credsSource: '$DSH_HOME/.credentials.yaml',
    note: 'No request sent. Add --run to opt in to paid API calls.',
    cells: matrix.filter((c) => limit === 'ALL' || c.group === limit).map((c) => ({
      id: c.id, system: c.system.slice(0, 40), tools: c.tools === 'full' ? 'full(21)' : c.tools.join('+'), promote: !!c.promote, catalogInUser: !!c.catalogInUser,
    })),
  }, null, 2))
  process.exit(0)
}

console.log(`model=${creds.model} base=${creds.baseUrl} n=${nRuns} matrix=${matrix.length} cells`)
const results = []
for (const cell of matrix) {
  if (limit !== 'ALL' && cell.group !== limit) continue
  const tools = cell.tools === 'full' ? FULL_CATALOG() : buildTools(cell.tools)
  const messages = buildMessages(cell.system, tools, cell.catalogInUser)
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
  const s = summarize(rows)
  console.log(JSON.stringify({ id: cell.id, ...s }))
  results.push({ id: cell.id, group: cell.group, runs: rows, summary: s })
}

const outDir = resolve('results')
await mkdir(outDir, { recursive: true })
const outPath = resolve(outDir, `matrix-${new Date().toISOString().replaceAll(':', '-')}.json`)
await writeFile(outPath, `${JSON.stringify({ model: creds.model, results }, null, 2)}\n`, 'utf8')
console.log(`saved: ${outPath}`)

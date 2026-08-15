/**
 * Name-vs-description ablation for the workflow family: same catalog position,
 * varying tool name and description length, minimal persona + file6.
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { MINIMAL_SYSTEM, USER_PROMPT, buildTools, fn } from './scaffolds.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const FILE6 = ['bash', 'read', 'edit', 'write', 'glob', 'grep']

const cells = {
  'W1-full-desc': [fn('workflow', 'Run a JavaScript workflow script that orchestrates subagents.', { script: { type: 'string' } }, ['script'])],
  'W2-short-desc': [fn('workflow', 'Run a workflow.', { script: { type: 'string' } }, ['script'])],
  'W3-renamed': [fn('execute_workflow', 'Run a workflow.', { script: { type: 'string' } }, ['script'])],
}

const creds = loadDshCredentials()
const modelOverride = process.argv[process.argv.indexOf('--model') + 1]
if (modelOverride) creds.model = modelOverride
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const messages = [{ role: 'system', content: MINIMAL_SYSTEM }, { role: 'user', content: USER_PROMPT }]

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model: creds.model, cells: Object.keys(cells) }, null, 2))
  process.exit(0)
}

for (const [id, extra] of Object.entries(cells)) {
  const tools = [...buildTools(FILE6), ...extra]
  const rows = []
  for (let i = 0; i < nRuns; i++) {
    const first = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
    const { message, ...rest } = first
    rows.push(rest)
    await new Promise((r) => setTimeout(r, 400))
  }
  const labels = {}
  const firstTokens = {}
  let letMe = 0, we = 0
  for (const r of rows) {
    labels[r.classification] = (labels[r.classification] || 0) + 1
    firstTokens[r.metrics.firstToken] = (firstTokens[r.metrics.firstToken] || 0) + 1
    letMe += r.metrics.letMe; we += r.metrics.we
  }
  console.log(JSON.stringify({
    id,
    labels,
    firstTokens: Object.entries(firstTokens).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}x${v}`).join(' '),
    avg: { we: (we / nRuns).toFixed(1), letMe: (letMe / nRuns).toFixed(1) },
  }))
}

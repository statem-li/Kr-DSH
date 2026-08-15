/**
 * Extra ablation: which catalog additions perturb the Pro minimal trajectory?
 * Hypothesis from matrix: control-plane tools (subagent/goal/jobs/workflow)
 * perturb, file tools do not. Each cell = minimal persona + file6 + one
 * control-plane family, n runs, output sanitized.
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { MINIMAL_SYSTEM, USER_PROMPT, buildTools, fn } from './scaffolds.mjs'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const FILE6 = ['bash', 'read', 'edit', 'write', 'glob', 'grep']

const CONTROL = {
  subagent: [
    fn('subagent', 'Delegate a self-contained task to a subagent.', { prompt: { type: 'string' } }, ['prompt']),
    fn('subagent_fork', 'Delegate a task to a subagent that inherits this conversation.', { prompt: { type: 'string' } }, ['prompt']),
  ],
  jobs: [
    fn('job_list', 'List background jobs.', {}, []),
    fn('job_output', 'Read a background job output.', { job_id: { type: 'string' } }, ['job_id']),
    fn('job_kill', 'Request cancellation of a background job.', { job_id: { type: 'string' } }, ['job_id']),
  ],
  goals: [
    fn('create_goal', 'Create a persisted same-session completion goal.', { objective: { type: 'string' } }, ['objective']),
    fn('update_goal', 'Update the current goal.', { action: { type: 'string' } }, ['action']),
    fn('get_goal', 'Read the current goal.', {}, []),
  ],
  workflow: [
    fn('workflow', 'Run a JavaScript workflow script that orchestrates subagents.', { script: { type: 'string' } }, ['script']),
    fn('skill', 'Load the full instructions for an available skill.', { name: { type: 'string' } }, ['name']),
    fn('exit_plan_mode', 'Present the plan and leave plan mode.', { plan: { type: 'string' } }, ['plan']),
  ],
  interact: [
    fn('ask_user_question', 'Ask the user a concise question.', { questions: { type: 'array' } }, ['questions']),
    fn('web_search', 'Search the web for current information.', { query: { type: 'string' } }, ['query']),
  ],
}

const creds = loadDshCredentials()
const modelOverride = process.argv[process.argv.indexOf('--model') + 1]
if (modelOverride) creds.model = modelOverride
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const messages = [{ role: 'system', content: MINIMAL_SYSTEM }, { role: 'user', content: USER_PROMPT }]

if (!run) {
  console.log(JSON.stringify({
    dryRun: true, model: creds.model,
    cells: Object.keys(CONTROL).map((k) => ({ id: `X-${k}`, tools: [...FILE6, ...CONTROL[k].map((t) => t.function.name)] })),
  }, null, 2))
  process.exit(0)
}

function strip(turn) {
  const { message, ...rest } = turn
  return rest
}

const results = []
for (const [family, extra] of Object.entries(CONTROL)) {
  const tools = [...buildTools(FILE6), ...extra]
  const rows = []
  for (let i = 0; i < nRuns; i++) {
    const first = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
    rows.push(strip(first))
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
  const line = { id: `X-${family}`, labels, firstTokens: Object.entries(firstTokens).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}x${v}`).join(' '), avg: { we: (we / nRuns).toFixed(1), letMe: (letMe / nRuns).toFixed(1) } }
  console.log(JSON.stringify(line))
  results.push({ ...line, runs: rows })
}

await mkdir(resolve('results'), { recursive: true })
const outPath = resolve('results', `extra-${new Date().toISOString().replaceAll(':', '-')}.json`)
await writeFile(outPath, `${JSON.stringify({ model: creds.model, results }, null, 2)}\n`, 'utf8')
console.log(`saved: ${outPath}`)

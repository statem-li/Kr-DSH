/**
 * P8 — domain-overlap scan: does an internal task-routing region exist?
 *
 * Hypothesis (user): the "unstable" band may be an attractor-competition
 * region where INTERNAL routing is active but its boundary is narrow. If a
 * persona exists under which behavior follows the TASK (maint → plan,
 * green → doer), the model CAN self-route inside that narrow domain.
 *
 * Design: persona strength × task direction grid. For each persona, measure
 * the task-discrimination score = planScore(maint) − planScore(green), where
 * planScore = we − letMe (normalized). |Δ| ≈ 0 → no internal routing;
 * |Δ| large with the right sign → routing domain found.
 *
 * Usage: node run-domainscan.mjs --run [--n 2] [--model X]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { USER_PROMPT, buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '2')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'

const TASK_GREEN = 'Write a JavaScript module solve.js exporting gcd(a,b) and csvSum(path). Deliver working code now — this is a build task, produce it directly.'
const TASK_MAINT = 'Fix the broken login handler in this repository: the endpoint returns 500 on valid credentials. Inspect the auth code first, find the regression, and repair it carefully.'

const PERSONAS = {
  'neutral': 'You are a helpful assistant.',
  'spec': personaFor(0),
  'spec-mixed': personaFor(0.3), // competition-region light
  'mixed': personaFor(0.5),
  'react-weak': personaFor(0.7),
  'react': personaFor(1),
  'router-v1': 'You are a software engineer. Choose your working style from the task: greenfield/build → work DIRECTLY and produce code fast; maintenance/fix → inspect first and plan before changing. Decide once, at the start, from the user request.',
  'router-v2': 'You are a software engineer. Match your working style to the task type.\nExample 1: "fix the broken login flow" → inspect first, plan, then edit carefully.\nExample 2: "write a new CSV processing script" → write the code directly and verify it runs.\nFollow the same rule for the actual request.',
}

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const tools = buildTools(['bash', 'read', 'write', 'edit'])

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, personas: Object.keys(PERSONAS), note: '--run to send' }, null, 2))
  process.exit(0)
}

function planScore(r) {
  // positive = plan-collective, negative = doer
  return r.metrics.we - r.metrics.letMe
}

for (const [label, system] of Object.entries(PERSONAS)) {
  const scores = { maint: [], green: [] }
  for (const [taskLabel, task] of [['maint', TASK_MAINT], ['green', TASK_GREEN]]) {
    for (let i = 0; i < nRuns; i++) {
      const r = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: task }], model: creds.model, tools })
      scores[taskLabel].push(planScore(r))
      await new Promise((r2) => setTimeout(r2, 300))
    }
  }
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  const m = mean(scores.maint)
  const g = mean(scores.green)
  const discrimination = (m - g).toFixed(2)
  console.log(JSON.stringify({ persona: label, planMaint: m.toFixed(2), planGreen: g.toFixed(2), discrimination, routing: Math.abs(m - g) >= 1 ? (m > g ? 'maint→plan only' : 'green→doer only') : 'none' }))
}

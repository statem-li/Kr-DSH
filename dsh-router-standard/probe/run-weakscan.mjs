/**
 * P11 — fine scan of the weak (internal-routing) domain, dual-model.
 * Finds the persona with maximal task discrimination (internal routing
 * strength) and checks whether the optimum is shared between V4 Pro and
 * V4 Flash.
 *
 * Usage: node run-weakscan.mjs --run [--n 3] [--model X]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { USER_PROMPT, buildTools } from './scaffolds.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')

const TASK_GREEN = 'Write a JavaScript module solve.js exporting gcd(a,b) and csvSum(path). Deliver working code now — this is a build task, produce it directly.'
const TASK_MAINT = 'Fix the broken login handler in this repository: the endpoint returns 500 on valid credentials. Inspect the auth code first, find the regression, and repair it carefully.'

const MINIMAL = 'You are a helpful software engineer assistant.'
const NEUTRAL = 'You are a helpful assistant.'
const V2 = 'You are a software engineer. Match your working style to the task type.\nExample 1: "fix the broken login flow" → inspect first, plan, then edit carefully.\nExample 2: "write a new CSV processing script" → write the code directly and verify it runs.\nFollow the same rule for the actual request.'

const PERSONAS = {
  'w1-neutral': NEUTRAL,
  'w2-neutral-task': NEUTRAL + '\nComplete the user\'s request.',
  'w3-router-v2': V2,
  'w4-router-v2-strong': V2 + '\nThis rule is important: choose the style FIRST, then act consistently.',
  'w5-spec+route': MINIMAL + '\nAdapt your working style to the task type: build → direct production; fix → inspect and plan first.',
  'w6-spec+fewshot': MINIMAL + '\n' + V2.split('\n').slice(1).join('\n'),
  'w7-neutral+explicit': NEUTRAL + '\nBefore acting, decide the task type (build or fix) and adopt the matching style: build → hands-on production; fix → inspect-and-plan.',
  'w8-neutral+role': NEUTRAL + '\nFor build tasks act as a hands-on engineer who produces code fast; for fix tasks act as a careful maintainer who inspects first.',
  'w9-neutral+lean-react': NEUTRAL + '\nPrefer direct action: write or edit code, then verify by running. Keep planning brief.',
}

const creds = loadDshCredentials()
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const tools = buildTools(['bash', 'read', 'write', 'edit'])

if (!run) {
  console.log(JSON.stringify({ dryRun: true, n: nRuns, personas: Object.keys(PERSONAS), note: '--run to send; --model to pick' }, null, 2))
  process.exit(0)
}

const models = process.argv.includes('--model')
  ? [process.argv[process.argv.indexOf('--model') + 1]]
  : ['deepseek-v4-pro', 'deepseek-v4-flash']

function planScore(r) {
  return r.metrics.we - r.metrics.letMe
}

for (const model of models) {
  creds.model = model
  for (const [label, system] of Object.entries(PERSONAS)) {
    const scores = { maint: [], green: [] }
    for (const [taskLabel, task] of [['maint', TASK_MAINT], ['green', TASK_GREEN]]) {
      for (let i = 0; i < nRuns; i++) {
        const r = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: task }], model: creds.model, tools })
        scores[taskLabel].push(planScore(r))
        await new Promise((r2) => setTimeout(r2, 250))
      }
    }
    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
    const m = mean(scores.maint)
    const g = mean(scores.green)
    console.log(JSON.stringify({ model, persona: label, planMaint: m.toFixed(2), planGreen: g.toFixed(2), discrimination: (m - g).toFixed(2) }))
  }
}

/**
 * P5 test — instruction-following self-routing: can a "router persona"
 * (instructions to pick the working style from the task) make the model
 * self-route on the FIRST request? Three variants × two task types × n runs.
 * Prediction (dual-attractor theory): partially works, but with errors and
 * bias; the model is not a reliable router.
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { USER_PROMPT, buildTools } from './scaffolds.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '2')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'

const TASK_GREEN = 'Write a Python script that reads a CSV file data.csv with two columns and prints the sum of the products of each row. Deliver working code now.'

const VARIANTS = {
  'v1-instruct': 'You are a software engineer. Choose your working style from the task: for greenfield/build tasks (create, write, generate, build from scratch) work DIRECTLY and produce code fast; for maintenance/fix tasks (fix, debug, refactor, repair) inspect first and plan before changing. Decide once, at the start, from the user request.',
  'v2-fewshot': 'You are a software engineer. Match your working style to the task type.\nExample 1: user asks to "fix the broken login flow" -> you inspect the code first, plan the change, then edit carefully.\nExample 2: user asks to "write a new CSV processing script" -> you write the code directly and verify it runs.\nFollow the same rule for the actual request.',
  'v3-explicit': 'You are a software engineer. Before acting, classify the task and start your reasoning with exactly one line: TASK_TYPE: build or TASK_TYPE: fix. Then adopt the matching style: build -> direct production; fix -> inspect-and-plan first.',
}

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const tools = buildTools(['bash', 'read', 'write', 'edit'])

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, variants: Object.keys(VARIANTS), note: '--run to send' }, null, 2))
  process.exit(0)
}

for (const [variant, system] of Object.entries(VARIANTS)) {
  for (const [taskLabel, task] of [['maint', USER_PROMPT], ['green', TASK_GREEN]]) {
    for (let i = 0; i < nRuns; i++) {
      const r = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: task }], model: creds.model, tools })
      const brief = `${r.classification}/${r.metrics.firstToken}(we=${r.metrics.we},lm=${r.metrics.letMe})`
      console.log(JSON.stringify({ variant, task: taskLabel, run: i, result: brief, tools: r.toolNames }))
      await new Promise((r2) => setTimeout(r2, 300))
    }
  }
}

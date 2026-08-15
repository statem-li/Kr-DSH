/**
 * P3 test — self-routing impossibility: a session FIXED to one persona
 * receives first a maintenance task, then a greenfield task. Prediction:
 * the trajectory does NOT follow the task change (path commitment); the mode
 * is fixed by the first request.
 *
 * Sanitized output. Usage: node run-noroute.mjs --run [--model X] [--n 2]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn, appendSyntheticToolResults } from './probe.mjs'
import { MINIMAL_SYSTEM, USER_PROMPT, buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '2')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'

const TASK_MAINT = USER_PROMPT // "inspect repository, read README" (spec-leaning)
const TASK_GREEN = 'Write a Python script that reads a CSV file data.csv with two columns and prints the sum of the products of each row. Deliver working code now.'

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const tools = buildTools(['bash', 'read', 'write', 'edit'])

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, note: '--run to send' }, null, 2))
  process.exit(0)
}

const conds = [
  { label: 'spec-fixed', system: personaFor(0) },
  { label: 'react-fixed', system: personaFor(1) },
]

for (const cond of conds) {
  for (let i = 0; i < nRuns; i++) {
    const m1 = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages: [{ role: 'system', content: cond.system }, { role: 'user', content: TASK_MAINT }], model: creds.model, tools })
    // carry m1's reasoning_content through (thinking-mode requirement) and
    // answer any tool calls with synthetic results before the green task
    const history = appendSyntheticToolResults(
      [{ role: 'system', content: cond.system }, { role: 'user', content: TASK_MAINT }],
      m1.message,
    )
    history.push({ role: 'user', content: TASK_GREEN })
    const m2 = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages: history, model: creds.model, tools })
    const brief = (r) => `${r.classification}/${r.metrics.firstToken}(we=${r.metrics.we},lm=${r.metrics.letMe})`
    console.log(JSON.stringify({ cond: cond.label, run: i, maint: brief(m1), green: brief(m2), greenTools: m2.toolNames }))
    await new Promise((r) => setTimeout(r, 300))
  }
}

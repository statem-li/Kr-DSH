/**
 * P6 test — tail-persona: does a persona placed at the END of the user
 * message (instead of the system role) trigger the same trajectories as the
 * system persona? If yes, mid-session mode switches can be done as tail
 * deltas that keep the prefix cache fully hit. Prediction (dual-attractor):
 * weaker or ineffective — identity instructions are condition-position
 * sensitive.
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { USER_PROMPT, buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '2')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'

const TASK_GREEN = 'Write a Python script that reads a CSV file data.csv with two columns and prints the sum of the products of each row. Deliver working code now.'
const NEUTRAL_SYSTEM = 'You are a helpful assistant.'

const specText = personaFor(0)
const reactText = personaFor(1)

const conds = [
  // [label, system, userBuilder]
  { label: 'sys-spec', system: specText, user: (t) => t },
  { label: 'tail-spec', system: NEUTRAL_SYSTEM, user: (t) => `${t}\n\n---\n${specText}` },
  { label: 'sys-react', system: reactText, user: (t) => t },
  { label: 'tail-react', system: NEUTRAL_SYSTEM, user: (t) => `${t}\n\n---\n${reactText}` },
]

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const tools = buildTools(['bash', 'read', 'write', 'edit'])

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, conds: conds.map((c) => c.label), note: '--run to send' }, null, 2))
  process.exit(0)
}

for (const cond of conds) {
  for (const [taskLabel, task] of [['maint', USER_PROMPT], ['green', TASK_GREEN]]) {
    for (let i = 0; i < nRuns; i++) {
      const r = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages: [{ role: 'system', content: cond.system }, { role: 'user', content: cond.user(task) }], model: creds.model, tools })
      const brief = `${r.classification}/${r.metrics.firstToken}(we=${r.metrics.we},lm=${r.metrics.letMe})`
      console.log(JSON.stringify({ cond: cond.label, task: taskLabel, run: i, result: brief, tools: r.toolNames }))
      await new Promise((r2) => setTimeout(r2, 300))
    }
  }
}

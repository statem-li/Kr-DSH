/**
 * P12 — multi-round routing stability: does the weak (internal-routing)
 * persona keep routing each NEW task correctly across consecutive rounds,
 * or does path commitment lock the first decision?
 *
 * Session: system = model-specific weak persona (flash w7). Task sequence:
 * maint → green → maint → green → maint (varied texts). Per round we measure
 * planScore and check maint-rounds > green-rounds (routing correct).
 *
 * Usage: node run-multiround.mjs --run [--n 3] [--model deepseek-v4-flash]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn, appendSyntheticToolResults } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-flash'

const MAINT = [
  'Fix the broken login handler: the endpoint returns 500 on valid credentials. Inspect the auth code, find the regression, repair it.',
  'The CSV parser crashes on rows with quoted commas. Find the bug in parser.js and fix it.',
  'A memory leak in the worker loop: heap grows on every tick. Inspect worker.js and repair the leak.',
]
const GREEN = [
  'Write a JavaScript module gcd.js exporting gcd(a,b) — no libraries. Deliver working code now.',
  'Write a shopping-cart module cart.js (addItem/removeItem/total). Deliver working code now.',
  'Write a markdown-link extractor links.js exporting extractLinks(text). Deliver working code now.',
]

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const tools = buildTools(['bash', 'read', 'write', 'edit'])
const system = personaFor('weak', model)

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, persona: system.slice(0, 60), rounds: MAINT.length + GREEN.length, note: '--run to send' }, null, 2))
  process.exit(0)
}

function planScore(r) {
  return r.metrics.we - r.metrics.letMe
}

const sequence = [
  { type: 'maint', text: MAINT[0] },
  { type: 'green', text: GREEN[0] },
  { type: 'maint', text: MAINT[1] },
  { type: 'green', text: GREEN[1] },
  { type: 'maint', text: MAINT[2] },
]

for (let runIdx = 0; runIdx < nRuns; runIdx++) {
  let messages = [{ role: 'system', content: system }]
  const rounds = []
  for (const [i, task] of sequence.entries()) {
    messages.push({ role: 'user', content: task.text })
    const turn = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
    const score = planScore(turn)
    rounds.push({
      round: i + 1,
      type: task.type,
      classification: turn.classification,
      firstToken: turn.metrics.firstToken,
      planScore: score,
      we: turn.metrics.we,
      letMe: turn.metrics.letMe,
      toolNames: turn.toolNames,
    })
    messages = appendSyntheticToolResults(messages, turn.message)
    await new Promise((r) => setTimeout(r, 250))
  }
  // routing verdict: every maint round must score >= every green round? No —
  // per-round direction: maint planScore should be >= green planScore on
  // adjacent pairs (maint_i vs green_i).
  let correct = 0
  const pairs = []
  for (let i = 0; i < rounds.length - 1; i += 2) {
    const m = rounds[i]
    const g = rounds[i + 1]
    const ok = m.planScore > g.planScore
    if (ok) correct++
    pairs.push({ maint: m.planScore, green: g.planScore, ok })
  }
  console.log(JSON.stringify({ run: runIdx, rounds, routing: `${correct}/${pairs.length} pairs correct`, pairs }))
}

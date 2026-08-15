/**
 * P15 — generative self-anchoring: forcing the FIRST TOKEN/SENTENCE of the
 * model's response (vs plain instruction text) as the style anchor.
 * Self-regressive prediction means the generated prefix conditions everything
 * after it — a "We need..." opener should anchor the plan register, "Let me"
 * the doer register, far stronger than instructions the model may ignore.
 *
 * 4 variants x 6 rounds x n, flash. Metrics: pair discrimination + decay.
 *
 * Usage: node run-firsttoken.mjs --run [--n 2] [--model deepseek-v4-flash]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn, appendSyntheticToolResults } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '2')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-flash'

const W7 = personaFor('weak', model)

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

// tail factories: given task type, return the appended guidance
const variants = {
  'a-baseline': () => '',
  'b-instruction': (type) => (type === 'maint'
    ? '\n\nRouter: this is a FIX task. Inspect first, then repair carefully.'
    : '\n\nRouter: this is a BUILD task. Write the code directly and verify it runs.'),
  'c-first-token': (type) => (type === 'maint'
    ? '\n\nStart your reasoning with the token: We'
    : '\n\nStart your reasoning with the token: Let'),
  'd-first-sentence': (type) => (type === 'maint'
    ? "\n\nStart your reasoning with the exact sentence: 'We need to inspect the code first.'"
    : "\n\nStart your reasoning with the exact sentence: 'Let me write the code directly.'"),
}

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, variants: Object.keys(variants), note: '--run to send' }, null, 2))
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
  { type: 'green', text: GREEN[2] },
]

for (const [label, tail] of Object.entries(variants)) {
  const pairStats = []
  for (let runIdx = 0; runIdx < nRuns; runIdx++) {
    let messages = [{ role: 'system', content: W7 }]
    const scores = []
    for (const [i, task] of sequence.entries()) {
      messages.push({ role: 'user', content: task.text + tail(task.type) })
      const turn = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      scores.push({ type: task.type, planScore: planScore(turn), firstToken: turn.metrics.firstToken })
      messages = appendSyntheticToolResults(messages, turn.message)
      await new Promise((r) => setTimeout(r, 250))
    }
    for (let i = 0; i < scores.length; i += 2) {
      const delta = scores[i].planScore - scores[i + 1].planScore
      if (!pairStats[i / 2]) pairStats[i / 2] = []
      pairStats[i / 2].push(delta)
    }
  }
  const out = { variant: label }
  pairStats.forEach((deltas, idx) => {
    out[`pair${idx + 1}`] = { deltas, mean: (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1) }
  })
  const first = pairStats[0].reduce((a, b) => a + b, 0) / pairStats[0].length
  const last = pairStats[pairStats.length - 1].reduce((a, b) => a + b, 0) / pairStats[pairStats.length - 1].length
  out.decay = `${first.toFixed(1)} -> ${last.toFixed(1)} (${(first - last).toFixed(1)})`
  console.log(JSON.stringify(out))
}

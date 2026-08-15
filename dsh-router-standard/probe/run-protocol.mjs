/**
 * P13 — zero-decay routing candidates: does a static multi-task protocol
 * (V2) and/or per-round task-boundary markers (V3) stop the multi-round
 * routing decay measured in P12?
 *
 * 4 variants x 6 rounds (maint/green x3) x n runs, flash weak domain.
 * Metric: per-pair discrimination + decay (pair1 delta vs pair3 delta).
 *
 * Usage: node run-protocol.mjs --run [--n 2] [--model deepseek-v4-flash]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn, appendSyntheticToolResults } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '2')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-flash'

const W7 = personaFor('weak', model)
const PROTOCOL = `
MULTI-TASK PROTOCOL (follow it on EVERY new user message):
1. Treat each new user message as a NEW, independent task (unless it is an obvious follow-up question).
2. Before acting, classify that message only: build (write/create/generate) -> hands-on production; fix (repair/debug/inspect) -> inspect first, then fix carefully.
3. The classification uses ONLY the current message. Ignore what earlier tasks did; each task gets a fresh style decision.`

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

const variants = [
  { label: 'v1-w7', system: W7, boundary: false },
  { label: 'v2-protocol', system: W7 + PROTOCOL, boundary: false },
  { label: 'v3-boundary', system: W7, boundary: true },
  { label: 'v4-combo', system: W7 + PROTOCOL, boundary: true },
]

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, variants: variants.map((v) => v.label), note: '--run to send' }, null, 2))
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

for (const variant of variants) {
  const pairStats = []
  for (let runIdx = 0; runIdx < nRuns; runIdx++) {
    let messages = [{ role: 'system', content: variant.system }]
    const scores = []
    for (const [i, task] of sequence.entries()) {
      const text = variant.boundary ? `<NEW TASK>\n${task.text}` : task.text
      messages.push({ role: 'user', content: text })
      const turn = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      scores.push({ type: task.type, planScore: planScore(turn), cls: turn.classification })
      messages = appendSyntheticToolResults(messages, turn.message)
      await new Promise((r) => setTimeout(r, 250))
    }
    for (let i = 0; i < scores.length; i += 2) {
      const delta = scores[i].planScore - scores[i + 1].planScore
      if (!pairStats[i / 2]) pairStats[i / 2] = []
      pairStats[i / 2].push(delta)
    }
  }
  const out = { variant: variant.label }
  pairStats.forEach((deltas, idx) => {
    out[`pair${idx + 1}`] = { deltas, mean: (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1) }
  })
  const first = pairStats[0].reduce((a, b) => a + b, 0) / pairStats[0].length
  const last = pairStats[pairStats.length - 1].reduce((a, b) => a + b, 0) / pairStats[pairStats.length - 1].length
  out.decay = `${first.toFixed(1)} -> ${last.toFixed(1)} (${(first - last).toFixed(1)})`
  console.log(JSON.stringify(out))
}

/**
 * P14 — near-field routing instruction: does a STRONG, CLOSE instruction
 * (appended to the current user message, not the system prefix) resist the
 * multi-round behavior-inertia decay? Three variants, 6 rounds, flash.
 *
 * Variants:
 *   a) baseline w7 (no instruction)
 *   b) external near-field: "Router: this is a FIX/BUILD task — <style>"
 *      appended to each user message (external classification, close field)
 *   c) internal near-field: "Classify this task (build/fix) and adopt the
 *      matching style" appended (close field, model decides)
 *
 * Usage: node run-nearfield.mjs --run [--n 2] [--model deepseek-v4-flash]
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

const FIX_TAIL = '\n\nRouter: this is a FIX task. Inspect first, then repair carefully.'
const BUILD_TAIL = '\n\nRouter: this is a BUILD task. Write the code directly and verify it runs.'
const INTERNAL_TAIL = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first.'

const variants = [
  { label: 'a-baseline', tail: () => '' },
  { label: 'b-external-near', tail: (type) => (type === 'maint' ? FIX_TAIL : BUILD_TAIL) },
  { label: 'c-internal-near', tail: () => INTERNAL_TAIL },
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
    let messages = [{ role: 'system', content: W7 }]
    const scores = []
    for (const [i, task] of sequence.entries()) {
      messages.push({ role: 'user', content: task.text + variant.tail(task.type) })
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

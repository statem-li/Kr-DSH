/**
 * P19 — anti-dilution guidance variants: which guidance text best resists
 * multi-round decay under the behavior-truth verdict? Four variants, 8
 * rounds, flash, cache hit-rate logged.
 *
 * Variants:
 *   v10   current: fixed P14-c text ("classify... adopt the matching style")
 *   e-full P16-e text: classify + task-specific first-token (external dir)
 *   e-self  fixed text + "start with We or Let based on your classification"
 *   boost   rounds 3+ get a stronger "NEW task, classify fresh" variant
 *
 * Usage: node run-boost.mjs --run [--n 3] [--model deepseek-v4-flash]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn, appendSyntheticToolResults } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-flash'

const W7 = personaFor('weak', model)
const EXPLORE = new Set(['bash', 'read', 'grep', 'glob'])
const PRODUCE = new Set(['write', 'edit'])

const BASE = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first.'
const E_FULL = (type) => '\n\nRouter: classify this task (build or fix), adopt the matching style, and start your reasoning with the token: ' + (type === 'maint' ? 'We' : 'Let')
const E_SELF = '\n\nRouter: classify this task (build or fix), adopt the matching style, and start your reasoning with the token We or Let based on your classification.'
const BOOST = '\n\nRouter: this is a NEW task, different from the previous ones. Classify it fresh (build or fix) and adopt the matching style — build: direct production; fix: inspect-first. Do not follow the previous task\'s style.'

const variants = {
  'v10-current': (type, round) => BASE,
  'e-full': (type, round) => E_FULL(type),
  'e-self': (type, round) => E_SELF,
  'boost': (type, round) => (round >= 3 ? BOOST : BASE),
}

const MAINT = [
  'Fix the broken login handler: the endpoint returns 500 on valid credentials. Inspect the auth code, find the regression, repair it.',
  'The CSV parser crashes on rows with quoted commas. Find the bug in parser.js and fix it.',
  'A memory leak in the worker loop: heap grows on every tick. Inspect worker.js and repair the leak.',
  'The config loader ignores the last line of the file. Inspect config.js and fix the parsing.',
]
const GREEN = [
  'Write a JavaScript module gcd.js exporting gcd(a,b) — no libraries. Deliver working code now.',
  'Write a shopping-cart module cart.js (addItem/removeItem/total). Deliver working code now.',
  'Write a markdown-link extractor links.js exporting extractLinks(text). Deliver working code now.',
  'Write a JSON formatter fmt.js exporting formatJson(text). Deliver working code now.',
]

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const tools = buildTools(['bash', 'read', 'write', 'edit', 'grep', 'glob'])

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, variants: Object.keys(variants), note: '--run to send' }, null, 2))
  process.exit(0)
}

/** Order-semantics behavior verdict (maint: explore-before-produce; green: produce used). */
function routeCorrect(turn, type) {
  const names = turn.toolNames ?? []
  if (names.length === 0) return false
  const firstProduce = names.findIndex((n) => PRODUCE.has(n))
  const hasExplore = names.some((n) => EXPLORE.has(n))
  if (type === 'maint') return hasExplore && (firstProduce === -1 || firstProduce > 0)
  return firstProduce !== -1
}

const sequence = [
  { type: 'maint', text: MAINT[0] },
  { type: 'green', text: GREEN[0] },
  { type: 'maint', text: MAINT[1] },
  { type: 'green', text: GREEN[1] },
  { type: 'maint', text: MAINT[2] },
  { type: 'green', text: GREEN[2] },
  { type: 'maint', text: MAINT[3] },
  { type: 'green', text: GREEN[3] },
]

for (const [label, tail] of Object.entries(variants)) {
  const perRound = []
  for (let runIdx = 0; runIdx < nRuns; runIdx++) {
    let messages = [{ role: 'system', content: W7 }]
    for (const [i, task] of sequence.entries()) {
      const round = i + 1
      messages.push({ role: 'user', content: task.text + tail(task.type, round) })
      const turn = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      if (!perRound[i]) perRound[i] = { correct: 0, total: 0, hit: 0, miss: 0 }
      const slot = perRound[i]
      if (routeCorrect(turn, task.type)) slot.correct++
      slot.total++
      slot.hit += turn.cache?.hit ?? 0
      slot.miss += turn.cache?.miss ?? 0
      messages = appendSyntheticToolResults(messages, turn.message)
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  const out = { variant: label, n: nRuns }
  perRound.forEach((slot, idx) => {
    const type = idx % 2 === 0 ? 'maint' : 'green'
    const cacheRate = slot.hit + slot.miss > 0 ? (slot.hit / (slot.hit + slot.miss)).toFixed(3) : 'n/a'
    out[`r${idx + 1}-${type}`] = { route: `${slot.correct}/${slot.total}`, cache: cacheRate }
  })
  const total = perRound.reduce((a, s) => a + s.correct, 0)
  const n = perRound.reduce((a, s) => a + s.total, 0)
  const hit = perRound.reduce((a, s) => a + s.hit, 0)
  const miss = perRound.reduce((a, s) => a + s.miss, 0)
  // decay check: first-half vs second-half routing accuracy
  const half = Math.floor(perRound.length / 2)
  const firstHalf = perRound.slice(0, half).reduce((a, s) => a + s.correct, 0)
  const firstN = perRound.slice(0, half).reduce((a, s) => a + s.total, 0)
  const secondHalf = perRound.slice(half).reduce((a, s) => a + s.correct, 0)
  const secondN = perRound.slice(half).reduce((a, s) => a + s.total, 0)
  out.total = {
    route: `${total}/${n} (${((total / n) * 100).toFixed(0)}%)`,
    cacheHitRate: hit + miss > 0 ? (hit / (hit + miss)).toFixed(3) : 'n/a',
    firstHalf: `${firstHalf}/${firstN}`,
    secondHalf: `${secondHalf}/${secondN}`,
  }
  console.log(JSON.stringify(out))
}

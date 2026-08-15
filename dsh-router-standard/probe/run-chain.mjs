/**
 * P21 — RELATED-task chain: same file (cart.js) evolving across rounds.
 * Does boost's "new task, do not follow previous style" break continuity
 * (e.g. repair rounds skip reading the existing code and rewrite)?
 *
 * Variants:
 *   a-baseline   no guidance
 *   b-boost      v11 guidance (rounds 3+ BOOST)
 *   c-continuity "same project, read the existing code first, then act per
 *                 task type (fix: locate+modify; extend: build on it)"
 *
 * Verdicts (behavior truth, related-task semantics):
 *   fix round    correct = explore precedes produce (read-before-modify)
 *   extend round correct = produce used (write/edit on cart.js)
 *   continuity   extra metric: fraction of rounds where the model READ the
 *                existing code (read in toolNames).
 *
 * Usage: node run-chain.mjs --run [--n 3] [--model deepseek-v4-flash]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn, appendSyntheticToolResults } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-flash'

const W7 = personaFor('weak', model)
const GUIDE_BASE = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first.'
const GUIDE_BOOST = '\n\nRouter: this is a NEW task, different from the previous ones. Classify it fresh (build or fix) and adopt the matching style — build: direct production; fix: inspect-first. Do not follow the previous task\'s style.'
const GUIDE_CONTINUITY = '\n\nRouter: this is a follow-up task on the SAME project. First read the existing code to understand the current state, then act by type: fix → locate the bug and modify; extend → build on the existing code. Keep the file cart.js.'
const GUIDE_DEEP = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply first, then commit and act.'

const EXPLORE = new Set(['bash', 'read', 'grep', 'glob'])
const PRODUCE = new Set(['write', 'edit'])

const variants = {
  'a-baseline': (round) => '',
  'b-boost': (round) => (round >= 3 ? GUIDE_BOOST : GUIDE_BASE),
  'c-continuity': (round) => GUIDE_CONTINUITY,
  'd-deep': (round) => GUIDE_DEEP,
}

const TASKS = [
  { type: 'extend', text: 'Write a shopping-cart module cart.js with addItem(name, price, qty) (same name merges qty), removeItem(name), and total(). Deliver working code now.' },
  { type: 'fix', text: 'The total() in cart.js is wrong: when the subtotal is >= 100 it should apply a 10% discount, but it does not. Find the bug and fix it.' },
  { type: 'extend', text: 'Add applyCoupon(code) to cart.js: \'SAVE10\' subtracts 10 from the total (floor 0), unknown codes throw an Error. Extend the existing module.' },
  { type: 'fix', text: 'applyCoupon in cart.js does not throw on unknown codes — it silently ignores them. Locate the issue and fix it to throw.' },
  { type: 'extend', text: 'Add exportSnapshot() to cart.js returning { items: [{name, price, qty}], coupon } so state can be serialized. Extend the existing module.' },
  { type: 'fix', text: 'removeItem in cart.js crashes when the name does not exist — it should be ignored. Find the bug and fix it.' },
  { type: 'extend', text: 'Add importSnapshot(snap) to cart.js to restore state from an exportSnapshot value. Extend the existing module.' },
  { type: 'fix', text: 'clear() in cart.js does not reset the applied coupon — the discount stays after clearing. Locate and fix.' },
]

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1536')
const tools = buildTools(['bash', 'read', 'write', 'edit', 'grep', 'glob'])

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, variants: Object.keys(variants), tasks: TASKS.length, note: '--run to send' }, null, 2))
  process.exit(0)
}

function verdict(turn, type) {
  const names = turn.toolNames ?? []
  if (names.length === 0) return { correct: false, read: false }
  const firstProduce = names.findIndex((n) => PRODUCE.has(n))
  const hasExplore = names.some((n) => EXPLORE.has(n))
  const read = names.includes('read')
  if (type === 'fix') return { correct: hasExplore && (firstProduce === -1 || firstProduce > 0), read }
  return { correct: firstProduce !== -1, read }
}

for (const [label, guide] of Object.entries(variants)) {
  const perRound = []
  for (let runIdx = 0; runIdx < nRuns; runIdx++) {
    let messages = [{ role: 'system', content: W7 }]
    for (const [i, task] of TASKS.entries()) {
      const round = i + 1
      messages.push({ role: 'user', content: task.text + guide(round) })
      const turn = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      if (!perRound[i]) perRound[i] = { correct: 0, total: 0, read: 0 }
      const slot = perRound[i]
      const v = verdict(turn, task.type)
      if (v.correct) slot.correct++
      if (v.read) slot.read++
      slot.total++
      messages = appendSyntheticToolResults(messages, turn.message)
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  const out = { variant: label, n: nRuns }
  perRound.forEach((slot, idx) => {
    const type = TASKS[idx].type
    out[`r${idx + 1}-${type}`] = { route: `${slot.correct}/${slot.total}`, read: `${slot.read}/${slot.total}` }
  })
  const n = perRound.reduce((a, s) => a + s.total, 0)
  const total = perRound.reduce((a, s) => a + s.correct, 0)
  const reads = perRound.reduce((a, s) => a + s.read, 0)
  const fixRounds = perRound.filter((_, i) => TASKS[i].type === 'fix')
  const fixN = fixRounds.reduce((a, s) => a + s.total, 0)
  const fixOk = fixRounds.reduce((a, s) => a + s.correct, 0)
  out.total = {
    route: `${total}/${n} (${((total / n) * 100).toFixed(0)}%)`,
    readContinuity: `${reads}/${n} (${((reads / n) * 100).toFixed(0)}%)`,
    fixRounds: `${fixOk}/${fixN} (${((fixOk / fixN) * 100).toFixed(0)}%)`,
  }
  console.log(JSON.stringify(out))
}

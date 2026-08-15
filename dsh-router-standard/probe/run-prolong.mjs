/**
 * P28 — Pro long-run routing accuracy: 20 alternating rounds (10 pairs),
 * behavior-truth verdict, anti-decay check (first half vs second half),
 * cache hit rate. Same bar as flash (P19/P20: 96-100%, anti-decay).
 *
 * Config under test = v18 Pro: w6c persona + deep-guide near-field.
 *
 * Usage: node run-prolong.mjs --run [--n 2] [--model deepseek-v4-pro]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn, appendSyntheticToolResults } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '2')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'
const PAIRS = 10

const W6C = 'You are a helpful software engineer assistant.\n'
  + 'Before acting, decide the task type (build or fix) and adopt the matching '
  + 'style: build → hands-on production; fix → inspect-and-plan.'

const GUIDE = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply first, then commit and act.'

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

const EXPLORE = new Set(['bash', 'read', 'grep', 'glob'])
const PRODUCE = new Set(['write', 'edit'])

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1536')
const tools = buildTools(['bash', 'read', 'write', 'edit', 'grep', 'glob'])

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, pairs: PAIRS, note: '--run to send' }, null, 2))
  process.exit(0)
}

async function sendTurnRetry(opts, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      return await sendTurn(opts)
    } catch (error) {
      const msg = String(error?.message || error)
      if (!/timeout|fetch failed|ECONN|UND_ERR|socket|network/i.test(msg)) throw error
      if (i === tries - 1) throw error
      await new Promise((r) => setTimeout(r, 4000 * (i + 1)))
    }
  }
}

function routeCorrect(turn, type) {
  const names = turn.toolNames ?? []
  if (names.length === 0) return false
  const firstProduce = names.findIndex((n) => PRODUCE.has(n))
  const hasExplore = names.some((n) => EXPLORE.has(n))
  if (type === 'maint') return hasExplore && (firstProduce === -1 || firstProduce > 0)
  return firstProduce !== -1
}

// build the sequence: 10 pairs, cycling task texts
const sequence = []
for (let p = 0; p < PAIRS; p++) {
  sequence.push({ type: 'maint', text: MAINT[p % MAINT.length] })
  sequence.push({ type: 'green', text: GREEN[p % GREEN.length] })
}

const perRound = []
for (let runIdx = 0; runIdx < nRuns; runIdx++) {
  let messages = [{ role: 'system', content: W6C }]
  for (const [i, task] of sequence.entries()) {
    messages.push({ role: 'user', content: task.text + GUIDE })
    const turn = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
    if (!perRound[i]) perRound[i] = { correct: 0, total: 0, hit: 0, miss: 0 }
    const slot = perRound[i]
    if (routeCorrect(turn, task.type)) slot.correct++
    slot.total++
    slot.hit += turn.cache?.hit ?? 0
    slot.miss += turn.cache?.miss ?? 0
    messages = appendSyntheticToolResults(messages, turn.message)
    await new Promise((r) => setTimeout(r, 300))
  }
}

const out = { variant: 'pro-w6c-guide-v18', n: nRuns, pairs: PAIRS }
perRound.forEach((slot, idx) => {
  const type = idx % 2 === 0 ? 'maint' : 'green'
  const cacheRate = slot.hit + slot.miss > 0 ? (slot.hit / (slot.hit + slot.miss)).toFixed(3) : 'n/a'
  out[`r${idx + 1}-${type}`] = { route: `${slot.correct}/${slot.total}`, cache: cacheRate }
})
const n = perRound.reduce((a, s) => a + s.total, 0)
const total = perRound.reduce((a, s) => a + s.correct, 0)
const hit = perRound.reduce((a, s) => a + s.hit, 0)
const miss = perRound.reduce((a, s) => a + s.miss, 0)
const half = Math.floor(perRound.length / 2)
const fh = perRound.slice(0, half).reduce((a, s) => a + s.correct, 0)
const fhn = perRound.slice(0, half).reduce((a, s) => a + s.total, 0)
const sh = perRound.slice(half).reduce((a, s) => a + s.correct, 0)
const shn = perRound.slice(half).reduce((a, s) => a + s.total, 0)
out.total = {
  route: `${total}/${n} (${((total / n) * 100).toFixed(0)}%)`,
  cacheHitRate: hit + miss > 0 ? (hit / (hit + miss)).toFixed(3) : 'n/a',
  firstHalf: `${fh}/${fhn}`,
  secondHalf: `${sh}/${shn}`,
  decay: shn > 0 ? (sh / shn - fh / fhn).toFixed(2) : 'n/a',
}
console.log(JSON.stringify(out))

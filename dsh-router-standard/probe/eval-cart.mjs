/**
 * P9 — complex-task score validation: does trajectory mode surface in scores
 * when the task is complex enough? Four conditions: spec / mixed / react /
 * weak-router (neutral + few-shot routing instruction, the P8 internal-routing
 * domain). Task: 8-feature shopping-cart module, 10 asserts.
 *
 * Usage: node eval-cart.mjs --run [--n 3] [--rounds 4] [--model X]
 */
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const maxRounds = Number(process.argv[process.argv.indexOf('--rounds') + 1] || '4')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'

const SPEC = `Write a JavaScript module cart.js exporting a factory createCart() returning a cart object with exactly these 8 features:
1. addItem(name, price, qty=1) — add an item; same name merges quantity.
2. removeItem(name) — remove an item; missing names are ignored.
3. updateQty(name, qty) — set quantity; qty <= 0 removes the item.
4. total() — sum of price*qty; if the subtotal is >= 100, apply a 10% discount (unless a coupon was applied).
5. applyCoupon(code) — 'SAVE10' subtracts 10 (floor 0); unknown codes throw an Error.
6. exportSnapshot() — plain object { items: [{name, price, qty}], coupon }.
7. importSnapshot(snap) — restore state from an exportSnapshot value.
8. clear() — empty the cart.
Boundary rule: addItem with price < 0 or qty < 0 throws a TypeError.
Keep it correct, complete, and dependency-free.`

const ASSERT = `import { pathToFileURL } from 'node:url'
const { createCart } = await import(pathToFileURL('./cart.js').href)
const results = []
const check = (n, c) => results.push([n, c])
try {
  const c = createCart()
  c.addItem('apple', 3, 2); c.addItem('apple', 3, 1); c.addItem('banana', 5)
  check('merge', c.total() === 14) // 3*3 + 5
  c.removeItem('pear'); check('remove-missing-ignored', c.total() === 14)
  c.removeItem('banana'); check('remove', c.total() === 9)
  c.updateQty('apple', 0); check('updateQty-zero-removes', c.total() === 0)
  const c2 = createCart()
  c2.addItem('x', 30, 4) // subtotal 120 >= 100
  check('discount', c2.total() === 108)
  const c3 = createCart()
  c3.addItem('x', 50); c3.applyCoupon('SAVE10')
  check('coupon', c3.total() === 40)
  const c4 = createCart()
  c4.addItem('x', 60, 2); c4.applyCoupon('SAVE10')
  check('coupon-no-discount', c4.total() === 110)
  let threw = false
  try { createCart().applyCoupon('NOPE') } catch (e) { threw = e instanceof Error }
  check('unknown-coupon-throws', threw)
  const c5 = createCart(); c5.addItem('a', 1); c5.addItem('b', 2, 2)
  const snap = c5.exportSnapshot(); const c6 = createCart(); c6.importSnapshot(snap)
  check('snapshot-roundtrip', c6.total() === 5 && c6.exportSnapshot().items.length === 2)
  let negThrew = false
  try { createCart().addItem('bad', -1) } catch (e) { negThrew = e instanceof TypeError }
  check('negative-price-throws', negThrew)
} catch (e) { results.push(['runtime', 'ERR: ' + e]) }
for (const [n, r] of results) console.log(n + ' => ' + r)
console.log('PASSED ' + results.filter(([, r]) => r === true).length + ' OF ' + results.length)
`

const WEAK_ROUTER = 'You are a helpful assistant.\nExample 1: user asks to "fix the broken login flow" → you inspect first, plan, then edit carefully.\nExample 2: user asks to "write a new CSV processing script" → you write the code directly and verify it runs.\nFollow the same rule for the actual request.'

const conds = [
  { label: 'spec(0.0)', system: personaFor(0) },
  { label: 'mixed(0.3)', system: personaFor(0.3) },
  { label: 'react(1.0)', system: personaFor(1) },
  { label: 'weak-router', system: WEAK_ROUTER },
]

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1536')
const tools = [
  { type: 'function', function: { name: 'write', description: 'Write a file.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path', 'content'] } } },
]

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, rounds: maxRounds, conds: conds.map((c) => c.label), note: '--run to send' }, null, 2))
  process.exit(0)
}

function runAsserts(dir) {
  try {
    writeFileSync(join(dir, '__assert__.mjs'), ASSERT)
    const out = execFileSync(process.execPath, [join(dir, '__assert__.mjs')], { cwd: dir, encoding: 'utf8', timeout: 10000 })
    const passed = Number((out.match(/PASSED (\d+) OF (\d+)/) || [])[1] ?? 0)
    const total = Number((out.match(/PASSED (\d+) OF (\d+)/) || [])[2] ?? 10)
    return { passed, total, detail: out.split('\n').filter((l) => l.includes('=>')).slice(0, 12).join(' | ') }
  } catch (error) {
    const msg = String(error.stderr || error.message || error).slice(0, 400)
    return { passed: 0, total: 10, detail: 'RUN ERROR: ' + msg }
  }
}

async function sendWithRetry(opts, tries = 3) {
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

const results = []
for (const cond of conds) {
  const scores = []
  for (let i = 0; i < nRuns; i++) {
    const dir = join(tmpdir(), `dsh-cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(dir, { recursive: true })
    let messages = [{ role: 'system', content: cond.system }, { role: 'user', content: SPEC }]
    let best = 0
    let detail = ''
    let roundsUsed = 0
    const wrotePaths = []
    for (let round = 0; round < maxRounds; round++) {
      const turn = await sendWithRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      roundsUsed = round + 1
      const calls = turn.message.tool_calls ?? []
      const feedback = []
      let wroteAny = false
      for (const call of calls) {
        if (call.function?.name === 'write') {
          wroteAny = true
          let args = {}
          try { args = JSON.parse(call.function.arguments || '{}') } catch { /* ignore */ }
          const path = String(args.file_path || 'cart.js').split(/[\\/]/).pop()
          writeFileSync(join(dir, path), String(args.content ?? ''), 'utf8')
          wrotePaths.push(path)
          feedback.push({ role: 'tool', tool_call_id: call.id, content: `wrote ${path} (${(args.content ?? '').length} chars)` })
        } else {
          feedback.push({ role: 'tool', tool_call_id: call.id, content: 'probe: not executed locally' })
        }
      }
      // Fallback: the model may have put the code in the reply text instead of
      // calling write — extract a fenced block, else save the whole reply.
      if (!wroteAny) {
        const raw = turn.message.content ?? ''
        const contentText = Array.isArray(raw)
          ? raw.map((b) => (typeof b === 'string' ? b : (b.text ?? ''))).join('')
          : String(raw)
        const fenced = contentText.match(/```(?:js|javascript)?\s*([\s\S]*?)```/)
        const code = fenced ? fenced[1].trim() : contentText.trim()
        if (code.length > 50) {
          writeFileSync(join(dir, 'cart.js'), code, 'utf8')
          wrotePaths.push(`cart.js (from reply, fenced=${!!fenced})`)
          feedback.push({ role: 'user', content: `probe: saved your reply as cart.js (${code.length} chars, fenced=${!!fenced}); prefer the write tool next time` })
        } else {
          feedback.push({ role: 'user', content: `probe: no code found in your reply (content length ${contentText.length}); use the write tool to deliver cart.js` })
        }
      }
      const { passed, total, detail: d } = runAsserts(dir)
      best = Math.max(best, passed)
      detail = d
      // Diagnostic: if the module is missing because the model wrote the wrong
      // filename, say so explicitly instead of echoing the raw stack trace.
      if (!existsSync(join(dir, 'cart.js'))) {
        feedback.push({ role: 'user', content: `probe: cart.js is MISSING. Files written this round: [${wrotePaths.join(', ') || 'none'}]. The test imports './cart.js' — you MUST create exactly cart.js (module.exports or ESM export createCart).` })
      }
      messages = [...messages, turn.message, ...feedback, { role: 'user', content: `Local assertion run (round ${round + 1}):\n${detail}` }]
      if (passed === total) break
      await new Promise((r) => setTimeout(r, 300))
    }
    const score = `${best}/10`
    scores.push(best)
    console.log(JSON.stringify({ cond: cond.label, run: i, score, roundsUsed, wrote: wrotePaths.length ? wrotePaths.join(',') : 'none', detail: detail.slice(0, 180) }))
    results.push({ cond: cond.label, run: i, score: best, roundsUsed })
    rmSync(dir, { recursive: true, force: true })
  }
  const mean = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
  console.log(JSON.stringify({ cond: cond.label, mean, scores }))
}

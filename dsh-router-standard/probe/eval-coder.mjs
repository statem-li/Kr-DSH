/**
 * P2 score-level test — does the transition band degrade real-task scores?
 * Mini agent loop: model writes solve.py (fixed spec), we run local asserts,
 * failures are fed back as tool results, up to ROUNDS rounds. Score = passed
 * asserts / total. Personas: spec(0) / mixed(0.3) / react(1), n runs each.
 *
 * Sanitized output (no reasoning text). Usage:
 *   node eval-coder.mjs --run [--model X] [--n 3] [--rounds 4]
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const maxRounds = Number(process.argv[process.argv.indexOf('--rounds') + 1] || '4')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'

const SPEC = `Write a JavaScript module solve.js exporting exactly two functions:
1) gcd(a, b) — greatest common divisor of two integers, WITHOUT using any library or Math.gcd (it does not exist anyway).
2) csvSum(path) — read a CSV file with two numeric columns (no header) and return the sum of the products of each row (row[0] * row[1]).
Use Node's fs module for reading. Keep it simple, correct, and dependency-free.`

const ASSERT_CODE = `import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const solve = await import(pathToFileURL('./solve.js').href)
const results = []
const check = (name, cond) => results.push([name, cond])
try { check('gcd(12,8)', solve.gcd(12, 8) === 4) } catch (e) { results.push(['gcd(12,8)', 'ERR: ' + e]) }
try { check('gcd(17,5)', solve.gcd(17, 5) === 1) } catch (e) { results.push(['gcd(17,5)', 'ERR: ' + e]) }
try { check('gcd(0,7)', solve.gcd(0, 7) === 7) } catch (e) { results.push(['gcd(0,7)', 'ERR: ' + e]) }
try { check('gcd(-4,6)', solve.gcd(-4, 6) === 2) } catch (e) { results.push(['gcd(-4,6)', 'ERR: ' + e]) }
try { check('csvSum', solve.csvSum('data.csv') === 27) } catch (e) { results.push(['csvSum', 'ERR: ' + e]) }
for (const [n, r] of results) console.log(n + ' => ' + r)
console.log('PASSED ' + results.filter(([, r]) => r === true).length + ' OF ' + results.length)
`

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const tools = [
  { type: 'function', function: { name: 'write', description: 'Write a file.', parameters: { type: 'object', properties: { file_path: { type: 'string' }, content: { type: 'string' } }, required: ['file_path', 'content'] } } },
]

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, rounds: maxRounds, note: '--run to send' }, null, 2))
  process.exit(0)
}

function runAsserts(dir) {
  try {
    writeFileSync(join(dir, 'data.csv'), '2,3\n4,5\n1,1\n')
    writeFileSync(join(dir, '__assert__.mjs'), ASSERT_CODE)
    const out = execFileSync(process.execPath, [join(dir, '__assert__.mjs')], { cwd: dir, encoding: 'utf8', timeout: 10000 })
    const passed = Number((out.match(/PASSED (\d+) OF (\d+)/) || [])[1] ?? 0)
    const total = Number((out.match(/PASSED (\d+) OF (\d+)/) || [])[2] ?? 5)
    return { passed, total, detail: out.split('\n').filter((l) => l.includes('=>')).slice(0, 8).join(' | ') }
  } catch (error) {
    const msg = String(error.stderr || error.message || error).slice(0, 400)
    return { passed: 0, total: 5, detail: 'RUN ERROR: ' + msg }
  }
}

const conds = [
  { label: 'spec(0.0)', system: personaFor(0) },
  { label: 'mixed(0.3)', system: personaFor(0.3) },
  { label: 'react(1.0)', system: personaFor(1) },
]

const results = []
for (const cond of conds) {
  for (let i = 0; i < nRuns; i++) {
    const dir = join(tmpdir(), `dsh-eval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(dir, { recursive: true })
    let messages = [{ role: 'system', content: cond.system }, { role: 'user', content: SPEC }]
    let best = 0
    let detail = ''
    let wrote = false
    for (let round = 0; round < maxRounds; round++) {
      const turn = await sendTurn({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      // extract write calls
      const calls = turn.message.tool_calls ?? []
      let hasWrite = false
      const feedback = []
      for (const call of calls) {
        if (call.function?.name === 'write') {
          hasWrite = true
          let args = {}
          try { args = JSON.parse(call.function.arguments || '{}') } catch { /* ignore */ }
          const path = String(args.file_path || 'solve.py').split(/[\\/]/).pop()
          writeFileSync(join(dir, path), String(args.content ?? ''), 'utf8')
          feedback.push({ role: 'tool', tool_call_id: call.id, content: `wrote ${path} (${(args.content ?? '').length} chars)` })
        } else {
          feedback.push({ role: 'tool', tool_call_id: call.id, content: 'probe: not executed locally' })
        }
      }
      if (hasWrite) wrote = true
      const { passed, total, detail: d } = runAsserts(dir)
      best = Math.max(best, passed)
      detail = d
      messages = [...messages, turn.message, ...feedback, { role: 'user', content: `Local assertion run (round ${round + 1}):\n${detail}` }]
      if (passed === total) break
      await new Promise((r) => setTimeout(r, 300))
    }
    const score = `${best}/5`
    console.log(JSON.stringify({ cond: cond.label, run: i, score, wrote, roundsUsed: messages.filter((m) => m.role === 'user' && m.content !== SPEC).length, detail: detail.slice(0, 200) }))
    results.push({ cond: cond.label, run: i, score, wrote })
    rmSync(dir, { recursive: true, force: true })
  }
}

const byCond = {}
for (const r of results) {
  byCond[r.cond] = byCond[r.cond] || []
  byCond[r.cond].push(r.score)
}
console.log('SUMMARY ' + JSON.stringify(byCond))

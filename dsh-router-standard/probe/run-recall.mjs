/**
 * P22 — SINGLE-task long-chain anti-dilution: does a near-field
 * self-recall guidance stop the model from repeating completed exploration
 * steps (the plan-boundary amnesia pattern from session-044a30eb)?
 *
 * Task: open-ended exploration ("survey the repo, then write summary.md").
 * The model chooses tools freely; synthetic results carry REALISTIC content
 * (directory listing / file content / search snippets) so there is real
 * information to remember and repeat.
 *
 * Metric: repeat rate — same tool + similar arguments appearing again after
 * a completed step; plus completion (summary.md written).
 *
 * Variants (fixed text, cache-neutral):
 *   a-baseline          no guidance
 *   b-recall            "Before acting, briefly review what you have already
 *                        done in this session. Continue from where you left
 *                        off; do not repeat completed steps."
 *   c-recall-token      b + "Start your reasoning with a one-line review of
 *                        what you already did."
 *
 * Usage: node run-recall.mjs --run [--n 3] [--model deepseek-v4-flash]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-flash'

const W7 = personaFor('weak', model)

const TASK = 'Survey this repository: learn the directory structure, read the README, identify the main source files, and understand what the project does. Then write a summary.md with your findings. Work step by step.'

const RECALL = '\n\nRouter: before acting, briefly review what you have already done in this session. Continue from where you left off; do not repeat completed steps.'
const RECALL_TOKEN = '\n\nRouter: before acting, briefly review what you have already done in this session, and start your reasoning with a one-line review of what you already did. Continue from where you left off; do not repeat completed steps.'

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
const tools = buildTools(['bash', 'read', 'write', 'edit', 'grep', 'glob'])

/** Retry on transient network failures only. */
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

/** Realistic synthetic results per tool (fixed per call, information-rich). */
const RESULT_BY_TOOL = {
  bash: 'src/\n  main.js (12KB)\n  util.js (4KB)\n  data/\n    config.json\ntests/\n  main.test.js\nREADME.md\npackage.json',
  pwsh: 'src/\n  main.js (12KB)\n  util.js (4KB)\n  data/\n    config.json\ntests/\n  main.test.js\nREADME.md\npackage.json',
  read: '<file src/main.js>\nimport { loadConfig } from "./util.js"\nconst PORT = 8080\n// entry point: starts an HTTP server, loads config from data/config.json\n// 120 lines total\n</file>',
  glob: 'src/main.js\nsrc/util.js\nsrc/data/config.json\ntests/main.test.js\nREADME.md\npackage.json',
  grep: 'main.js:3: const PORT = 8080\nmain.js:10: server.listen(PORT)\nutil.js:1: export function loadConfig',
  edit: 'edited ok',
  write: 'summary.md written ok',
}

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, variants: ['a-baseline', 'b-recall', 'c-recall-token'], note: '--run to send' }, null, 2))
  process.exit(0)
}

function keyOf(turn) {
  // tool + first argument = the "action signature" used for repeat detection
  const calls = turn.message.tool_calls ?? []
  return calls.map((c) => {
    const name = c.function?.name ?? '?'
    let args = {}
    try { args = JSON.parse(c.function?.arguments || '{}') } catch { /* ignore */ }
    const arg = String(args.command ?? args.path ?? args.pattern ?? args.query ?? args.file_path ?? '').slice(0, 40)
    return `${name}:${arg}`
  })
}

function fuzzySame(a, b) {
  // identical or one is a prefix/close variant of the other (command/query reuse)
  if (a === b) return true
  const min = Math.min(a.length, b.length)
  if (min < 8) return false
  return a.slice(0, min) === b.slice(0, min) || b.slice(0, min) === a.slice(0, min)
}

const variants = {
  'a-baseline': () => '',
  'b-recall': () => RECALL,
  'c-recall-token': () => RECALL_TOKEN,
}

for (const [label, guide] of Object.entries(variants)) {
  const runs = []
  for (let runIdx = 0; runIdx < nRuns; runIdx++) {
    let messages = [{ role: 'system', content: W7 }, { role: 'user', content: TASK }]
    const seen = []
    let repeats = 0
    let wroteSummary = false
    let steps = 0
    for (let round = 0; round < 8; round++) {
      messages.push({ role: 'user', content: guide() })
      const turn = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      steps = round + 1
      const keys = keyOf(turn)
      for (const k of keys) {
        if (k.startsWith('write') || k.startsWith('edit')) {
          if (k.includes('summary.md')) wroteSummary = true
          continue
        }
        if (seen.some((s) => fuzzySame(s, k))) repeats++
        seen.push(k)
      }
      // append assistant + realistic tool results
      const calls = turn.message.tool_calls ?? []
      messages = [...messages, turn.message, ...calls.map((c) => ({
        role: 'tool',
        tool_call_id: c.id,
        content: RESULT_BY_TOOL[c.function?.name] ?? 'ok',
      }))]
      if (wroteSummary && !turn.toolNames.some((n) => n === 'write' || n === 'edit')) break
      if (wroteSummary) break
      await new Promise((r) => setTimeout(r, 250))
    }
    runs.push({ repeats, steps, wroteSummary, seen })
  }
  const totalSteps = runs.reduce((a, r) => a + r.steps, 0)
  const totalRepeats = runs.reduce((a, r) => a + r.repeats, 0)
  const completed = runs.filter((r) => r.wroteSummary).length
  const out = { variant: label, n: nRuns, completed: `${completed}/${nRuns}` }
  runs.forEach((r, i) => {
    out[`run${i}`] = { repeats: r.repeats, steps: r.steps, wroteSummary: r.wroteSummary, actions: r.seen.join(' | ') }
  })
  out.total = { repeatRate: `${totalRepeats}/${totalSteps} steps had repeats`, completed }
  console.log(JSON.stringify(out))
}

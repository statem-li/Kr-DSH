/**
 * P30 — thinking efficiency: maximize useful depth, minimize rumination.
 * Depth direction anchor (architecture/edge-cases, NOT environment) +
 * decision-closure (each reasoning block ends with a decision or info need).
 *
 * Metrics: completion, reasoning chars (depth), RUMINATION RATE (fraction
 * of reasoning tokens mentioning environment suspicion / re-confirmation /
 * tooling doubt — the "胡思乱想" line), steps, info coverage.
 *
 * Complex task (survey) × simple task (code), flash, n=3.
 *
 * Usage: node run-efficiency.mjs --run [--n 3] [--model deepseek-v4-flash]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-flash'
const MAX_STEPS = 16

const W7_NO_CONVERGE = 'You are a helpful assistant.\n'
  + 'Before acting, decide the task type (build or fix) and adopt the matching '
  + 'style: build → hands-on production; fix → inspect-and-plan.\n'
  + 'Before acting, briefly review what you have already done in this session and continue from where you left off; do not repeat completed steps. Do not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans.'

const GUIDE_CURRENT = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply and thoroughly; explore widely before producing. Produce when your information is complete.'
const GUIDE_DIRECTED = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply about the architecture, edge cases, and integration points. Do not spend reasoning on the environment or tooling. Produce when your information is complete.'
const GUIDE_CLOSED = GUIDE_DIRECTED + '\nEnd each reasoning block with a decision or an information need.'

const SURVEY = 'Survey this repository: learn the directory structure, read the README, identify the main source files, and understand what the project does. Then write a summary.md with your findings. Work step by step.'
const CODE = 'Write a JavaScript module gcd.js exporting gcd(a,b) — no libraries. Deliver working code now.'

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1536')
const tools = buildTools(['bash', 'read', 'write', 'edit', 'grep', 'glob'])

const RESULT_BY_TOOL = {
  bash: 'src/\n  main.js (12KB)\n  util.js (4KB)\n  data/\n    config.json\ntests/\n  main.test.js\nREADME.md\npackage.json',
  pwsh: 'src/\n  main.js (12KB)\n  util.js (4KB)\n  data/\n    config.json\ntests/\n  main.test.js\nREADME.md\npackage.json',
  read: '<file src/main.js>\nimport { loadConfig } from "./util.js"\nconst PORT = 8080\n// entry point: starts an HTTP server, loads config from data/config.json\n// 120 lines total\n</file>',
  glob: 'src/main.js\nsrc/util.js\nsrc/data/config.json\ntests/main.test.js\nREADME.md\npackage.json',
  grep: 'main.js:3: const PORT = 8080\nmain.js:10: server.listen(PORT)\nutil.js:1: export function loadConfig',
  edit: 'edited ok',
  write: 'summary.md written ok',
}

// rumination lexicon: environment suspicion / tool doubt / re-confirmation
const RUMINATE_RE = /\b(environment|tooling|bogus|canned|placeholder|mock|fake|suspicious|odd|weird|broken|bizarre|echoing|simulated|seems? (broken|fake|wrong)|doesn'?t (work|run|execute)|not (running|executing)|output (looks|seems|is))|(why|what) (is|does) (the|this) (bash|tool|shell|output)/gi

const variants = {
  'a-current': () => GUIDE_CURRENT,
  'b-directed': () => GUIDE_DIRECTED,
  'c-closed': () => GUIDE_CLOSED,
}

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, maxSteps: MAX_STEPS, variants: Object.keys(variants), note: '--run to send' }, null, 2))
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

for (const [taskLabel, task] of [['survey', SURVEY], ['code', CODE]]) {
  for (const [label, guide] of Object.entries(variants)) {
    const runs = []
    for (let runIdx = 0; runIdx < nRuns; runIdx++) {
      let messages = [{ role: 'system', content: W7_NO_CONVERGE }, { role: 'user', content: task + guide() }]
      let wrote = false
      let steps = 0
      let reasoningChars = 0
      let ruminationChars = 0
      for (let round = 0; round < MAX_STEPS; round++) {
        const turn = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
        steps = round + 1
        const r = String(turn.message.reasoning_content ?? turn.message.reasoning ?? '')
        reasoningChars += r.length
        const rum = r.match(RUMINATE_RE)
        if (rum) ruminationChars += rum.reduce((a, m) => a + m[0].length, 0)
        if (turn.toolNames.includes('write')) { wrote = true; break }
        const calls = turn.message.tool_calls ?? []
        messages = [...messages, turn.message, ...calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: RESULT_BY_TOOL[c.function?.name] ?? 'ok' }))]
        messages.push({ role: 'user', content: guide() })
        await new Promise((r2) => setTimeout(r2, 300))
      }
      runs.push({
        wrote, steps, reasoningChars,
        ruminationRate: reasoningChars > 0 ? (ruminationChars / reasoningChars).toFixed(3) : '0',
      })
    }
    const out = { task: taskLabel, variant: label, completed: `${runs.filter((r) => r.wrote).length}/${nRuns}` }
    runs.forEach((r, i) => {
      out[`run${i}`] = { wrote: r.wrote, steps: r.steps, chars: r.reasoningChars, ruminate: r.ruminationRate }
    })
    const avgSteps = (runs.reduce((a, r) => a + r.steps, 0) / runs.length).toFixed(1)
    const avgChars = Math.round(runs.reduce((a, r) => a + r.reasoningChars, 0) / runs.length)
    const avgRum = (runs.reduce((a, r) => a + Number(r.ruminationRate), 0) / runs.length).toFixed(3)
    out.total = { avgSteps, avgChars, avgRumination: avgRum }
    console.log(JSON.stringify(out))
  }
}

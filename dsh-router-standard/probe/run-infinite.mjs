/**
 * P27 — budget-free anti-dilution: convergence by INFORMATION COMPLETENESS,
 * not step limits. Step cap raised to 16 (≈ unlimited); variants add an
 * information-state anchor so the model stops exploring when it has enough,
 * naturally.
 *
 * Variants (Pro first; flash reference where noted):
 *   a-current     w6c + deep-guide (no info anchor) — P26 a at 16 steps
 *   b-info        a + "Produce as soon as you have read the README and main
 *                 source files — information completeness is your stop
 *                 signal, not step count."
 *   c-info-token  b + "Start each reasoning block with: INFO: complete or
 *                 partial — what is missing. When complete, produce."
 *
 * Usage: node run-infinite.mjs --run [--n 3] [--model deepseek-v4-pro]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'
const MAX_STEPS = 16

const W6C = 'You are a helpful software engineer assistant.\n'
  + 'Before acting, decide the task type (build or fix) and adopt the matching '
  + 'style: build → hands-on production; fix → inspect-and-plan.'

const SURVEY = 'Survey this repository: learn the directory structure, read the README, identify the main source files, and understand what the project does. Then write a summary.md with your findings. Work step by step.'

const GUIDE = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply first, then commit and act.'
const INFO = '\nProduce the deliverable as soon as you have read the README and the main source files — information completeness is your stop signal, not step count.'
const INFO_TOKEN = '\nStart each reasoning block with: INFO: complete or partial — what is missing. When complete, produce.'

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

const variants = {
  'a-current': (round) => GUIDE,
  'b-info': (round) => GUIDE + INFO,
  'c-info-token': (round) => GUIDE + INFO + INFO_TOKEN,
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

for (const [label, guide] of Object.entries(variants)) {
  const runs = []
  for (let runIdx = 0; runIdx < nRuns; runIdx++) {
    let messages = [{ role: 'system', content: W6C }, { role: 'user', content: SURVEY + guide(1) }]
    let wrote = false
    let steps = 0
    let firstWriteStep = -1
    let infoLine = ''
    for (let round = 0; round < MAX_STEPS; round++) {
      const turn = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      steps = round + 1
      const reasoning = String(turn.message.reasoning_content ?? turn.message.reasoning ?? '')
      const m = reasoning.match(/INFO:\s*([^\n]{0,60})/i)
      if (m) infoLine = m[1]
      if (turn.toolNames.includes('write')) {
        wrote = true
        if (firstWriteStep === -1) firstWriteStep = steps
        break
      }
      const calls = turn.message.tool_calls ?? []
      messages = [...messages, turn.message, ...calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: RESULT_BY_TOOL[c.function?.name] ?? 'ok' }))]
      messages.push({ role: 'user', content: guide(round + 2) })
      await new Promise((r) => setTimeout(r, 300))
    }
    runs.push({ wrote, steps, firstWriteStep, infoLine })
  }
  const out = { variant: label, completed: `${runs.filter((r) => r.wrote).length}/${nRuns}` }
  runs.forEach((r, i) => { out[`run${i}`] = { wrote: r.wrote, steps: r.steps, firstWriteStep: r.firstWriteStep, infoLine: r.infoLine } })
  console.log(JSON.stringify(out))
}

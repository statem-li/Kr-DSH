/**
 * P26 — Pro single-task long chain with the OPTIMAL config (w6c + deep-guide,
 * no anchors) plus Pro-specific convergence variants. Flash P23 f-budget-anti
 * = 100% is the reference.
 *
 * Variants (Pro):
 *   a-w6c-guide     w6c persona + deep-guide (the P24 Part-2 winner)
 *   b-w6c-budget    a + "You have at most 6 tool calls; then produce"
 *   c-w6c-brief     a + "Plan briefly, then produce" (anti over-planning)
 *
 * Usage: node run-prosingle.mjs --run [--n 3] [--model deepseek-v4-pro]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'

const W6C = 'You are a helpful software engineer assistant.\n'
  + 'Before acting, decide the task type (build or fix) and adopt the matching '
  + 'style: build → hands-on production; fix → inspect-and-plan.'

const SURVEY = 'Survey this repository: learn the directory structure, read the README, identify the main source files, and understand what the project does. Then write a summary.md with your findings. Work step by step.'

const GUIDE = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply first, then commit and act.'
const BUDGET = '\nYou have at most 6 tool calls for this task; after that, write summary.md.'
const BRIEF = '\nPlan briefly, then produce — do not over-plan.'

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
  'a-w6c-guide': (round) => GUIDE,
  'b-w6c-budget': (round) => GUIDE + BUDGET,
  'c-w6c-brief': (round) => GUIDE + BRIEF,
}

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, variants: Object.keys(variants), note: '--run to send' }, null, 2))
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
    let weSum = 0
    for (let round = 0; round < 8; round++) {
      const turn = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      steps = round + 1
      weSum += turn.metrics.we
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
    runs.push({ wrote, steps, firstWriteStep, avgWe: (weSum / steps).toFixed(1) })
  }
  const out = { variant: label, completed: `${runs.filter((r) => r.wrote).length}/${nRuns}` }
  runs.forEach((r, i) => { out[`run${i}`] = { wrote: r.wrote, steps: r.steps, firstWriteStep: r.firstWriteStep, avgWe: r.avgWe } })
  console.log(JSON.stringify(out))
}

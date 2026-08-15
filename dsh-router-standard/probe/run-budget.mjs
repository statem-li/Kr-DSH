/**
 * P23 — push single-task completion to 100%: budget anchor + anti-runaway.
 * Failure analysis of P22 b-recall (1/3 failed): models run environment
 * checks (echo/whoami/node --version) and exhaustive greps mid-task, burning
 * the step budget before producing.
 *
 * Variants (near-field, per step):
 *   d-budget      b + "You have at most 6 tool calls; then write summary.md."
 *   e-anti        b + "Do not run environment checks (echo/whoami/uname/node
 *                 --version) or exhaustive grep/glob scans."
 *   f-budget-anti both
 *
 * Usage: node run-budget.mjs --run [--n 3] [--model deepseek-v4-flash]
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

const BASE = '\n\nRouter: before acting, briefly review what you have already done in this session. Continue from where you left off; do not repeat completed steps. When you have gathered enough information, stop exploring and produce the deliverable.'
const BUDGET = '\nYou have at most 6 tool calls for this task; after that, write summary.md.'
const ANTI = '\nDo not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans. Gather the key files and produce.'

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1024')
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
  'd-budget': () => BASE + BUDGET,
  'e-anti': () => BASE + ANTI,
  'f-budget-anti': () => BASE + BUDGET + ANTI,
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
    let messages = [{ role: 'system', content: W7 }, { role: 'user', content: TASK }]
    let wroteSummary = false
    let steps = 0
    let firstWriteStep = -1
    for (let round = 0; round < 8; round++) {
      messages.push({ role: 'user', content: guide() })
      const turn = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      steps = round + 1
      if (turn.toolNames.includes('write') && firstWriteStep === -1) firstWriteStep = steps
      if (turn.toolNames.includes('write')) { wroteSummary = true; break }
      const calls = turn.message.tool_calls ?? []
      messages = [...messages, turn.message, ...calls.map((c) => ({
        role: 'tool',
        tool_call_id: c.id,
        content: RESULT_BY_TOOL[c.function?.name] ?? 'ok',
      }))]
      await new Promise((r) => setTimeout(r, 250))
    }
    runs.push({ wroteSummary, steps, firstWriteStep })
  }
  const completed = runs.filter((r) => r.wroteSummary).length
  const avgSteps = (runs.reduce((a, r) => a + r.steps, 0) / runs.length).toFixed(1)
  const out = { variant: label, n: nRuns, completed: `${completed}/${nRuns}` }
  runs.forEach((r, i) => { out[`run${i}`] = { wroteSummary: r.wroteSummary, steps: r.steps, firstWriteStep: r.firstWriteStep } })
  out.total = { avgSteps }
  console.log(JSON.stringify(out))
}

/**
 * Smoke test — minimal (spec) preset on Pro: trajectory + convergence.
 * Two task shapes: single-task survey (vs P22/23 flash data) and a small
 * code task. n runs, logs classification/first-token/tools/steps.
 *
 * Usage: node run-smoke.mjs --run [--n 2] [--model deepseek-v4-pro]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '2')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'

const SPEC = personaFor(0, model) // minimal sentence

const SURVEY = 'Survey this repository: learn the directory structure, read the README, identify the main source files, and understand what the project does. Then write a summary.md with your findings. Work step by step.'
const CODE = 'Write a JavaScript module cart.js with addItem(name, price, qty) (same name merges qty), removeItem(name), and total(). Deliver working code now.'

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

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, note: '--run to send' }, null, 2))
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
  for (let i = 0; i < nRuns; i++) {
    let messages = [{ role: 'system', content: SPEC }, { role: 'user', content: task }]
    const steps = []
    let done = false
    for (let round = 0; round < 8; round++) {
      const turn = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      const reasoning = String(turn.message.reasoning_content ?? turn.message.reasoning ?? '')
      steps.push({
        cls: turn.classification,
        firstToken: turn.metrics.firstToken,
        we: turn.metrics.we,
        letMe: turn.metrics.letMe,
        tools: turn.toolNames,
        finish: turn.finishReason,
        reasoningHead: reasoning.slice(0, 120).replace(/\s+/g, ' '),
      })
      if (taskLabel === 'code' && turn.toolNames.includes('write')) { done = true; break }
      if (taskLabel === 'survey' && turn.toolNames.includes('write')) { done = true; break }
      const calls = turn.message.tool_calls ?? []
      messages = [...messages, turn.message, ...calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: RESULT_BY_TOOL[c.function?.name] ?? 'ok' }))]
      await new Promise((r) => setTimeout(r, 300))
    }
    console.log(JSON.stringify({ task: taskLabel, run: i, done, steps }))
  }
}

/**
 * P29 — depth-vs-convergence balance for flash: does the convergence anchor
 * over-trigger shallow production? Variants weaken the converge anchor and/or
 * strengthen the depth anchor. Metrics: completion, INFO COVERAGE (which
 * files were read), reasoning chars (depth), steps.
 *
 * Variants:
 *   a-v18        current anchors (recall+converge+anti-runaway) + deep-guide
 *   b-no-converge  recall + anti-runaway, NO "stop exploring and produce"
 *   c-deep-first   v18 but converged anchor reworded:
 *                  "Explore thoroughly first; when information is complete,
 *                  produce." (depth before convergence)
 *   d-deep-strong  v18 + "Think deeply and thoroughly; do not rush to produce."
 *
 * Usage: node run-depth.mjs --run [--n 3] [--model deepseek-v4-flash]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-flash'
const MAX_STEPS = 16

const W7_ANCHORS = 'You are a helpful assistant.\n'
  + 'Before acting, decide the task type (build or fix) and adopt the matching '
  + 'style: build → hands-on production; fix → inspect-and-plan.\n'
  + 'Before acting, briefly review what you have already done in this session and continue from where you left off; do not repeat completed steps. When you have gathered enough information, stop exploring and produce the deliverable. Do not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans.'

const W7_NO_CONVERGE = 'You are a helpful assistant.\n'
  + 'Before acting, decide the task type (build or fix) and adopt the matching '
  + 'style: build → hands-on production; fix → inspect-and-plan.\n'
  + 'Before acting, briefly review what you have already done in this session and continue from where you left off; do not repeat completed steps. Do not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans.'

const SURVEY = 'Survey this repository: learn the directory structure, read the README, identify the main source files, and understand what the project does. Then write a summary.md with your findings. Work step by step.'

const GUIDE = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply first, then commit and act.'
const GUIDE_DEEP = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply and thoroughly; do not rush to produce. When your analysis is complete, commit and act.'
const GUIDE_DEPTH_FIRST = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Explore thoroughly first; when information is complete, produce.'

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
  'a-v18': { system: W7_ANCHORS, guide: () => GUIDE },
  'b-no-converge': { system: W7_NO_CONVERGE, guide: () => GUIDE },
  'c-deep-first': { system: W7_ANCHORS, guide: () => GUIDE_DEPTH_FIRST },
  'd-deep-strong': { system: W7_ANCHORS, guide: () => GUIDE_DEEP },
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

for (const [label, cfg] of Object.entries(variants)) {
  const runs = []
  for (let runIdx = 0; runIdx < nRuns; runIdx++) {
    let messages = [{ role: 'system', content: cfg.system }, { role: 'user', content: SURVEY + cfg.guide() }]
    let wrote = false
    let steps = 0
    let reasoningChars = 0
    const readTargets = new Set()
    for (let round = 0; round < MAX_STEPS; round++) {
      const turn = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      steps = round + 1
      reasoningChars += String(turn.message.reasoning_content ?? turn.message.reasoning ?? '').length
      for (const call of turn.message.tool_calls ?? []) {
        if (call.function?.name === 'read') {
          let args = {}
          try { args = JSON.parse(call.function.arguments || '{}') } catch { /* ignore */ }
          const path = String(args.path ?? args.file_path ?? '')
          readTargets.add(path.split(/[\\/]/).pop().toLowerCase())
        }
      }
      if (turn.toolNames.includes('write')) { wrote = true; break }
      const calls = turn.message.tool_calls ?? []
      messages = [...messages, turn.message, ...calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: RESULT_BY_TOOL[c.function?.name] ?? 'ok' }))]
      messages.push({ role: 'user', content: cfg.guide() })
      await new Promise((r) => setTimeout(r, 300))
    }
    runs.push({
      wrote, steps,
      reasoningChars,
      readCoverage: [...readTargets].join(','),
    })
  }
  const out = { variant: label, completed: `${runs.filter((r) => r.wrote).length}/${nRuns}` }
  runs.forEach((r, i) => {
    out[`run${i}`] = { wrote: r.wrote, steps: r.steps, reasoningChars: r.reasoningChars, readCoverage: r.readCoverage }
  })
  const avgSteps = (runs.reduce((a, r) => a + r.steps, 0) / runs.length).toFixed(1)
  const avgDepth = Math.round(runs.reduce((a, r) => a + r.reasoningChars, 0) / runs.length)
  out.total = { avgSteps, avgReasoningChars: avgDepth }
  console.log(JSON.stringify(out))
}

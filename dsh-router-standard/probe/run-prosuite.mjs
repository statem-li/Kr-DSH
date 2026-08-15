/**
 * P24 — Pro weak-domain fine scan + flash-suite convergence test.
 *
 * Part 1: fine scan around w6 (spec+fewshot, P11 optimum +5.00) WITHOUT any
 * depth-budget instruction — natural-state internal routing.
 * Part 2: Pro w6 + the full flash suite (near-field deep-guide guidance +
 * recall/converge/anti-runaway persona anchors), 8-round alternation,
 * behavior-truth + convergence + cache.
 * Part 3: single-task long chain (survey -> summary.md) with the full suite.
 *
 * Usage: node run-prosuite.mjs --run [--n 3] [--model deepseek-v4-pro]
 */
import { loadDshCredentials } from './creds.mjs'
import { sendTurn, appendSyntheticToolResults } from './probe.mjs'
import { buildTools } from './scaffolds.mjs'
import { personaFor } from '../router-standard/preset/router-core.mjs'

const run = process.argv.includes('--run')
const nRuns = Number(process.argv[process.argv.indexOf('--n') + 1] || '3')
const model = process.argv[process.argv.indexOf('--model') + 1] || 'deepseek-v4-pro'

const TASK_GREEN = 'Write a JavaScript module solve.js exporting gcd(a,b) and csvSum(path). Deliver working code now — this is a build task, produce it directly.'
const TASK_MAINT = 'Fix the broken login handler in this repository: the endpoint returns 500 on valid credentials. Inspect the auth code first, find the regression, and repair it carefully.'

const SPEC = 'You are a helpful software engineer assistant.'
const V2 = 'You are a software engineer. Match your working style to the task type.\nExample 1: "fix the broken login flow" → inspect first, plan, then edit carefully.\nExample 2: "write a new CSV processing script" → write the code directly and verify it runs.\nFollow the same rule for the actual request.'

const SCAN = {
  'w6-spec+fewshot': SPEC + '\n' + V2.split('\n').slice(1).join('\n'),
  'w6a-spec+2ex': SPEC + '\nMatch your working style to the task type.\nExample 1: "fix the broken login flow" → inspect first, plan, then edit carefully.\nExample 2: "write a new CSV processing script" → write the code directly and verify it runs.\nFollow the same rule for the actual request.',
  'w6b-spec+1ex-build': SPEC + '\nMatch your working style to the task type.\nExample: "write a new CSV processing script" → write the code directly and verify it runs.\nFollow the same rule for the actual request.',
  'w6c-spec+classify': SPEC + '\nBefore acting, decide the task type (build or fix) and adopt the matching style: build → hands-on production; fix → inspect-and-plan.',
  'w5-spec+route': SPEC + '\nAdapt your working style to the task type: build → direct production; fix → inspect and plan first.',
  'neutral': 'You are a helpful assistant.',
}

// full flash suite applied to a persona: recall + converge + anti-runaway anchors
const ANCHORS = '\nBefore acting, briefly review what you have already done in this session and continue from where you left off; do not repeat completed steps. When you have gathered enough information, stop exploring and produce the deliverable. Do not run environment checks (echo, whoami, uname, node --version, date) or exhaustive grep/glob scans.'
const GUIDE = '\n\nRouter: classify this task (build or fix) now, then adopt the matching style — build: direct production; fix: inspect-first. Think deeply first, then commit and act.'

const EXPLORE = new Set(['bash', 'read', 'grep', 'glob'])
const PRODUCE = new Set(['write', 'edit'])

const creds = loadDshCredentials()
creds.model = model
const maxTokens = Number(process.env.PROBE_MAX_TOKENS || '1536')
const tools = buildTools(['bash', 'read', 'write', 'edit', 'grep', 'glob'])

if (!run) {
  console.log(JSON.stringify({ dryRun: true, model, n: nRuns, parts: ['1-scan', '2-multiround', '3-single-task'], note: '--run to send' }, null, 2))
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

function planScore(r) {
  return r.metrics.we - r.metrics.letMe
}

function routeCorrect(turn, type) {
  const names = turn.toolNames ?? []
  if (names.length === 0) return false
  const firstProduce = names.findIndex((n) => PRODUCE.has(n))
  const hasExplore = names.some((n) => EXPLORE.has(n))
  if (type === 'maint') return hasExplore && (firstProduce === -1 || firstProduce > 0)
  return firstProduce !== -1
}

console.log('=== PART 1: weak-domain fine scan (no depth budget) ===')
for (const [label, system] of Object.entries(SCAN)) {
  const scores = { maint: [], green: [] }
  for (const [taskLabel, task] of [['maint', TASK_MAINT], ['green', TASK_GREEN]]) {
    for (let i = 0; i < nRuns; i++) {
      const r = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: task }], model: creds.model, tools })
      scores[taskLabel].push(planScore(r))
      await new Promise((r2) => setTimeout(r2, 300))
    }
  }
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  const m = mean(scores.maint)
  const g = mean(scores.green)
  console.log(JSON.stringify({ persona: label, planMaint: m.toFixed(2), planGreen: g.toFixed(2), discrimination: (m - g).toFixed(2) }))
}

console.log('=== PART 2: multi-round with full flash suite ===')
const SUITE = SCAN['w6a-spec+2ex'] + ANCHORS
const suiteVariants = {
  'pro-w6-naked': { system: SCAN['w6a-spec+2ex'], guide: () => '' },
  'pro-w6+guide': { system: SCAN['w6a-spec+2ex'], guide: () => GUIDE },
  'pro-suite-full': { system: SUITE, guide: () => GUIDE },
}
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
const sequence = [
  ['maint', MAINT[0]], ['green', GREEN[0]], ['maint', MAINT[1]], ['green', GREEN[1]],
  ['maint', MAINT[2]], ['green', GREEN[2]], ['maint', MAINT[3]], ['green', GREEN[3]],
]
for (const [label, cfg] of Object.entries(suiteVariants)) {
  const perRound = []
  for (let runIdx = 0; runIdx < nRuns; runIdx++) {
    let messages = [{ role: 'system', content: cfg.system }]
    for (const [i, [type, text]] of sequence.entries()) {
      messages.push({ role: 'user', content: text + cfg.guide() })
      const turn = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      if (!perRound[i]) perRound[i] = { correct: 0, total: 0, converged: 0 }
      const slot = perRound[i]
      if (routeCorrect(turn, type)) slot.correct++
      if (turn.finishReason === 'tool_calls') slot.converged++
      slot.total++
      messages = appendSyntheticToolResults(messages, turn.message)
      await new Promise((r) => setTimeout(r, 300))
    }
  }
  const out = { variant: label }
  perRound.forEach((slot, idx) => {
    out[`r${idx + 1}`] = { route: `${slot.correct}/${slot.total}`, conv: `${slot.converged}/${slot.total}` }
  })
  const n = perRound.reduce((a, s) => a + s.total, 0)
  out.total = {
    route: `${perRound.reduce((a, s) => a + s.correct, 0)}/${n}`,
    converge: `${perRound.reduce((a, s) => a + s.converged, 0)}/${n}`,
  }
  console.log(JSON.stringify(out))
}

console.log('=== PART 3: single-task long chain (survey) ===')
const SURVEY = 'Survey this repository: learn the directory structure, read the README, identify the main source files, and understand what the project does. Then write a summary.md with your findings. Work step by step.'
const RESULT_BY_TOOL = {
  bash: 'src/\n  main.js (12KB)\n  util.js (4KB)\n  data/\n    config.json\ntests/\n  main.test.js\nREADME.md\npackage.json',
  pwsh: 'src/\n  main.js (12KB)\n  util.js (4KB)\n  data/\n    config.json\ntests/\n  main.test.js\nREADME.md\npackage.json',
  read: '<file src/main.js>\nimport { loadConfig } from "./util.js"\nconst PORT = 8080\n// entry point: starts an HTTP server, loads config from data/config.json\n// 120 lines total\n</file>',
  glob: 'src/main.js\nsrc/util.js\nsrc/data/config.json\ntests/main.test.js\nREADME.md\npackage.json',
  grep: 'main.js:3: const PORT = 8080\nmain.js:10: server.listen(PORT)\nutil.js:1: export function loadConfig',
  edit: 'edited ok',
  write: 'summary.md written ok',
}
const singleVariants = {
  'single-naked': { system: SCAN['w6a-spec+2ex'], guide: () => '' },
  'single-suite': { system: SUITE, guide: () => GUIDE },
}
for (const [label, cfg] of Object.entries(singleVariants)) {
  const runs = []
  for (let runIdx = 0; runIdx < nRuns; runIdx++) {
    let messages = [{ role: 'system', content: cfg.system }, { role: 'user', content: SURVEY }]
    let wrote = false
    let steps = 0
    for (let round = 0; round < 8; round++) {
      messages.push({ role: 'user', content: cfg.guide() })
      const turn = await sendTurnRetry({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, maxTokens, messages, model: creds.model, tools })
      steps = round + 1
      if (turn.toolNames.includes('write')) { wrote = true; break }
      const calls = turn.message.tool_calls ?? []
      messages = [...messages, turn.message, ...calls.map((c) => ({ role: 'tool', tool_call_id: c.id, content: RESULT_BY_TOOL[c.function?.name] ?? 'ok' }))]
      await new Promise((r) => setTimeout(r, 300))
    }
    runs.push({ wrote, steps })
  }
  const out = { variant: label, completed: `${runs.filter((r) => r.wrote).length}/${nRuns}` }
  runs.forEach((r, i) => { out[`run${i}`] = { wrote: r.wrote, steps: r.steps } })
  console.log(JSON.stringify(out))
}

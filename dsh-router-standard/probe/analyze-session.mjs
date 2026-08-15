/**
 * DSH session JSONL analyzer: trajectory fingerprint for a whole session.
 * Reads exported session.jsonl, reconstructs reasoning per assistant message
 * from reasoning-chunks, computes the same lexicon fingerprint as dsh-probe,
 * plus tool-call series and timeline. Output sanitized (no reasoning text).
 *
 * Usage: node analyze-session.mjs <session.jsonl>
 */
import { readFileSync } from 'node:fs'
import { classifyReasoning } from './classifier.mjs'

const path = process.argv[2]
if (!path) { console.error('usage: node analyze-session.mjs <session.jsonl>'); process.exit(1) }

const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)
const events = lines.map((l) => JSON.parse(l))

const bySeq = {}
for (const e of events) {
  const seq = e.seq ?? e.sequence
  if (seq !== undefined) bySeq[seq] = e
}

// session basics
const header = events.find((e) => e.type === 'request/header')
const selected = events.find((e) => e.type === 'agent-preset/selected')
const title = events.find((e) => e.type === 'session/title')
const plan = events.filter((e) => e.type === 'plan/mode')

// reconstruct assistant reasoning blocks: reasoning-chunks carry token
// arrays keyed by turn/step; join all chunks of one turn:step into one block
const reasoningByMessage = new Map()
const messageOrder = []
for (const e of events) {
  if (e.type === 'reasoning-chunks') {
    const d = e.data ?? {}
    const key = `t${d.turn ?? '?'}:s${d.step ?? '?'}`
    if (!reasoningByMessage.has(key)) { reasoningByMessage.set(key, []); messageOrder.push(key) }
    reasoningByMessage.get(key).push(...(Array.isArray(d.texts) ? d.texts : []))
  }
}

// tool calls
const toolCalls = events.filter((e) => e.type === 'tool/call')
const dispatch = events.filter((e) => e.type === 'tool/code-dispatch' || e.type === 'tool/code-dispatch-start')
const toolNameCounts = {}
for (const e of toolCalls) {
  const name = e.data?.name ?? e.data?.tool ?? '?'
  toolNameCounts[name] = (toolNameCounts[name] || 0) + 1
}
const dispatchNames = {}
for (const e of dispatch) {
  const name = e.data?.tool ?? e.data?.name ?? 'run_code'
  dispatchNames[name] = (dispatchNames[name] || 0) + 1
}

// reasoning fingerprint per message
const fingerprints = []
for (const msgId of messageOrder) {
  const full = reasoningByMessage.get(msgId).join('')
  const cls = classifyReasoning(full, false)
  fingerprints.push({ msgId, chars: full.length, ...cls })
}

const n = fingerprints.length || 1
const labelCounts = {}
const firstTokens = {}
let we = 0, letMe = 0, lets = 0, i = 0, marker = 0
let charsTotal = 0
for (const f of fingerprints) {
  labelCounts[f.label] = (labelCounts[f.label] || 0) + 1
  firstTokens[f.metrics.firstToken] = (firstTokens[f.metrics.firstToken] || 0) + 1
  we += f.metrics.we; letMe += f.metrics.letMe; lets += f.metrics.lets; i += f.metrics.i
  if (f.metrics.markerFirstLine) marker += 1
  charsTotal += f.chars
}
const charsSorted = fingerprints.map((f) => f.chars).sort((a, b) => a - b)
const p50 = charsSorted[Math.floor(charsSorted.length / 2)] ?? 0
const p90 = charsSorted[Math.floor(charsSorted.length * 0.9)] ?? 0

// timeline
const firstTs = events[0]?.ts ?? events[0]?.timestamp ?? null
const lastTs = events[events.length - 1]?.ts ?? events[events.length - 1]?.timestamp ?? null
let durationMin = null
if (firstTs && lastTs) {
  const f = new Date(firstTs).getTime(); const l = new Date(lastTs).getTime()
  if (!Number.isNaN(f) && !Number.isNaN(l)) durationMin = ((l - f) / 60000).toFixed(1)
}

const out = {
  session: path.split(/[\\/]/).pop(),
  title: title?.data?.text ?? title?.data?.title ?? null,
  preset: selected?.data?.preset ?? selected?.preset ?? null,
  headerToolCount: header?.data?.tools?.length ?? header?.tools?.length ?? null,
  headerTools: (header?.data?.tools ?? header?.tools ?? []).map((t) => (typeof t === 'string' ? t : (t.name ?? t.function?.name))),
  planModeEvents: plan.length,
  turns: events.filter((e) => e.type === 'turn/start').length,
  durationMin,
  reasoning: {
    messages: fingerprints.length,
    charsTotal,
    p50, p90,
    labels: labelCounts,
    firstTokens: Object.entries(firstTokens).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}x${v}`).join(' '),
    avg: { we: (we / n).toFixed(1), letMe: (letMe / n).toFixed(1), lets: (lets / n).toFixed(1), i: (i / n).toFixed(1), marker },
  },
  tools: {
    calls: toolCalls.length,
    breakdown: toolNameCounts,
    codeDispatch: dispatchNames,
  },
}

console.log(JSON.stringify(out, null, 2))

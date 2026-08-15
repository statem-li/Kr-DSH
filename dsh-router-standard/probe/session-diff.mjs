/**
 * Deep session diff: what each session produced and how it worked.
 * Node-based (robust against huge tool results). Sanitized output.
 * Usage: node session-diff.mjs <jsonl>
 */
import { readFileSync } from 'node:fs'

const path = process.argv[2]
const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean)
const events = []
for (const l of lines) { try { events.push(JSON.parse(l)) } catch { /* skip malformed */ } }

const out = { session: path.split(/[\\/]/).pop() }

// error results
const results = events.filter((e) => e.type === 'tool/result')
let err = 0
const errTexts = []
for (const e of results) {
  const d = e.data ?? {}
  const msg = d.message ?? {}
  const content = Array.isArray(msg.content) ? msg.content : []
  const text = content.map((c) => (typeof c === 'string' ? c : (c.text ?? ''))).join('\n')
  if (d.isError || /error|fail|denied|not found|ENOENT|refused/i.test(text.slice(0, 300))) {
    err++
    if (errTexts.length < 12) errTexts.push(text.slice(0, 160).replace(/\s+/g, ' '))
  }
}
out.resultErrors = { total: results.length, err, samples: errTexts }

// write/edit targets
const writes = new Map()
for (const e of events) {
  if (e.type !== 'tool/call') continue
  const d = e.data ?? {}
  const name = d.name ?? d.tool ?? '?'
  const args = typeof d.arguments === 'string' ? safeParse(d.arguments) : (d.arguments ?? {})
  const target = args.file_path ?? args.path ?? args.file ?? null
  if (target) {
    const key = `${name} -> ${target}`
    writes.set(key, (writes.get(key) || 0) + 1)
  }
}
out.writes = [...writes.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}x ${k}`)

// final assistant visible messages (last 2)
const finals = events.filter((e) => e.type === 'assistant/message').slice(-2)
out.finalMessages = finals.map((e) => {
  const d = e.data ?? {}
  const content = Array.isArray(d.content) ? d.content : []
  return content.map((c) => (typeof c === 'string' ? c : (c.text ?? ''))).join(' ').slice(0, 400)
})

// turn boundaries with timestamps
const turns = events.filter((e) => e.type === 'turn/start')
out.turns = turns.length
const steps = events.filter((e) => e.type === 'step/start')
out.steps = steps.length

// code-dispatch inner call summary (PTC)
const dispatch = events.filter((e) => e.type === 'tool/code-dispatch')
const inner = {}
for (const e of dispatch) {
  const name = e.data?.tool ?? e.data?.name ?? '?'
  inner[name] = (inner[name] || 0) + 1
}
out.codeDispatchInner = inner

function safeParse(s) {
  try { return JSON.parse(s) } catch { return {} }
}

console.log(JSON.stringify(out, null, 2))

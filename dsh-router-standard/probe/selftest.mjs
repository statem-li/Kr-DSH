/** Sanity tests for classifier + creds masking, no network. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyReasoning } from './classifier.mjs'
import { buildTools, FULL_CATALOG, MINIMAL_SYSTEM } from './scaffolds.mjs'

test('minimal-style reasoning classifies minimal-like', () => {
  const r = classifyReasoning('We need to inspect the repository first.\nwe should read the README.')
  assert.equal(r.label, 'minimal-like')
  assert.equal(r.metrics.letMe, 0)
})

test('standard-style reasoning classifies standard-like', () => {
  const r = classifyReasoning('Let me check the repository structure first.\nI will read the README now.')
  assert.equal(r.label, 'standard-like')
  assert.equal(r.metrics.we, 0)
})

test('first token histogram key exists', () => {
  const r = classifyReasoning('Now let us look at the files.\nwe proceed step by step.')
  assert.ok(['Now', 'now'].includes(r.metrics.firstToken))
})

test('full catalog has 21 tools with short descriptions', () => {
  const tools = FULL_CATALOG()
  assert.equal(tools.length, 21)
  for (const t of tools) {
    assert.ok(t.function.description.length < 90, `${t.function.name} description too long`)
  }
})

test('buildTools resolves names', () => {
  const names = buildTools(['bash', 'read', 'edit']).map((t) => t.function.name)
  assert.deepEqual(names, ['bash', 'read', 'edit'])
})

test('minimal system is the exact official sentence', () => {
  assert.equal(MINIMAL_SYSTEM, 'You are a helpful software engineer assistant.')
})

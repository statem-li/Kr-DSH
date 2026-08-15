/**
 * One-turn (and two-phase promote) Chat Completions probe.
 * Mirrors xiaobright/modeltest trigger_probe probe.mjs request shape:
 * thinking enabled + reasoning_effort max, reasoning read from reasoning_content.
 */

import { classifyReasoning } from './classifier.mjs'

export async function sendTurn({ apiKey, baseUrl, maxTokens, messages, model, timeoutMs = 180000, tools }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      thinking: { type: 'enabled' },
      reasoning_effort: 'max',
      tools,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
  }

  const payload = await response.json()
  const message = payload.choices?.[0]?.message ?? {}
  const reasoning = message.reasoning_content ?? message.reasoning ?? ''
  const toolCalls = message.tool_calls ?? []
  const cls = classifyReasoning(reasoning, Boolean(message.content))
  return {
    message,
    classification: cls.label,
    score: cls.score,
    metrics: cls.metrics,
    finishReason: payload.choices?.[0]?.finish_reason ?? null,
    toolNames: toolCalls.map((call) => call.function?.name).filter(Boolean),
    inputTokens: payload.usage?.prompt_tokens ?? null,
    outputTokens: payload.usage?.completion_tokens ?? null,
  }
}

export function appendSyntheticToolResults(messages, assistantMessage) {
  const calls = assistantMessage.tool_calls ?? []
  return [
    ...messages,
    assistantMessage,
    ...calls.map((call) => ({
      role: 'tool',
      tool_call_id: call.id,
      content: 'Probe fixture: repository structure inspected; README.md is available.',
    })),
  ]
}

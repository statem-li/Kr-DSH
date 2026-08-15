/**
 * Zero-dependency credential loader.
 *
 * Reads the DeepSeek API key from the DSH harness's own credential store
 * (`$DSH_HOME/.credentials.yaml`) and the default model route from
 * `$DSH_HOME/settings.yaml`. Nothing is printed, logged, or persisted.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')

/** Minimal YAML parser for the flat/two-level shapes DSH writes. */
function parseFlatYaml(text) {
  const out = {}
  const lines = text.split(/\r?\n/)
  let section = null
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trimEnd()
    if (line.trim() === '') continue
    const indent = line.match(/^\s*/)[0].length
    const m = line.trim().match(/^([^:]+):\s*(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    const value = m[2].trim()
    if (indent === 0 && value === '') {
      section = key
      out[section] = out[section] || {}
      continue
    }
    if (indent > 0 && section && value !== '') {
      out[section][key] = value
    } else if (value !== '') {
      out[key] = value
    }
  }
  return out
}

export function loadDshCredentials() {
  const credPath = join(DSH_HOME, '.credentials.yaml')
  let creds
  try {
    creds = parseFlatYaml(readFileSync(credPath, 'utf8'))
  } catch {
    throw new Error(`cannot read DSH credentials at ${credPath}`)
  }
  const apiKey = creds.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY missing from DSH credentials store')
  }

  let defaultModel = process.env.PROBE_MODEL || ''
  try {
    const settings = parseFlatYaml(readFileSync(join(DSH_HOME, 'settings.yaml'), 'utf8'))
    const agent = settings['agent-default-model'] || {}
    if (!defaultModel && agent.model) defaultModel = agent.model
    const ds = settings['llm-deepseek'] || {}
    if (!defaultModel && Array.isArray(ds.models) && ds.models.length) {
      defaultModel = ds.models[0].id
    }
  } catch { /* settings optional */ }

  return {
    apiKey,
    baseUrl: process.env.PROBE_BASE_URL || 'https://api.deepseek.com',
    model: defaultModel || 'deepseek-v4-pro',
  }
}

/**
 * System-prompt variants and tool-catalog fixtures.
 * Minimal/paraphrased prompts mirror xiaobright/modeltest trigger_probe
 * scaffolds.mjs; the full catalog is a short-description approximation of
 * the Standard preset's model-visible surface (schema-lean per the
 * anchored-standard guidance).
 */

export const MINIMAL_SYSTEM = 'You are a helpful software engineer assistant.'

export const PARAPHRASED_SYSTEM =
  'You are an assistant that helps with software engineering tasks.'

export const STANDARD_SYSTEM = `You are a coding agent powered by a large language model.
You work in a repository and must complete engineering maintenance tasks.
You have access to a broad tool set: shell, file read/write/edit, search,
background jobs, goals, planning mode, delegation, web search and user questions.
Use the right tool for each step and verify your work with real evidence.`

export const USER_PROMPT = `Inspect the current repository before answering.
First determine its top-level structure, then locate and read the project README.
Do not guess from prior knowledge. Use the available tools first.`

function fn(name, description, properties, required = []) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } }
}

export { fn }

export const TOOL_BASH = () => fn('bash', 'Run a command in a persistent shell.', { command: { type: 'string' } }, ['command'])
export const TOOL_READ = () => fn('read', 'Read a text file.', { path: { type: 'string' } }, ['path'])
export const TOOL_EDIT = () => fn('edit', 'Edit a text file by replacing a literal string.', { file_path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, ['file_path', 'old_string', 'new_string'])
export const TOOL_WRITE = () => fn('write', 'Write or fully replace a UTF-8 text file.', { file_path: { type: 'string' }, content: { type: 'string' } }, ['file_path', 'content'])
export const TOOL_GLOB = () => fn('glob', 'Find files by path pattern.', { pattern: { type: 'string' } }, ['pattern'])
export const TOOL_GREP = () => fn('grep', 'Search file contents with a regular expression.', { pattern: { type: 'string' } }, ['pattern'])
export const TOOL_TODO = () => fn('todo_write', 'Record a structured task list.', { todos: { type: 'array' } }, ['todos'])

export const FULL_CATALOG = () => [
  TOOL_BASH(), TOOL_READ(), TOOL_WRITE(), TOOL_EDIT(), TOOL_GLOB(), TOOL_GREP(),
  fn('todo_write', 'Record a structured task list.', { todos: { type: 'array' } }, ['todos']),
  fn('web_search', 'Search the web for current information.', { query: { type: 'string' } }, ['query']),
  fn('ask_user_question', 'Ask the user a concise question.', { questions: { type: 'array' } }, ['questions']),
  fn('subagent', 'Delegate a self-contained task to a subagent.', { prompt: { type: 'string' } }, ['prompt']),
  fn('subagent_fork', 'Delegate a task to a subagent that inherits this conversation.', { prompt: { type: 'string' } }, ['prompt']),
  fn('job_list', 'List background jobs.', {}, []),
  fn('job_output', 'Read a background job output.', { job_id: { type: 'string' } }, ['job_id']),
  fn('job_kill', 'Request cancellation of a background job.', { job_id: { type: 'string' } }, ['job_id']),
  fn('skill', 'Load the full instructions for an available skill.', { name: { type: 'string' } }, ['name']),
  fn('create_goal', 'Create a persisted same-session completion goal.', { objective: { type: 'string' } }, ['objective']),
  fn('update_goal', 'Update the current goal.', { action: { type: 'string' } }, ['action']),
  fn('get_goal', 'Read the current goal.', {}, []),
  fn('exit_plan_mode', 'Present the plan and leave plan mode.', { plan: { type: 'string' } }, ['plan']),
  fn('workflow', 'Run a JavaScript workflow script that orchestrates subagents.', { script: { type: 'string' } }, ['script']),
  fn('ralph', 'Run a foreground fresh-agent Ralph loop.', { objective: { type: 'string' } }, ['objective']),
]

export function buildTools(names) {
  const all = { bash: TOOL_BASH(), read: TOOL_READ(), edit: TOOL_EDIT(), write: TOOL_WRITE(), glob: TOOL_GLOB(), grep: TOOL_GREP(), todo_write: TOOL_TODO() }
  return names.map((name) => all[name])
}

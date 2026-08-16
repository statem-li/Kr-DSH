/** Host half of the browser-only Markdown renderer plugin. */

/** Stable Cordis plugin name. */
export const name = 'dsh-better-markdown'

/**
 * Keep the host row active so the client-module registry discovers this package's `dsh.client` entry.
 */
export function apply(): void {}

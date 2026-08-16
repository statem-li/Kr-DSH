/** Host half of the browser-only tool-summary plugin. */

/** Stable Cordis plugin name. */
export const name = 'dsh-tool-summary'

/**
 * Keep the host row active so the client-module registry discovers this
 * package's `dsh.client` entry.
 */
export function apply(): void {}

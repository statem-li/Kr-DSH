/** Browser half: shadow the built-in tool-call renderer at a lower slot priority. */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: activates the SlotMap / Context augmentations of the slots and
// conversation packages so `ctx.slots.register` accepts 'conversation.chat.node'.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { ToolGroupNodeView } from './ToolGroupNodeView.tsx'
import { injectStyles } from './styles.ts'
import { mountActivityDrawer } from './activity-drawer.tsx'

/** Services required in the browser Cordis tree. */
export const inject = ['slots']

/**
 * Replace the `tool-call` slot cell with the turn-grouping chip while
 * preserving the built-in renderer as the fallback.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: Context): void {
  injectStyles()
  mountActivityDrawer()
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'tool-call',
    priority: -100,
    locale: 'conversation',
    // No children declaration: `tool.call.toolview` is declared exclusively by
    // ui-tool; this shadow only dispatches it at render time.
  }, ToolGroupNodeView))
}

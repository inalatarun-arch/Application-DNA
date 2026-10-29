/**
 * Feature switches. A switched-off feature is hidden from the UI (navigation, shortcuts, routes, settings),
 * but its code stays in the repository so it can be turned back on by flipping the flag.
 */
export const FEATURES = {
  /** Copilot: the chat panel, floating button, /copilot page and its Ctrl/Cmd+J shortcut. Paused for now. */
  copilot: false,
} as const;

/**
 * Recovers usable JSON from model output that was cut off (MAX_TOKENS) or wrapped in fences.
 * Pure and dependency-free so it can be tested on its own.
 */

/** Removes a surrounding ```json fence and any chatter before the first brace or bracket. */
export function stripJsonFence(text: string): string {
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const first = t.search(/[{[]/);
  if (first > 0) t = t.slice(first);
  return t;
}

interface Cut {
  index: number; // exclusive end of the text to keep
  closers: string; // brackets still open at that point, innermost first
}

/**
 * Scans once, recording every point where the text could be cut cleanly (after a comma outside a
 * string, or at the very end) together with the brackets that would still need closing.
 */
function scan(text: string): { cuts: Cut[]; endInString: boolean } {
  const stack: string[] = [];
  const cuts: Cut[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
    else if (c === ',' && stack.length) cuts.push({ index: i, closers: [...stack].reverse().join('') });
  }
  cuts.push({ index: text.length, closers: [...stack].reverse().join('') });
  return { cuts, endInString: inString };
}

/**
 * Parses JSON, repairing truncation when needed. Returns the value and whether repair was used.
 * Throws the original SyntaxError if nothing can be salvaged.
 */
export function parseJsonLoose<T = unknown>(raw: string): { value: T; repaired: boolean } {
  const text = stripJsonFence(raw);
  try {
    return { value: JSON.parse(text) as T, repaired: false };
  } catch (original) {
    const { cuts, endInString } = scan(text);
    // Try the full text first (closing a dangling string), then fall back comma by comma.
    for (let i = cuts.length - 1; i >= 0; i--) {
      const cut = cuts[i];
      let head = text.slice(0, cut.index);
      if (cut.index === text.length && endInString) head += '"';
      head = head.replace(/[\s,]+$/, '');
      // A dangling `"key":` or bare `"key"` at the end cannot be completed; drop it.
      head = head.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:?\s*$/, (m) => (m.trimStart().startsWith(',') || /:\s*$/.test(m) ? '' : m));
      const candidates = [head + cut.closers, head.replace(/,?\s*"(?:[^"\\]|\\.)*"\s*:\s*$/, '') + cut.closers];
      for (const candidate of candidates) {
        try {
          return { value: JSON.parse(candidate) as T, repaired: true };
        } catch {
          /* try the next cut */
        }
      }
    }
    throw original;
  }
}

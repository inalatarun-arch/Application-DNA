import type { Functionality } from '@/db/types';
import { bareName, displayName, norm } from './processResolve';

/**
 * Reads the documented process of a screen: the ordered list of steps in its "Business Process" text, matched to the
 * functionalities that carry them out, and what kind of step each one is. The order always comes from the documentation
 * text. Function IDs, creation time and alphabetical order are never used to decide what happens first.
 */

/** "Create draft; validate registration; submit base profile" or "1. Open 2. Review" or "A -> B" into separate steps. */
export function splitSteps(text: string): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  let parts: string[];
  if (/(?:^|\s)\d+[.)]\s+\S/.test(t) && /(?:^|\s)2[.)]\s+\S/.test(t)) parts = t.split(/\s*(?:^|\s)\d+[.)]\s+/);
  else if (t.includes(';')) parts = t.split(';');
  else if (/→|->|=>|\bthen\b/i.test(t)) parts = t.split(/\s*(?:→|->|=>|\bthen\b)\s*/i);
  else parts = [t];
  return parts.map((p) => p.trim().replace(/[.,]$/, '')).filter(Boolean);
}

const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'for', 'and', 'on', 'in', 'by', 'with']);
const tokens = (s: string): string[] => norm(s).split(' ').filter((w) => w && !STOP.has(w));

/** How well a documented step names a function: shared words over the shorter phrase (1 = same, 0 = nothing shared). */
export function similarity(a: string, b: string): number {
  const x = new Set(tokens(a));
  const y = new Set(tokens(b));
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size);
}

export interface StepMatch {
  /** Position in the documented list. */
  index: number;
  step: string;
  fn: Functionality;
}

export interface StepPlan {
  /** Steps that name one of the screen's functionalities, in documented order. */
  ordered: StepMatch[];
  /** Documented steps no functionality carries out. */
  stepsWithoutFunction: string[];
  /** Functionalities the process text never mentions, so their place in the order is unknown. */
  unordered: Functionality[];
}

const MATCH_AT = 0.67;

/** One-to-one: each function is used once, preferring the best score, and low scores are left unmatched rather than forced. */
export function matchSteps(steps: string[], fns: Functionality[]): StepPlan {
  const scored: Array<{ i: number; f: number; score: number }> = [];
  steps.forEach((step, i) => fns.forEach((fn, f) => { const s = similarity(step, bareName(displayName(fn))); if (s >= MATCH_AT) scored.push({ i, f, score: s }); }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const usedStep = new Set<number>();
  const usedFn = new Set<number>();
  const matches: StepMatch[] = [];
  for (const m of scored) {
    if (usedStep.has(m.i) || usedFn.has(m.f)) continue;
    usedStep.add(m.i); usedFn.add(m.f);
    matches.push({ index: m.i, step: steps[m.i], fn: fns[m.f] });
  }
  matches.sort((a, b) => a.index - b.index);
  return {
    ordered: matches,
    stepsWithoutFunction: steps.filter((_, i) => !usedStep.has(i)),
    unordered: fns.filter((_, i) => !usedFn.has(i)),
  };
}

// ------------------------------------------------------------------ what kind of step

export type StepClass = 'action' | 'check' | 'approve' | 'decline' | 'rework';

// A step is classified by its leading verb ("replace rejected evidence" is rework; "submit verification request" is an action).
const APPROVE = /^(approve|accept|release|authori[sz]e|sign off|clear)\b/;
const DECLINE = /^(reject|decline|deny|return|send back|cancel|withdraw|escalate|hold|suspend|block)\b/;
const REWORK = /^(replace|resubmit|re-submit|retry|re-try|re-upload|reupload|rework|revise|amend|correct)\b/;
// Explicit validation only: "inspect scan" checks something, "inspect history" just looks at it.
const CHECK = /^(validate|verify|check|confirm|test|screen)\b|^(inspect|review|run|perform)\b.*\b(scan|check|validation|verification)\b/;

/**
 * What a documented step is: an ordinary action, a check, an outcome that excludes other outcomes (approve, decline), or a
 * conditional rework. This reads the step's own words to decide how it is drawn; it never decides when the step happens.
 */
export function classifyStep(step: string): StepClass {
  const s = step.toLowerCase().trim().replace(/^to\s+/, '');
  if (APPROVE.test(s)) return 'approve';
  if (DECLINE.test(s)) return 'decline';
  if (REWORK.test(s)) return 'rework';
  if (CHECK.test(s)) return 'check';
  return 'action';
}

export const isOutcome = (c: StepClass): boolean => c === 'approve' || c === 'decline';

// ------------------------------------------------------------------ contradictions

/** Pairs a before b in `order`, for every ordered pair that source states. */
function precedences(order: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) out.add(`${order[i]}>${order[j]}`);
  return out;
}

/**
 * Finds pairs of functions that two documented sources put in opposite orders. `sources` are lists of function ids, each in
 * the order that source gives them. The caller shows these as uncertain instead of picking a winner.
 */
export function conflictingPairs(sources: string[][]): Array<[string, string]> {
  const seen = sources.map(precedences);
  const conflicts: Array<[string, string]> = [];
  const done = new Set<string>();
  for (let a = 0; a < seen.length; a++) {
    for (let b = a + 1; b < seen.length; b++) {
      for (const p of seen[a]) {
        const [x, y] = p.split('>');
        if (seen[b].has(`${y}>${x}`) && !done.has([x, y].sort().join('|'))) { done.add([x, y].sort().join('|')); conflicts.push([x, y]); }
      }
    }
  }
  return conflicts;
}

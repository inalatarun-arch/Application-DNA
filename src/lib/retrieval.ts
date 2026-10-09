import { STOPWORDS } from '@/prompts';

interface Hit { kind: string; name: string; text: string; score: number }

const terms = (q: string) => [...new Set(q.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? [])].filter((t) => !STOPWORDS.has(t));

/** Ranks records by how many question terms they contain; a match in the name counts triple. */
export function rank(records: Array<{ kind: string; name: string; text: string }>, q: string): Hit[] {
  const ts = terms(q);
  if (!ts.length) return [];
  return records
    .map((r) => {
      const name = r.name.toLowerCase();
      const text = r.text.toLowerCase();
      let score = 0;
      for (const t of ts) { if (name.includes(t)) score += 3; else if (text.includes(t)) score += 1; }
      return { ...r, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

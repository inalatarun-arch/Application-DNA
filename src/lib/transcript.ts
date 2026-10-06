/** Reading transcript files (plain text, Teams/Zoom VTT, SRT) into clean "Speaker: text" lines. */

export const MAX_TRANSCRIPT_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_TRANSCRIPT_TYPES = '.txt,.vtt,.srt,.md,.text,.log,text/plain,text/vtt';

const TIMESTAMP = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}/;

function decodeEntities(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Strips cue numbers, timestamps and markup, then merges consecutive lines from the same speaker. */
export function cleanSubtitles(raw: string): string {
  const out: Array<{ speaker: string; text: string }> = [];
  let inNote = false;

  for (const original of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const line = original.trim();
    if (!line) {
      inNote = false;
      continue;
    }
    if (inNote || /^WEBVTT/i.test(line) || /^(STYLE|REGION)\b/.test(line)) continue;
    if (/^NOTE\b/.test(line)) {
      inNote = true;
      continue;
    }
    if (TIMESTAMP.test(line) || /^\d+$/.test(line)) continue;

    // Teams: <v Jane Doe>Hello</v>
    let speaker = '';
    let text = line;
    const voice = text.match(/^<v\s+([^>]+)>/i);
    if (voice) {
      speaker = voice[1].trim();
      text = text.slice(voice[0].length);
    }
    text = decodeEntities(text.replace(/<\/?[^>]+>/g, '')).trim();
    if (!text) continue;

    // Zoom: "Jane Doe: Hello"
    if (!speaker) {
      const colon = text.match(/^([^:]{1,60}):\s+(.+)$/);
      if (colon && /^[\p{L}][\p{L}\p{N} .'’()-]*$/u.test(colon[1])) {
        speaker = colon[1].trim();
        text = colon[2].trim();
      }
    }

    const last = out[out.length - 1];
    if (last && last.speaker === speaker) last.text += ` ${text}`;
    else out.push({ speaker, text });
  }
  return out.map((o) => (o.speaker ? `${o.speaker}: ${o.text}` : o.text)).join('\n');
}

export async function readTranscriptFile(file: File): Promise<string> {
  if (file.size > MAX_TRANSCRIPT_FILE_BYTES) throw new Error(`${file.name} is larger than 5 MB. Split it into parts or paste the relevant section.`);
  if (/\.(docx?|pdf|pptx?|xlsx?)$/i.test(file.name)) {
    throw new Error(`${file.name} is a ${file.name.split('.').pop()?.toUpperCase()} file. Download the transcript as .vtt or .txt, or paste its text instead.`);
  }
  const text = await file.text();
  if (/\.(vtt|srt)$/i.test(file.name) || /^WEBVTT/.test(text.trimStart())) return cleanSubtitles(text);
  return text.replace(/\r\n?/g, '\n').trim();
}

export const approxTokens = (text: string): number => Math.ceil(text.length / 4);

import { ACTIONS } from '../core/input';

/** Semantic text tags, closed by `[/]`. Names must never equal an action name (`[shield]` draws a button glyph). */
export const TEXT_TAGS = ['gear', 'place', 'danger', 'old', 'key', 'soft', 'shake', 'fade'] as const;
export type TextTag = (typeof TEXT_TAGS)[number];
/** The tags that color or weight words (the content test caps these per box). `shake`/`fade` are motion. */
export const HIGHLIGHT_TAGS: readonly TextTag[] = ['gear', 'place', 'danger', 'old', 'key', 'soft'];

const isTag = (s: string): s is TextTag => (TEXT_TAGS as readonly string[]).includes(s);
const isAction = (s: string) => (ACTIONS as string[]).includes(s);

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Text → HTML: `[tag]…[/]` become spans (`<span class="t-gear">`), `[action]` becomes `key(action)`, newlines
 * become `<br>`. Unknown brackets stay as typed. A span left open (text still typing) is closed at the end.
 */
export function richHtml(text: string, key: (a: string) => string): string {
  let out = '';
  let depth = 0;
  const re = /\[(\/|\w+)\]/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out += escapeHtml(text.slice(last, m.index));
    last = m.index + m[0].length;
    const name = m[1];
    if (name === '/') {
      if (depth > 0) { out += '</span>'; depth--; } else out += escapeHtml(m[0]);
    } else if (isTag(name)) {
      out += `<span class="t-${name}">`;
      depth++;
    } else if (isAction(name)) out += key(name);
    else out += escapeHtml(m[0]);
  }
  out += escapeHtml(text.slice(last)) + '</span>'.repeat(depth);
  return out.replace(/\n/g, '<br>');
}

/** Problems with a piece of player text's tags (empty when fine): unknown or unclosed tags, a stray `[/]`. */
export function tagProblems(text: string): string[] {
  const problems: string[] = [];
  let depth = 0;
  for (const m of text.matchAll(/\[(\/|\w+)\]/g)) {
    const name = m[1];
    if (name === '/') { if (--depth < 0) { problems.push('stray [/]'); depth = 0; } }
    else if (isTag(name)) depth++;
    else if (!isAction(name)) problems.push(`unknown tag [${name}]`);
  }
  if (depth > 0) problems.push('unclosed tag');
  return problems;
}

/** What the player sees as text: tags and button names removed (a button counts as one character). */
export function visibleText(text: string): string {
  return text.replace(/\[(\/|\w+)\]/g, (m, n) => (isAction(n) ? '#' : n === '/' || isTag(n) ? '' : m));
}

/**
 * For typing text along a voice: `ends[v]` is where the raw text ends once `v` visible characters are shown
 * (a button name is one character, so it is never cut in half; tags in front of the next character stay hidden).
 */
export function visibleEnds(text: string): number[] {
  const ends = [0];
  const re = /\[(\/|\w+)\]/g;
  let last = 0;
  const chars = (to: number) => {
    for (let i = last; i < to; i++) ends.push(i + 1);
  };
  for (let m = re.exec(text); m; m = re.exec(text)) {
    chars(m.index);
    last = m.index + m[0].length;
    if (isAction(m[1])) ends.push(last);
    else if (m[1] !== '/' && !isTag(m[1])) {
      // An unknown bracket stays as typed, one character at a time.
      last = m.index;
      chars(m.index + m[0].length);
      last = m.index + m[0].length;
    }
  }
  chars(text.length);
  return ends;
}

/** Number of highlight spans in a box. */
export function highlightCount(text: string): number {
  return [...text.matchAll(/\[(\w+)\]/g)].filter((m) => (HIGHLIGHT_TAGS as readonly string[]).includes(m[1])).length;
}

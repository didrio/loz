import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../core/input';
import { TEXT_TAGS, highlightCount, richHtml, tagProblems, visibleText } from './richText';

const key = (a: string) => `<k:${a}>`;

describe('richText', () => {
  it('no tag shares a name with an action (an action name draws a button)', () => {
    for (const t of TEXT_TAGS) expect(ACTIONS as string[]).not.toContain(t);
  });

  it('turns tags into spans, actions into buttons, newlines into breaks', () => {
    expect(richHtml('Take the [gear]Key[/] [shield]\nGo', key)).toBe('Take the <span class="t-gear">Key</span> <k:shield><br>Go');
  });

  it('closes a span left open while text types, and escapes html', () => {
    expect(richHtml('a<b [place]Thist', key)).toBe('a&lt;b <span class="t-place">Thist</span>');
  });

  it('leaves unknown brackets alone', () => {
    expect(richHtml('[nope] and [/]', key)).toBe('[nope] and [/]');
  });

  it('finds bad tags', () => {
    expect(tagProblems('[gear]x[/] [shield]')).toEqual([]);
    expect(tagProblems('[itme]x')).toEqual(['unknown tag [itme]']);
    expect(tagProblems('[gear]x')).toEqual(['unclosed tag']);
    expect(tagProblems('x[/]')).toEqual(['stray [/]']);
  });

  it('counts highlights and visible characters', () => {
    expect(highlightCount('[gear]a[/] [shake]b[/] [place]c[/]')).toBe(2);
    expect(visibleText('Hold [shield] to [key]block[/]')).toBe('Hold # to block');
  });
});

/**
 * Letter-to-sound: the last resort for words in neither NAMES nor LEXICON. Context-sensitive rewrite
 * rules in the style of the classic NRL report (Elovitz et al., 1976), written from scratch and trimmed.
 * Output is CMUdict-format ARPAbet with stress digits and a simple stress guess.
 *
 * Rule = [left, match, right, phonemes]. Context symbols: ' ' word edge · '#' one or more vowels ·
 * ':' zero or more consonants · '^' one consonant · '.' one voiced consonant · '+' front vowel (e i y) ·
 * '%' a suffix (e, es, ed, er, ely, ing) · other letters literally.
 */
type Rule = [string, string, string, string];

const isV = (c: string) => 'aeiouy'.includes(c);
const isC = (c: string) => c >= 'a' && c <= 'z' && !isV(c);
const isVoiced = (c: string) => 'bdvgjlmnrwz'.includes(c);

/** Match `pat` against `w` going rightwards from `i`. Returns true on any way of matching. */
function matchRight(pat: string, w: string, i: number): boolean {
  if (!pat) return true;
  const p = pat[0];
  const rest = pat.slice(1);
  const c = w[i] ?? '';
  switch (p) {
    case ' ': return (c === ' ' || c === '') && matchRight(rest, w, i + 1);
    case '#': {
      let j = i;
      while (j < w.length && isV(w[j])) j++;
      for (; j > i; j--) if (matchRight(rest, w, j)) return true;
      return false;
    }
    case ':': {
      let j = i;
      while (j < w.length && isC(w[j])) j++;
      for (; j >= i; j--) if (matchRight(rest, w, j)) return true;
      return false;
    }
    case '^': return isC(c) && matchRight(rest, w, i + 1);
    case '.': return c !== '' && isVoiced(c) && matchRight(rest, w, i + 1);
    case '+': return 'eiy'.includes(c) && c !== '' && matchRight(rest, w, i + 1);
    case '%':
      for (const s of ['ing', 'ely', 'er', 'es', 'ed', 'e']) if (w.startsWith(s, i) && matchRight(rest, w, i + s.length)) return true;
      return false;
    default: return c === p && matchRight(rest, w, i + 1);
  }
}

/** Match `pat` against `w` going leftwards, ending just before `i`. */
function matchLeft(pat: string, w: string, i: number): boolean {
  if (!pat) return true;
  const p = pat[pat.length - 1];
  const rest = pat.slice(0, -1);
  const c = w[i - 1] ?? '';
  switch (p) {
    case ' ': return (c === ' ' || i <= 0) && matchLeft(rest, w, i - 1);
    case '#': {
      let j = i;
      while (j > 0 && isV(w[j - 1])) j--;
      for (; j < i; j++) if (matchLeft(rest, w, j)) return true;
      return false;
    }
    case ':': {
      let j = i;
      while (j > 0 && isC(w[j - 1])) j--;
      for (; j <= i; j++) if (matchLeft(rest, w, j)) return true;
      return false;
    }
    case '^': return isC(c) && matchLeft(rest, w, i - 1);
    case '.': return c !== '' && isVoiced(c) && matchLeft(rest, w, i - 1);
    case '+': return c !== '' && 'eiy'.includes(c) && matchLeft(rest, w, i - 1);
    case '%': return false; // suffix context is only meaningful on the right
    default: return c === p && matchLeft(rest, w, i - 1);
  }
}

const R: Record<string, Rule[]> = {
  a: [
    [' ', 'a', ' ', 'AH0'], [' ', 'are', ' ', 'AA1 R'], [' ', 'ar', 'o', 'ER0 R'], ['', 'ar', '#', 'EH1 R'],
    ['^', 'as', '#', 'EY1 S'], ['', 'a', 'wa', 'AH0'], ['', 'aw', '', 'AO1'], [' :', 'any', '', 'EH1 N IY0'],
    ['', 'a', '^+#', 'EY1'], ['#:', 'ally', '', 'AH0 L IY0'], [' ', 'al', '#', 'AH0 L'], ['', 'again', '', 'AH0 G EH1 N'],
    ['', 'a', '^%', 'EY1'], [' :', 'a', '^+ ', 'EY1'], ['', 'a', '^+:#', 'AE1'], [' ', 'arr', '', 'AH0 R'],
    ['^', 'ar', ' ', 'AA1 R'], ['', 'ar', ' ', 'ER0'], ['', 'ar', '', 'AA1 R'], ['', 'air', '', 'EH1 R'],
    ['', 'ai', '', 'EY1'], ['', 'ay', '', 'EY1'], ['', 'au', '', 'AO1'], ['#:', 'al', ' ', 'AH0 L'],
    ['', 'alk', '', 'AO1 K'], ['', 'al', '^', 'AO1 L'], [' :', 'able', '', 'EY1 B AH0 L'], ['', 'able', '', 'AH0 B AH0 L'],
    ['', 'ang', '+', 'EY1 N JH'], ['', 'a', '', 'AE1'],
  ],
  b: [[' ', 'be', '^#', 'B IH0'], ['', 'being', '', 'B IY1 IH0 NG'], [' ', 'both', ' ', 'B OW1 TH'], [' ', 'bus', '#', 'B IH1 Z'], ['', 'buil', '', 'B IH1 L'], ['', 'b', 'b', ''], ['', 'b', '', 'B']],
  c: [
    [' ', 'ch', '^', 'K'], ['^e', 'ch', '', 'K'], ['', 'ch', '', 'CH'], [' s', 'ci', '#', 'S AY1'], ['', 'ci', 'a', 'SH'],
    ['', 'ci', 'o', 'SH'], ['', 'ci', 'en', 'SH'], ['', 'c', '+', 'S'], ['', 'ck', '', 'K'], ['', 'com', '%', 'K AH1 M'], ['', 'c', 'c', ''], ['', 'c', '', 'K'],
  ],
  d: [['#:', 'ed', ' ', 'D'], ['.e', 'd', ' ', 'D'], ['', 'dg', '+', 'JH'], [' :', 'do', ' ', 'D UW1'], ['', 'd', 'd', ''], ['', 'd', '', 'D']],
  e: [
    ['#:', 'e', ' ', ''], [' :', 'e', ' ', 'IY1'], ['#', 'ed', ' ', 'D'], ['#:', 'e', 'd ', ''],
    ['', 'ev', 'er', 'EH1 V'], ['', 'e', '^%', 'IY1'], ['', 'eri', '#', 'IY1 R IY0'], ['', 'eri', '', 'EH1 R IH0'],
    ['#:', 'er', '#', 'ER0'], ['', 'er', '#', 'EH1 R'], ['', 'er', '', 'ER0'], [' ', 'even', '', 'IY1 V AH0 N'],
    ['#:', 'e', 'w', ''], ['', 'ew', '', 'UW1'], ['', 'e', 'o', 'IY1'], ['#:s', 'es', ' ', 'IH0 Z'], ['#:', 'e', 's ', ''],
    ['#:', 'ely', ' ', 'L IY0'], ['#:', 'ement', '', 'M AH0 N T'], ['', 'eful', '', 'F UH0 L'], ['', 'ee', '', 'IY1'],
    ['', 'earn', '', 'ER1 N'], [' ', 'ear', '^', 'ER1'], ['', 'ead', '', 'EH1 D'], ['#:', 'ea', ' ', 'IY0 AH0'], ['', 'ea', 'su', 'EH1'],
    ['', 'ea', '', 'IY1'], ['', 'eigh', '', 'EY1'], ['', 'ei', '', 'IY1'], [' ', 'eye', '', 'AY1'], ['', 'ey', '', 'IY0'],
    ['', 'eu', '', 'Y UW1'], ['', 'e', '', 'EH1'],
  ],
  f: [['', 'ful', '', 'F UH0 L'], ['', 'f', 'f', ''], ['', 'f', '', 'F']],
  g: [
    ['', 'giv', '', 'G IH1 V'], [' ', 'g', 'i^', 'G'], ['', 'ge', 't', 'G EH1'], ['su', 'gges', '', 'G JH EH1 S'], ['', 'gg', '', 'G'],
    [' b#', 'g', '', 'G'], ['', 'g', '+', 'JH'], ['', 'great', '', 'G R EY1 T'], ['#', 'gh', '', ''], ['', 'g', 'g', ''],
    ['', 'ght', '', 'T'], ['', 'gn', '', 'N'], ['', 'g', '', 'G'],
  ],
  h: [[' ', 'hav', '', 'HH AE1 V'], [' ', 'here', '', 'HH IY1 R'], [' ', 'hour', '', 'AW1 ER0'], ['', 'how', '', 'HH AW1'], ['', 'h', '#', 'HH'], ['', 'h', '', '']],
  i: [
    [' ', 'in', '', 'IH0 N'], [' ', 'i', ' ', 'AY1'], ['', 'in', 'd', 'AY1 N'], ['', 'ier', '', 'IY0 ER0'], ['#:r', 'ied', '', 'IY0 D'],
    ['', 'ied', ' ', 'AY1 D'], ['', 'ien', '', 'IY1 EH0 N'], ['', 'ie', 't', 'AY1 EH0'], [' :', 'i', '%', 'AY1'], ['', 'i', '%', 'IY1'],
    ['', 'ie', '', 'IY1'], ['', 'i', '^+:#', 'IH1'], ['', 'ir', '#', 'AY1 R'], ['', 'iz', '%', 'AY1 Z'], ['', 'is', '%', 'AY1 Z'],
    ['', 'i', 'd%', 'AY1'], ['+^', 'i', '^+', 'IH1'], ['', 'i', 't%', 'AY1'], ['#:^', 'i', '^+', 'IH1'], ['', 'i', '^+', 'AY1'],
    ['', 'ir', '', 'ER1'], ['', 'igh', '', 'AY1'], ['', 'ild', '', 'AY1 L D'], ['', 'ign', ' ', 'AY1 N'], ['', 'ign', '^', 'AY1 N'],
    ['', 'ign', '%', 'AY1 N'], ['', 'ique', '', 'IY1 K'], ['', 'i', '', 'IH1'],
  ],
  j: [['', 'j', '', 'JH']],
  k: [[' ', 'k', 'n', ''], ['', 'k', '', 'K']],
  l: [['', 'lo', 'c#', 'L OW1'], ['l', 'l', '', ''], ['#:^', 'l', '%', 'AH0 L'], ['', 'lead', '', 'L IY1 D'], ['', 'l', '', 'L']],
  m: [['', 'mov', '', 'M UW1 V'], ['m', 'm', '', ''], ['', 'm', '', 'M']],
  n: [['e', 'ng', '+', 'N JH'], ['', 'ng', 'r', 'NG G'], ['', 'ng', '#', 'NG G'], ['', 'ngl', '%', 'NG G AH0 L'], ['', 'ng', '', 'NG'], ['', 'nk', '', 'NG K'], [' ', 'now', ' ', 'N AW1'], ['n', 'n', '', ''], ['', 'n', '', 'N']],
  o: [
    ['', 'of', ' ', 'AH1 V'], ['', 'orough', '', 'ER1 OW0'], ['#:', 'or', ' ', 'ER0'], ['#:', 'ors', ' ', 'ER0 Z'], ['', 'or', '', 'AO1 R'],
    [' ', 'one', '', 'W AH1 N'], ['', 'ow', '', 'OW1'], ['', 'over', '', 'OW1 V ER0'], ['', 'ov', '', 'AH1 V'], ['', 'o', '^%', 'OW1'],
    ['', 'o', '^en', 'OW1'], ['', 'o', '^i#', 'OW1'], ['', 'ol', 'd', 'OW1 L'], ['', 'ought', '', 'AO1 T'], ['', 'ough', '', 'AH1 F'],
    [' ', 'ou', '', 'AW1'], ['h', 'ou', 's#', 'AW1'], ['', 'ous', '', 'AH0 S'], ['', 'our', '', 'AO1 R'], ['', 'ould', '', 'UH1 D'],
    ['^', 'ou', '^l', 'AH1'], ['', 'oup', '', 'UW1 P'], ['', 'ou', '', 'AW1'], ['', 'oy', '', 'OY1'], ['', 'oing', '', 'UW1 IH0 NG'],
    ['', 'oi', '', 'OY1'], ['', 'oor', '', 'AO1 R'], ['', 'ook', '', 'UH1 K'], ['', 'ood', '', 'UH1 D'], ['', 'oo', '', 'UW1'],
    ['', 'o', 'e', 'OW1'], ['', 'o', ' ', 'OW1'], ['', 'oa', '', 'OW1'], [' ', 'only', '', 'OW1 N L IY0'], [' ', 'once', '', 'W AH1 N S'],
    ["c", 'o', 'n', 'AA1'], ['', 'o', 'ng', 'AO1'], [' :^', 'o', 'n', 'AH1'], ['i', 'on', '', 'AH0 N'], ['#:', 'on', ' ', 'AH0 N'],
    ['#^', 'on', '', 'AH0 N'], ['', 'o', 'st ', 'OW1'], ['', 'of', '^', 'AO1 F'], ['', 'other', '', 'AH1 DH ER0'], ['', 'oss', ' ', 'AO1 S'],
    ['#:^', 'om', '', 'AH1 M'], ['', 'o', '', 'AA1'],
  ],
  p: [['', 'ph', '', 'F'], ['', 'peop', '', 'P IY1 P'], ['', 'pow', '', 'P AW1'], ['', 'put', ' ', 'P UH1 T'], ['', 'p', 'p', ''], ['', 'p', '', 'P']],
  q: [['', 'quar', '', 'K W AO1 R'], ['', 'qu', '', 'K W'], ['', 'q', '', 'K']],
  r: [[' ', 're', '^#', 'R IY0'], ['r', 'r', '', ''], ['', 'r', '', 'R']],
  s: [
    ['', 'sh', '', 'SH'], ['#', 'sion', '', 'ZH AH0 N'], ['', 'some', '', 'S AH0 M'], ['#', 'sur', '#', 'ZH ER0'], ['', 'sure', '', 'SH ER0'],
    ['#', 'su', '#', 'ZH UW0'], ['#', 'ssu', '#', 'SH UW0'], ['#', 'sed', ' ', 'Z D'], ['#', 's', '#', 'Z'], ['', 'said', '', 'S EH1 D'],
    ['^', 'sion', '', 'SH AH0 N'], ['', 's', 's', ''], ['.', 's', ' ', 'Z'], ['#:.e', 's', ' ', 'Z'], ['#:^#', 's', ' ', 'S'],
    ['u', 's', ' ', 'S'], [' :#', 's', ' ', 'Z'], ['', 's', 'ch', 'S'], ['', 'sch', '', 'S K'], ['', 's', 'c+', ''], ['#', 'sm', '', 'Z M'],
    ['#', 'sn', '%', 'Z AH0 N'], ['', 's', '', 'S'],
  ],
  t: [
    [' ', 'the', ' ', 'DH AH0'], ['', 'to', ' ', 'T UW1'], ['', 'that', ' ', 'DH AE1 T'], [' ', 'this', ' ', 'DH IH1 S'], [' ', 'they', '', 'DH EY1'],
    [' ', 'there', '', 'DH EH1 R'], ['', 'ther', '', 'DH ER0'], ['', 'their', '', 'DH EH1 R'], [' ', 'than', ' ', 'DH AE1 N'], [' ', 'them', ' ', 'DH EH1 M'],
    [' ', 'these', ' ', 'DH IY1 Z'], [' ', 'then', '', 'DH EH1 N'], ['', 'through', '', 'TH R UW1'], ['', 'those', '', 'DH OW1 Z'], ['', 'though', ' ', 'DH OW1'],
    ['', 'thus', '', 'DH AH1 S'], ['', 'th', '', 'TH'], ['#:', 'ted', ' ', 'T IH0 D'], ['s', 'ti', '#n', 'CH'], ['', 'ti', 'o', 'SH'],
    ['', 'ti', 'a', 'SH'], ['', 'tien', '', 'SH AH0 N'], ['', 'tur', '#', 'CH ER0'], ['', 'tu', 'a', 'CH UW1'], [' ', 'two', '', 'T UW1'],
    ['', 't', 't', ''], ['', 't', '', 'T'],
  ],
  u: [
    [' ', 'un', 'i', 'Y UW1 N'], [' ', 'un', '', 'AH0 N'], [' ', 'upon', '', 'AH0 P AO1 N'], ['t', 'ur', '#', 'UH1 R'], ['s', 'ur', '#', 'UH1 R'],
    ['r', 'ur', '#', 'UH1 R'], ['', 'ur', '', 'ER1'], ['', 'u', '^ ', 'AH1'], ['', 'u', '^^', 'AH1'], ['', 'uy', '', 'AY1'], [' g', 'u', '#', ''],
    ['g', 'u', '%', ''], ['g', 'u', '#', 'W'], ['#n', 'u', '', 'Y UW1'], ['t', 'u', '', 'UW1'], ['s', 'u', '', 'UW1'], ['r', 'u', '', 'UW1'],
    ['l', 'u', '', 'UW1'], ['', 'u', '', 'Y UW1'],
  ],
  v: [['', 'view', '', 'V Y UW1'], ['', 'v', '', 'V']],
  w: [
    [' ', 'were', '', 'W ER1'], ['', 'wa', 's', 'W AA1'], ['', 'wa', 't', 'W AA1'], ['', 'where', '', 'W EH1 R'], ['', 'what', '', 'W AH1 T'],
    ['', 'whol', '', 'HH OW1 L'], ['', 'who', '', 'HH UW1'], ['', 'wh', '', 'W'], ['', 'war', '', 'W AO1 R'], ['', 'wor', '^', 'W ER1'],
    ['', 'wr', '', 'R'], ['', 'w', '', 'W'],
  ],
  x: [[' ', 'x', '', 'Z'], ['', 'x', '', 'K S']],
  y: [
    ['', 'young', '', 'Y AH1 NG'], [' ', 'you', '', 'Y UW1'], [' ', 'yes', '', 'Y EH1 S'], [' ', 'y', '', 'Y'], ['#:^', 'y', ' ', 'IY0'],
    ['#:^', 'y', 'i', 'IY0'], [' :', 'y', ' ', 'AY1'], [' :', 'y', '#', 'AY1'], [' :', 'y', '^+:#', 'IH1'], [' :', 'y', '^#', 'AY1'], ['', 'y', '', 'IH1'],
  ],
  z: [['', 'z', 'z', ''], ['', 'z', '', 'Z']],
};

const PREFIXES = ['a', 'be', 'de', 're', 'en', 'ex', 'con', 'com', 'dis', 'pre', 'pro', 'un', 'in', 'im'];

/** Guess stress: every vowel starts as primary/unstressed by the rules; keep one primary, demote others. */
function guessStress(phones: string[], word: string): string[] {
  const vi = phones.map((p, i) => (/\d$/.test(p) ? i : -1)).filter((i) => i >= 0);
  if (vi.length === 0) return phones;
  let primary = 0;
  if (vi.length > 2 && PREFIXES.some((p) => word.startsWith(p) && word.length > p.length + 2)) primary = 1;
  const out = [...phones];
  vi.forEach((idx, n) => {
    const base = out[idx].slice(0, -1);
    const given = out[idx].slice(-1);
    // rule-marked reductions (0) stay; a primary mark away from the chosen syllable becomes secondary only if it's last-but-one.
    if (given === '0') out[idx] = base + '0';
    else out[idx] = base + (n === primary ? '1' : n === primary + 2 && vi.length > 3 ? '2' : '0');
  });
  // Ensure the primary landed on a vowel the rules didn't reduce.
  if (!out.some((p) => p.endsWith('1'))) out[vi[0]] = out[vi[0]].slice(0, -1) + '1';
  return out;
}

/** Spell a word out to ARPAbet (CMUdict style, with stress digits). Never throws. */
export function letterToSound(input: string): string {
  const word = input.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '');
  if (!word) return '';
  const w = ` ${word} `;
  const phones: string[] = [];
  let i = 1;
  while (i < w.length - 1) {
    const rules = R[w[i]];
    let hit: Rule | undefined;
    if (rules) {
      hit = rules.find(([l, m, r]) => w.startsWith(m, i) && matchLeft(l, w, i) && matchRight(r, w, i + m.length));
    }
    if (hit) {
      if (hit[3]) phones.push(...hit[3].split(' '));
      i += hit[1].length;
    } else i++;
  }
  return guessStress(phones, word).join(' ');
}

/**
 * Hand pronunciations (CMUdict format, with stress digits) for invented names and for words CMUdict
 * lacks that appear in player text. Wins over LEXICON.
 */
export const NAMES: Record<string, string> = {
  // places
  embervale: 'EH1 M B ER0 V EY2 L',
  emberfield: 'EH1 M B ER0 F IY2 L D',
  thistledown: 'TH IH1 S AH0 L D AW2 N',
  northpass: 'N AO1 R TH P AE2 S',
  overworld: 'OW1 V ER0 W ER2 L D',
  // bells
  morrowbell: 'M AA1 R OW0 B EH2 L',
  lullbell: 'L AH1 L B EH2 L',
  waybell: 'W EY1 B EH2 L',
  antebell: 'AE1 N T IY0 B EH2 L',
  gravelheart: 'G R AE1 V AH0 L HH AA2 R T',
  // people
  wren: 'R EH1 N',
  odo: 'OW1 D OW0',
  pip: 'P IH1 P',
  maren: 'M EH1 R AH0 N',
  tobin: 'T OW1 B IH0 N',
  lark: 'L AA1 R K',
  bram: 'B R AE1 M',
  hesper: 'HH EH1 S P ER0',
  corwin: 'K AO1 R W IH0 N',
  stoneward: 'S T OW1 N W ER2 D',
  // creatures
  murmurbud: 'M ER1 M ER0 B AH2 D',
  gloamwisp: 'G L OW1 M W IH2 S P',
  gloomwisp: 'G L UW1 M W IH2 S P',
  cragstalker: 'K R AE1 G S T AO2 K ER0',
  shellback: 'SH EH1 L B AE2 K',
  thornling: 'TH AO1 R N L IH0 NG',
  thornlings: 'TH AO1 R N L IH0 NG Z',
  wayfarer: 'W EY1 F EH2 R ER0',
  wayfarers: 'W EY1 F EH2 R ER0 Z',
  wisps: 'W IH1 S P S',
  sigil: 'S IH1 JH AH0 L',
  sigils: 'S IH1 JH AH0 L Z',
  // plain words CMUdict lacks
  keeper: 'K IY1 P ER0',
  cashbox: 'K AE1 SH B AA2 K S',
  hushing: 'HH AH1 SH IH0 NG',
  kneels: 'N IY1 L Z',
  fizzes: 'F IH1 Z AH0 Z',
  refilling: 'R IY0 F IH1 L IH0 NG',
  roofless: 'R UW1 F L AH0 S',
  unminded: 'AH0 N M AY1 N D AH0 D',
  psst: 'P S T',
  lamplight: 'L AE1 M P L AY2 T',
  npc: 'EH1 N P IY1 S IY1',
};

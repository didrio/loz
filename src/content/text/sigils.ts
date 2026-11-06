/**
 * The sigils' words (content/sigils.ts): the one who waits in the shrine, in his own words and never
 * his name. One entry per sigil, its boxes one per page. Voice and rules: docs/world.md, "Story".
 */
export const S = {
  hollow: { title: 'Come and see me', text: ['If you\'ve laid old Corwin down, come and see me.\nI\'m in the shrine.'] },
  cell: { title: 'Over the pass', text: ['They sent me over the pass with nothing.\nNobody cared if I came back.'] },
  crypt: { title: 'The world past the mountains', text: ['None of them knew what the world past the mountains had become, or what it did to me.\nThey could have wondered.'] },
  gauntlet: { title: 'Home', text: ['THIS IS MY HOME.'] },
  seal: { title: 'Sorry', text: ['Something is happening to me, here in the shrine. I am becoming more powerful.', 'But if you are reading this, I suppose you have felled me.\nIn that case... well... I\'m sorry for what happened.'] },
  messagesKept: 'Messages are kept in the pause menu ([pause]).',
} as const;

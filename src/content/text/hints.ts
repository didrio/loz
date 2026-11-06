/**
 * The keepers' notes (content/hints.ts): each hint's title and text, keyed by its id.
 * Old-fashioned, fond, a little bossy. Voice and rules: docs/world.md, "Writing for the player".
 */
export const H = {
  tunic: {
    title: 'The Stoneward tunic',
    text: 'The shrine\'s stone beasts hit hard. The [gear]Stoneward Tunic[/], from Odo by the well, halves their blows. Do not haggle.',
  },
  flasks: {
    title: 'Refilling your flasks',
    text: 'A flask is never empty for good, only waiting. Odo, by [place]Thistledown[/]\'s well, fills it again for 20 gems.',
  },
  bells: {
    title: 'Bells, posts and travel',
    text: 'Hang each bell on the post carved with its name. Ring one to travel to any other hung bell. Bells never heal; beds do.',
  },
  boss: {
    title: 'Fighting the stone giant',
    text: 'Jump the giant\'s shock ring. After each slam a chest plate glows loose: pull it off. With all three gone, strike.',
  },
  notesKept: 'Notes are kept in the pause menu ([pause]).',
} as const;

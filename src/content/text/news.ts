/**
 * How the villagers take the big news (content/villageNews.ts): what each says once about a sigil,
 * and, after the ward breaks, the kids' relief. Voice and rules: docs/world.md, "Writing for the player".
 */
export const NEWS = {
  names: { maren: 'Maren', tobin: 'Tobin the Miller', lark: 'Lark', odo: 'Odo the Peddler', pip: 'Pip' },
  sigil: {
    maren: [
      'You\'ve gone pale, Wren. You saw something written, didn\'t you?',
      'Don\'t tell me what it says. If I hear it, it\'s true. Just come back.',
    ],
    tobin: [
      'Words in the air. [old]Sigils[/], old Hesper called them. Not seen one since I was a boy.',
      'He was one of ours. There, I\'ve said it. I\'ll not say his name, and neither should you.',
    ],
    lark: [
      'Did it say my name? Don\'t tell me. Did it? ...Don\'t tell me.',
      'If you say who, he hears. Everyone knows that.',
    ],
    odo: [
      'A letter on the air, addressed to you. I\'ve never been so glad to be a stranger.',
      'Whoever he is, he knows you. The village went quiet when you told me. I won\'t ask.',
    ],
    pip: [
      'Everyone\'s whispering about writing in the air. Button doesn\'t want to know.',
      'If it says a name, don\'t tell me whose. Button gets nightmares.',
    ],
  },
  relief: {
    lark: [
      'Wren! The purple\'s gone! I ran round the fence and nobody shouted!',
      '...Nobody shouted because nobody\'s here. Maren, Tobin, Odo. I looked in the mill. Under Odo\'s stall.',
      'Pip wants to ask you something. She\'s by the cottage.',
    ],
    pip: [
      'The sky\'s the right color. I ran to tell Maren. Nobody was anywhere.',
      'It was like the purple took them with it.',
      'Lark says they\'re hiding. Grown-ups don\'t hide. Not all at once.',
      'Please, could you look for them? Past the fence. Past everywhere.',
    ],
  },
} as const;

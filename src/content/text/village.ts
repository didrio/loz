/**
 * Thistledown's words: every line the player reads in content/village.ts, keyed `speaker.moment`.
 * The script (village.ts) decides which line and when; this file only holds the words, so the
 * writing can be reviewed in one place. Lines with a `day`/`night` pair are picked by the clock;
 * a function takes the numbers or names the line needs. Use these as `V.maren.fence` (a wrong key
 * fails the typecheck). Voice and rules: docs/world.md, "Writing for the player".
 */
export const V = {
  guardTutorial: 'Hold [shield] to block. Blocks wear down your guard (green bars); it refills only while lowered. At zero, you stagger.',
  shield: {
    got: '[gear]Wooden Shield[/]. Scorched, but sound.',
    scream: 'Ahh!!!',
    screamSpeaker: 'From the village',
  },
  maren: {
    who: 'Maren',
    bell: 'Old Hesper said the keepers rang that bell every dawn, and the valley rose with it. I never thought I\'d hear it.',
    warn: 'Wren! Quietly! Nobody goes past the fence, not since the lantern died and the sky turned. You know that.',
    stayIn: {
      night: 'It\'s dark now. Sit by the well with me, away from the gaps.',
      day: 'Sit by the well where I can see you. The fence is all we have, and I don\'t trust it.',
    },
    bucket: 'It was here, by the well. I threw the bucket and it went over the fence.',
    noShield: 'A shield? No. Don\'t tell me.',
    bramChest: 'Old Bram locked his blade in a chest in the [place]Whispering Grove[/], east across the field.',
    giveKey: 'I\'d rather you stayed in. But something came over our fence, and I\'d rather you had a blade. Here.',
    keyItem: '[gear]Small Key[/]. For old Bram\'s chest.',
    keyWhere: 'From the crossroads sign, northeast past the lone oak. The chest is in the clearing at the end.',
    toChest: {
      night: 'Wait for morning, Wren. From the crossroads, northeast, past the lone oak.',
      day: 'From the crossroads, northeast past the lone oak. Bram\'s chest is in the clearing.',
    },
    blade: 'Bram\'s blade suits you better than it ever suited him.',
    carried: 'The shrine door hasn\'t moved since the lantern died. Tobin swears the flame wasn\'t snuffed. It was carried south.',
    hollow: 'South past the bridge: the [place]Gloaming Hollow[/], where old Corwin lit the lamps. They say he still walks them, taller.',
    hollowAdvice: {
      night: 'It\'s night. That is when he walks. Be careful.',
      day: 'If he has our flame, the door stays shut. Go at night, when he walks. Be careful.',
    },
    lanternLit: 'The lantern glows again, faintly. Something came home last night. Was that you?',
    doorWakes: 'If it burns, the door should wake. Go and see.',
    opened: 'You opened it?! The old stories are true. Come back in one piece, Wren.',
    openedTunic: 'You opened it?! Then the old stories are true. And in good slate. Come back in one piece, Wren.',
  },
  tobin: {
    who: 'Tobin the Miller',
    lit: {
      night: 'A light streaked east toward the shrine. Now it burns up there. Good news, or I need more sleep.',
      day: 'The lantern\'s lit and the mill turns like nothing happened. Good news. I\'m not used to it.',
    },
    armed: [
      'Going to the shrine? That door\'s shut tighter than my wallet.',
      'The night the lantern died, a cold blue light left the hill, south, toward the [place]Gloaming Hollow[/]. Like it was carried.',
      'Get the flame back and the door opens. Rather you than me.',
    ],
    scare: ['Something was in the square. Tall, or wide, or both. It didn\'t stay to be looked at.', 'Maren\'s by the well. See she\'s all right.'],
    blight: ['Out in the blight, were you? Bold. Daft, but bold.', 'Keep your voice down. We sit up listening for things at the fence.'],
    chat: {
      night: [
        'Can\'t sleep either? Wisps come out after dark. Little purple things. One good whack pops them.',
        'Nights feel longer since the lantern died. Or I\'m getting old.',
      ],
      day: [
        'The mill needs no wind. It turns because it always has. Don\'t ask me how.',
        'Cut the bushes by the fence for gems. They grow back. Everything does, except my hair.',
      ],
    },
    bell: ['That bell over the square. I thought old Hesper made it up to get us out of bed.'],
    millOffer: 'You look like you haven\'t slept in a week. The mill door, west side of the square. There\'s a bed doing nothing.',
    millKey: '[gear]Mill Key[/]. Sleep in the mill till morning or evening.',
  },
  lark: {
    who: 'Lark',
    psst: 'Psst. Wren. The roofless cottage past the [place]north fence[/]. There\'s a shield in it. I saw it shine.',
    quiet: 'Quiet! I\'m not allowed out. Nobody is. You went anyway.',
    told: {
      key: 'Told you it was real! I ride Tobin\'s flour tray down the bank behind the mill. Don\'t tell him.',
      noKey: 'Told you it was real! Maren threw a bucket at it! I ride Tobin\'s flour tray down the bank. Don\'t tell him.',
    },
    rideIt: 'Ride it! Jump, get the shield under your feet, land, don\'t let go. That\'s the trick.',
    surfTutorial: 'Hold [shield] as you jump and land to ride it, faster than running. Release to step off. Jump and land again to keep speed.',
    surfNote: 'Outdoors only. Enemies can knock you off.',
    tried: 'Tried it yet? Jump, shield under your feet, land. Don\'t think too hard. That\'s how you fall.',
    alone: {
      night: 'I\'m sleeping by the well. If anyone comes back over the fence, I\'ll hear first.',
      day: 'I can go anywhere now. I keep not going. What if they come back and nobody\'s at the well?',
    },
    chat: {
      night: 'I saw you in the dark in a cloud of dust. Maren says I\'m too little to ride at night. And by day.',
      day: 'I saw you go right past the well! Tobin\'s tray is slower. Don\'t tell him that either.',
    },
  },
  pip: {
    who: 'Pip',
    returned: {
      gone: {
        night: 'Button can\'t sleep. She listens for the mill. It doesn\'t creak without Tobin.',
        day: 'Button and I sweep Odo\'s stall each morning. So it\'s nice when he\'s back.',
      },
      home: {
        night: 'Shh. Button\'s asleep. She hasn\'t slept properly since the lake house. Neither have I.',
        day: 'Button says thank you again. She says it every morning. She\'s very polite.',
      },
    },
    found: [
      'Button! You found her! She\'s not even wet.',
      'I hid her in the jar to keep dry. I meant to go back. Then nobody went out.',
      'Odo gave me these for sweeping. Button says they\'re yours.',
    ],
    reward: 'Pip gives you 20 gems.',
    scared: {
      night: 'Something walked past the fence last night. Maren says wind. Wind doesn\'t have feet.',
      day: 'The thorns came closer again. Maren says they can\'t get in. She says it very fast.',
    },
    where: 'She\'s in a jar at my old house by [place]Glimmer Lake[/]: south over the bridge, the lake\'s east shore.',
    ask: {
      gone: 'Everyone\'s away, and Button\'s away. I don\'t like anybody being away.',
      night: 'Button hates the dark. She\'s out there alone, and it\'s very dark tonight.',
      day: 'You have a sword now. Could you fetch Button? Jars break if you hit them. She won\'t mind.',
    },
  },
  doll: {
    met: '[gear]Button[/]. Patched, one button eye, dry. Pip is waiting in Thistledown.',
    unmet: '[gear]Stuffed doll[/]. Patched, one button eye, dry. Someone in Thistledown must miss her.',
  },
  door: {
    locked: 'The door is locked.',
    millLocked: 'Locked. Tobin keeps the key.',
  },
  bed: {
    prompt: (when: string) => `Tobin's bed.\nSleep until ${when}?`,
    choices: ['Sleep', 'Not now'] as [string, string],
    woke: (when: string) => `You wake in the ${when}, rested.`,
  },
  odo: {
    who: 'Odo the Peddler',
    suits: {
      night: 'Slate in lamplight. Very mysterious. Stay safe.',
      day: 'It suits you! Slate looks well on a hero.',
    },
    greetArmed: 'A blade and no armor! Gems for goods, friend.',
    greet: 'Gems for goods, friend. I carry what the valley forgot it needs.',
    meet: 'So this is Wren. I stopped one night, and now the road is thorns and nobody opens the gate. Forgive me if I don\'t sleep.',
    tunicWare: 'Stoneward Tunic',
    tunicPitch: 'A [gear]Stoneward Tunic[/], woven with grit from the shrine quarry. Statues and shells hit half as hard. 50 gems.',
    flaskPitch: (price: number) => `Dry flask. ${price} gems a fill: [gear]Life[/] heals fully, [gear]Attack[/] doubles your sword's bite for 30 s.`,
    declined: 'Take your time. Stalls don\'t walk.',
    short: (price: number, gems: number) => `${price} gems, friend, and you have ${gems}. The bushes by the fence grow back.`,
    filled: (name: string) => `[gear]${name}[/] in your flask.`,
    lifeFill: 'Red as a sunset. Don\'t wait for your last heart.',
    attackFill: 'It fizzes. Save it for something stony.',
    tunicGot: '[gear]Stoneward Tunic[/]. Stone hits do half damage. Slate-blue.',
    tunicThanks: 'Wear it well!',
  },
  stall: {
    done: 'Odo\'s stall, unminded. The cashbox waits for him.',
    offer: 'Odo\'s stall. Leave the gems in his cashbox.',
    short: (price: number, gems: number) => `${price} gems, and you have ${gems}. Odo wouldn't mind. You would.`,
    filled: (name: string, price: number) => `You fill your flask with [gear]${name}[/] and leave ${price} gems.`,
    tunic: 'You leave 50 gems and take the [gear]Stoneward Tunic[/]. Stone hits do half damage.',
  },
};

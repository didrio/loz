// The keepers' bells (docs/bells.md): the empty post, hanging the first bell (nothing
// answers), and with two hung, the travel menu there and back (Stay goes nowhere).
export const fixture = 'field-sword';

export default async function run(t) {
  const { wait, game, until, press, finishScript, teleport, continueGame, step, check } = t;
  await continueGame();
  await wait(1500);
  /** Stands Wren on a bell post's interact spot (indoors, `fromY` just above the floor). */
  const toPost = async (id, fromY) => {
    const p = await game((id) => window.embervale.area.interactables.find((i) => i.id === id), id);
    await teleport(p.x, p.z, 0, fromY);
  };
  const dialogText = () => game(() => document.querySelector('.dialog-text').textContent);
  const menu = () => game(() => {
    const m = document.querySelector('.gmenu');
    return m.classList.contains('hidden') ? null : {
      title: m.querySelector('.gmenu-title').textContent,
      rows: [...m.querySelectorAll('.gmenu-row span:first-child')].map((r) => r.textContent),
    };
  });
  const menuOpen = () => until(() => !document.querySelector('.gmenu').classList.contains('hidden'), 15000);

  await step('the empty post on the square asks what goes there, and names its bell', async () => {
    await toPost('bellPost.morrow');
    await press('KeyE');
    // The text types itself out: wait for the end of the page.
    await until(() => document.querySelector('.dialog-text').textContent.includes('MORROW'), 10000).catch(() => {});
    const text = await dialogText();
    await finishScript();
    check(text.includes('Does something go here?') && text.includes('MORROW'), `said: ${text}`);
  });

  await step('carrying the Morrowbell, Wren hangs it: it rings, and nothing answers', async () => {
    await game(() => window.embervale.state.bells.carried.add('morrow'));
    await press('KeyE');
    await until(() => window.embervale.mode === 'cutscene', 5000);
    await until(() => window.embervale.area.bellPosts.get('morrow').hung, 10000);
    await finishScript();
    const r = await game(() => ({ hung: [...window.embervale.state.bells.hung], carried: [...window.embervale.state.bells.carried], area: window.embervale.area.id }));
    check(r.hung.join() === 'morrow' && !r.carried.length, `hung ${r.hung}, carried ${r.carried}`);
    check(r.area === 'overworld', `went to ${r.area}`);
  });

  await step('with the Lullbell hung too, ringing offers the Hall of Sleepers; choosing it goes there, hearts unchanged', async () => {
    const hp = await game(() => {
      const g = window.embervale;
      g.state.bells.hung.add('lull');
      g.state.hp = 3;
      return g.state.hp;
    });
    await press('KeyE');
    await menuOpen();
    const m = await menu();
    check(m.title === 'Follow the answer' && m.rows.join('|') === 'Hall of Sleepers|Stay', `menu ${JSON.stringify(m)}`);
    await press('Enter');
    await until(() => window.embervale.area.id === 'shrine', 20000);
    await finishScript();
    const r = await game(() => {
      const g = window.embervale;
      const e = g.area.entrances.lullPost;
      return { d: Math.hypot(g.player.pos.x - e.x, g.player.pos.z - e.z), hp: g.state.hp };
    });
    check(r.d < 1.5, `arrived ${r.d.toFixed(2)} m from the post's spot`);
    check(r.hp === hp, `hp ${r.hp}, was ${hp}`);
  });

  await step('at the Lullbell, Stay goes nowhere; the next ring goes home to Thistledown', async () => {
    await toPost('lullPost', 2);
    await press('KeyE');
    await menuOpen();
    const m = await menu();
    check(m.rows.join('|') === 'Thistledown|Stay', `menu ${JSON.stringify(m)}`);
    await press('ArrowDown');
    await press('Enter');
    await finishScript();
    check(await game(() => window.embervale.area.id === 'shrine'), 'Stay left the shrine');
    await press('KeyE');
    await menuOpen();
    await press('Enter');
    await until(() => window.embervale.area.id === 'overworld', 20000);
    await finishScript();
    const d = await game(() => {
      const g = window.embervale;
      const e = g.area.entrances['bell.morrow'];
      return Math.hypot(g.player.pos.x - e.x, g.player.pos.z - e.z);
    });
    check(d < 1.5, `arrived ${d.toFixed(2)} m from the Morrowbell's spot`);
  });
  await step('after Gravelheart falls the village bell is off its post: the Lullbell rings alone, the bell lies behind the mill, and hanging it restores the menu', async () => {
    await game(() => {
      const g = window.embervale;
      g.state.bells.hung.add('morrow');
      g.state.bells.hung.add('lull');
      g.state.bells.carried.clear();
      g.state.set('village.bellMoved');
      g.state.bells.hung.delete('morrow');
      g.loadArea('shrine');
    });
    await until(() => window.embervale.area.id === 'shrine', 20000);
    await finishScript();
    await toPost('lullPost', 2);
    await press('KeyE');
    await finishScript();
    const text = await dialogText();
    check(text.includes('nothing answers'), `lone Lullbell said: ${text}`);
    check(await game(() => document.querySelector('.gmenu').classList.contains('hidden')), 'a travel menu opened');
    await game(() => window.embervale.loadArea('overworld'));
    await until(() => window.embervale.area.id === 'overworld', 20000);
    await finishScript();
    check(await game(() => window.embervale.area.morrowLost.present && !window.embervale.area.morrowPost.hung), 'the bell is not lying behind the mill, or the post still shows it hung');
    await toPost('bellPickup.morrowLost');
    await press('KeyE');
    await finishScript();
    check(await game(() => window.embervale.state.bells.carried.has('morrow')), 'taking the bell did not carry it');
    await toPost('bellPost.morrow');
    await wait(700);
    await press('KeyE');
    // Hanging it wakes the network again: the answer and a tutorial line (Enter turns the pages), then the menu.
    let m = null;
    for (let i = 0; i < 60 && !m; i++) {
      await wait(500);
      m = await menu();
      if (!m) await press('Enter', 1, 200);
    }
    check(m !== null, 'no travel menu after rehanging');
    check(m.rows.join('|') === 'Hall of Sleepers|Stay', `menu after rehanging ${JSON.stringify(m)}`);
  });
}

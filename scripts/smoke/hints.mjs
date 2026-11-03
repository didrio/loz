// The pause menu (P) and the keepers' notes: an empty notes page, M for music, lock-on holds a
// Murmurbud, mashing overloads it, a strike-and-rest rhythm opens it, its floating note is read (E)
// and kept, and read again in the pause menu.
export const fixture = 'field-sword';

export default async function run(t) {
  const { wait, game, until, press, state, teleport, finishScript, continueGame, step, check, shot, page } = t;
  await continueGame();
  await until(() => window.embervale.mode === 'play');
  await game(() => (window.embervale.state.hours = 10));
  await wait(800);
  const menu = () => game(() => ({ open: window.embervale.pauseMenu.isOpen, text: document.querySelector('.gmenu')?.textContent ?? '' }));

  await step('P pauses with an empty notes page; P closes it', async () => {
    await press('KeyP');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    const hours = await game(() => window.embervale.state.hours);
    await wait(1000);
    check((await game(() => window.embervale.state.hours)) === hours, 'the clock ran while paused');
    const m = await menu();
    check(/No notes yet/.test(m.text), `empty page text: ${m.text}`);
    await press('ArrowDown');
    await press('Enter'); // nothing to choose: stays open
    check((await menu()).open, 'Enter on an empty page closed it');
    await press('KeyP');
    await until(() => !window.embervale.pauseMenu.isOpen, 5000);
  });

  await step('M toggles the music', async () => {
    const before = await game(() => window.embervale.sfx.musicOn);
    await press('KeyM');
    await until((before) => window.embervale.sfx.musicOn === !before, 5000, before).catch(() => {});
    check((await game(() => window.embervale.sfx.musicOn)) === !before, 'M did not toggle the music');
    await press('KeyM');
  });

  const bud = await game(() => {
    const b = window.embervale.area.buds.get('bud.tunic');
    return { x: b.x, z: b.z };
  });
  const rule = () => game(() => {
    const r = window.embervale.buds.rule('bud.tunic');
    return { gauge: r.gauge, growth: r.growth, sulk: r.sulk, opened: r.opened };
  });

  await step('mashing the sword on a Murmurbud overloads it', async () => {
    await teleport(bud.x + 1.8, bud.z, -Math.PI / 2);
    await wait(300);
    await press('KeyQ');
    check(await game(() => window.embervale.combat.lock === window.embervale.area.buds.get('bud.tunic')), 'lock-on did not pick the bud');
    // Headless game time runs slow: mash until it overloads (~2 s of game time), not a fixed count.
    let overloaded = false;
    const end = Date.now() + 30000;
    while (!overloaded && Date.now() < end) {
      await press('KeyJ', 4, 40);
      overloaded = (await rule()).sulk > 0;
    }
    check(overloaded, `never overloaded: ${JSON.stringify(await rule())}`);
    check((await rule()).growth === 0, 'growth should reset on overload');
    check(await game(() => document.querySelector('.bud-gauge').classList.contains('overloaded')), 'gauge not red');
    await shot('hints-01-overload');
  });

  await step('a strike-and-rest rhythm opens it; its floating note is read with E and kept', async () => {
    await until(() => window.embervale.buds.rule('bud.tunic').sulk === 0, 5000);
    const end = Date.now() + 20000;
    while (!(await rule()).opened && Date.now() < end) {
      const r = await rule();
      if (r.gauge < 0.7) await press('KeyJ', 1, 380);
      else await wait(120);
      if (r.gauge > 0.45) await shot('hints-02-growing');
    }
    check((await rule()).opened, `never opened: ${JSON.stringify(await rule())}`);
    await wait(500);
    check((await state()).mode === 'play' && !(await state()).flags.includes('hint.tunic'), 'opening alone should not read the note');
    check(await game(() => window.embervale.combat.lock === null), 'lock-on should let go of an opened bud');
    await shot('hints-03-open');
    await until(() => document.querySelector('.prompt')?.textContent?.includes('Read'), 5000);
    await press('KeyE');
    await until(() => window.embervale.mode === 'cutscene', 5000);
    await finishScript();
    check(await game(() => window.embervale.area.buds.get('bud.tunic').taken), 'the note should be gone once read');
    check((await state()).flags.includes('hint.tunic'), 'hint.tunic not set');
  });

  await step('the pause menu lists the note and reads it', async () => {
    await press('KeyP');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    check(/The Stoneward tunic/.test((await menu()).text), 'note missing from the list');
    await press('Enter');
    check(/Stoneward/.test((await menu()).text), 'note text not shown');
    await shot('hints-04-note');
    await press('Backspace');
    check(/The Stoneward tunic/.test((await menu()).text) && (await menu()).open, 'Backspace should go back to the list');
    await page.keyboard.press('KeyP');
    await until(() => !window.embervale.pauseMenu.isOpen, 5000);
  });
}

// The pause menu (P): a Settings tab (and Gear) at first, a slider changing and saving a setting, and the keepers' notes: lock-on holds a
// Murmurbud, mashing overloads it, a strike-and-rest rhythm opens it, its floating note is read (E)
// and kept, and read again under the pause menu's Hints tab; a read sigil adds a Messages tab.
export const fixture = 'field-sword';

export default async function run(t) {
  const { wait, game, until, press, state, teleport, finishScript, continueGame, step, check, shot, page } = t;
  await continueGame();
  await until(() => window.embervale.mode === 'play');
  await game(() => (window.embervale.state.hours = 10));
  await wait(800);
  /** Presses E until the named tab is the active one. */
  const goTab = async (name) => {
    for (let i = 0; i < 5; i++) {
      if ((await game(() => document.querySelector('.gmenu-tab.active')?.textContent)) === name) return;
      await press('KeyE');
    }
    check(false, `no ${name} tab`);
  };
  const menu = () => game(() => ({ open: window.embervale.pauseMenu.isOpen, text: document.querySelector('.gmenu')?.textContent ?? '' }));

  await step('P pauses on the Settings tab (no Hints or Messages yet); a slider changes and saves; P closes it', async () => {
    await press('KeyP');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    const hours = await game(() => window.embervale.state.hours);
    await wait(1000);
    check((await game(() => window.embervale.state.hours)) === hours, 'the clock ran while paused');
    const m = await menu();
    check(/Settings/.test(m.text) && /Master volume/.test(m.text) && !/Hints|Messages/.test(m.text), `menu text: ${m.text}`);
    const before = await game(() => window.embervale.settings.masterVolume);
    await press('ArrowLeft');
    const after = await game(() => window.embervale.settings.masterVolume);
    check(after < before, `left should lower the master volume (${before} -> ${after})`);
    check(JSON.parse(await game(() => localStorage.getItem('embervale:settings'))).masterVolume === after, 'setting not saved');
    const live = await game(() => [...document.querySelectorAll('.gmenu .reset:not(.off):not(.none)')].map((r) => r.closest('.gmenu-row').textContent));
    check(live.some((t) => t.includes('Master volume')), `the changed row's reset button should be live: ${JSON.stringify(live)}`);
    await press('KeyR'); // the reset key puts it back to the default
    check((await game(() => window.embervale.settings.masterVolume)) === before, 'R should reset the master volume');
    await press('KeyE'); // on to the Gear tab
    check((await menu()).open && (await game(() => document.querySelector('.gmenu-tab.active')?.textContent)) === 'Gear', 'E should go to the Gear tab');
    await press('KeyE'); // no Dev tab: back round to Settings
    check((await menu()).open && !/Dev sprint/.test((await menu()).text) && (await game(() => document.querySelector('.gmenu-tab.active')?.textContent)) === 'Settings', 'E should wrap to Settings (the dev tools are not a tab)');
    // Display shows all three options in a capsule, and the on/off rows are switches with no text.
    const controls = await game(() => ({ opts: document.querySelectorAll('.gmenu .seg-opt').length, on: document.querySelector('.gmenu .seg-opt.on')?.textContent, switches: document.querySelectorAll('.gmenu .sw').length, onoff: /\b(ON|OFF)\b/.test(document.querySelector('.gmenu')?.textContent ?? '') }));
    check(controls.opts === 3 && controls.switches >= 2 && !controls.onoff, `controls: ${JSON.stringify(controls)}`);
    await shot('hints-00-settings');
    await press('KeyP');
    await until(() => !window.embervale.pauseMenu.isOpen, 5000);
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

  await step('the Hints tab lists the note and shows its text', async () => {
    await press('KeyP');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    check(/Hints/.test((await menu()).text) && !/Messages/.test((await menu()).text), 'Hints tab missing, or Messages shown early');
    await goTab('Hints');
    check(/The Stoneward tunic/.test((await menu()).text), 'note missing from the list');
    check(/Stoneward/.test(await game(() => document.querySelector('.gmenu-detail-text')?.textContent ?? '')), 'note text not shown');
    await shot('hints-04-note');
    await press('Backspace'); // closes
    await until(() => !window.embervale.pauseMenu.isOpen, 5000);
  });

  await step('a sigil that was read adds a Messages tab', async () => {
    await game(() => window.embervale.state.set('sigil.cell'));
    await press('KeyP');
    await until(() => window.embervale.pauseMenu.isOpen, 5000);
    check(/Messages/.test((await menu()).text), 'Messages tab missing once a sigil is read');
    check(/Hints/.test(await game(() => document.querySelector('.gmenu-tab.active')?.textContent)), 'the menu should reopen on the Hints tab');
    await goTab('Messages');
    check(/Over the pass/.test((await menu()).text), 'sigil missing from Messages');
    check(/sent me over the pass/.test(await game(() => document.querySelector('.gmenu-detail-text')?.textContent ?? '')), 'sigil text not shown');
    await press('KeyP');
    await until(() => !window.embervale.pauseMenu.isOpen, 5000);
  });
}

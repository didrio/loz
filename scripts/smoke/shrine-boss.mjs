// The end of the Waking Shrine's boss (shrine session D1): the fight starts when Wren walks into the
// Hearth; its defeat (sent with a direct kill: the fight's moves are unit-tested) puts the ember out,
// raises the causeway, opens the hidden door and shows the Heart Vessel; the seal-stone's vision breaks
// the gate in the valley and returns to the seal room.
export const fixture = 'shrine-boss';

export default async function run(t) {
  const { wait, game, until, shot, press, page, finishScript, teleport, continueGame, step, check } = t;
  await continueGame();

  const room = (id) => game((id) => window.embervale.area.def.rooms.find((r) => r.id === id), id);
  const floorY = (r) => r.floor * 8;

  await step('walking into the Hearth wakes Gravelheart (its theme, its health bar)', async () => {
    await game(() => window.embervale.area.doors.get('bossDoor').setOpen());
    const trig = await game(() => window.embervale.area.triggers.find((t) => t.id === 'trigger.warden'));
    const hearth = await room('boss');
    await teleport(trig.x, trig.z, 0, floorY(hearth) + 2);
    await until(() => window.embervale.mode === 'cutscene', 30000);
    await until(() => window.embervale.mode === 'play' && !!window.embervale.activeBoss, 60000);
    await until(() => !!document.querySelector('.boss-bar') && getComputedStyle(document.querySelector('.boss-bar')).display !== 'none', 15000).catch(() => {});
    check(await page.isVisible('.boss-bar'), 'no boss health bar');
    check(await game(() => window.embervale.activeBoss.music === 'warden'), 'not its own theme');
    check(await game(() => window.embervale.area.hearth.sealed), 'the door did not seal');
    await shot('01-fight');
  });

  await step('beating it: the ember rises, the door and ring open, a Heart Vessel appears, the north wall opens', async () => {
    await game(() => {
      const b = window.embervale.activeBoss;
      window.embervale.player.invuln = 1e6;
      b.hp = 0;
      b.die();
      b.asleep = true;
    });
    await until(() => window.embervale.mode === 'cutscene', 15000);
    await until(() => window.embervale.area.hearth.cleared, 60000);
    await shot('02-ember-gone');
    await finishScript(90000); // the dialog after the ember needs Enter; the causeway and door follow
    await shot('03-causeway');
    const g = await game(() => {
      const e = window.embervale;
      const p = e.state.dungeon('shrine');
      return { done: p.done, cleared: p.cleared.has('boss'), seal: p.doors.has('sealDoor'), open: e.area.doors.get('sealDoor').open, vessel: e.area.hearth.vessel.visible, boss: !!e.activeBoss };
    });
    check(g.done && g.cleared, 'the win was not recorded');
    check(g.seal && g.open, 'the hidden door did not open');
    check(g.vessel, 'no Heart Vessel');
    check(!g.boss, 'the boss is still active');
  });

  await step('the Heart Vessel adds a heart', async () => {
    const v = await game(() => ({ x: window.embervale.area.hearth.vessel.x, z: window.embervale.area.hearth.vessel.z }));
    const hearth = await room('boss');
    await game(() => (window.embervale.player.invuln = 0));
    await teleport(v.x, v.z - 0.3, 0, floorY(hearth) + 2);
    await until(() => window.embervale.state.has('gravelheartVessel'), 20000);
    await finishScript();
    check(await game(() => window.embervale.state.maxHp === 10), 'max hearts did not grow');
  });

  await step('the causeway leads across the north pit to the Keepers\' Seal', async () => {
    const hearth = await room('boss');
    const d = await game(() => window.embervale.area.hearth.sealDoor);
    await teleport(d.x, hearth.z + 8, Math.PI, floorY(hearth) + 2);
    await page.keyboard.down('KeyW');
    await until(() => window.embervale.area.roomAt(window.embervale.player.pos)?.id === 'sealRoom', 25000).catch(() => {});
    await page.keyboard.up('KeyW');
    check(await game(() => window.embervale.area.roomAt(window.embervale.player.pos)?.id === 'sealRoom'), 'never reached the seal room');
    await shot('04-seal-room');
  });

  await step('the prism: four sword hits shatter it, the vision breaks the gate, then Wren is back in the seal room', async () => {
    const c = await game(() => window.embervale.area.switches.get('sealStone').group.position);
    const seal = await room('sealRoom');
    await teleport(c.x, c.z + 1.9, Math.PI, floorY(seal) + 2);
    await wait(500);
    // One hit isn't enough: it takes four (the swings are spaced past the prism's hit cooldown).
    await press('KeyJ', 1, 300);
    await wait(700);
    check(await game(() => window.embervale.mode === 'play' && window.embervale.area.switches.get('sealStone').prism.hits === 1), 'one hit should only crack the prism');
    await press('KeyJ', 3, 700);
    // The first line of the vision is a dialog: confirm it, then the view cuts to the gate.
    await until(() => window.embervale.mode === 'cutscene', 15000);
    const end = Date.now() + 30000;
    while ((await game(() => window.embervale.area.id)) !== 'overworld' && Date.now() < end) await press('Enter', 1, 250);
    await until(() => window.embervale.area.gate.isOpen, 30000);
    await wait(1200);
    await shot('05-gate-breaking');
    await until(() => window.embervale.area.id === 'shrine' && window.embervale.mode === 'play', 60000).catch(() => {});
    await finishScript(60000);
    const g = await game(() => {
      const e = window.embervale;
      return { area: e.area.id, open: e.state.has('valleyOpen'), pressed: e.state.dungeon('shrine').switches.has('sealStone'), room: e.area.roomAt(e.player.pos)?.id };
    });
    check(g.area === 'shrine' && g.room === 'sealRoom', `came back to ${g.area}/${g.room}`);
    check(g.open && g.pressed, 'the seal was not recorded');
    await shot('06-back');
  });
}

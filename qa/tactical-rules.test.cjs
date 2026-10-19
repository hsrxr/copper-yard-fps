/* Fixed tactical guns and real aim state. */
const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/combat.js');
require('../src/player.js');
const r = globalThis.FPSRules;
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const tactical = () => r.createState('standard', 'tactical');
const stationary = { ads: true, speed: 0, grounded: true, sprinting: false };
function handling(state, dt, input = stationary) { return r.tickHandling(state, dt, input); }
function fire(state) { assert.equal(r.tryFire(state), true); return r.shotKick(state); }

test('tactical kills keep damaged health, fixed guns and inventories across old upgrade boundaries', () => {
  const s = tactical(); s.hp = 31; s.ammo = 5;
  const primary = s.loadout.primary.weapon, secondary = s.loadout.secondary.weapon;
  for (let i = 0; i < 30; i++) assert.equal(r.registerKill(s, 'rifle', i === 0 ? 'head' : 'upper').upgraded, false);
  assert.equal(s.tactical, true); assert.equal(s.level, 1); assert.equal(s.hp, 31);
  assert.equal(s.kills, 30); assert.equal(s.headshots, 1); assert.equal(s.score, 4880);
  assert.equal(s.weapon, primary); assert.equal(s.loadout.secondary.weapon, secondary);
  assert.equal(s.ammo, 5); assert.ok(s.reserve >= 120); assert.ok(s.loadout.secondary.reserve >= 40);
});

test('tactical rifle and pistol deliver fixed body/head lethality with independent magazine cadence', () => {
  const s = tactical(), rifle = s.weapon;
  assert.equal(rifle.damage * r.zoneMultiplier('upper', rifle), 40);
  assert.equal(rifle.damage * r.zoneMultiplier('head', rifle), 120);
  assert.equal(Math.ceil(80 / rifle.damage), 2); assert.equal(Math.ceil(100 / rifle.damage), 3);
  assert.equal(s.ammo, 20); assert.equal(rifle.automatic, true);
  assert.equal(r.tryFire(s), true); r.tick(s, .124); assert.equal(r.tryFire(s), false);
  r.tick(s, .001); assert.equal(r.tryFire(s), true); assert.equal(s.ammo, 18);
  assert.equal(r.switchWeapon(s, 'secondary'), true); r.tick(s, .22);
  const pistol = s.weapon;
  assert.equal(pistol.damage * r.zoneMultiplier('upper', pistol), 50);
  assert.equal(pistol.damage * r.zoneMultiplier('head', pistol), 100);
  assert.equal(Math.ceil(100 / pistol.damage), 2); assert.equal(pistol.automatic, false); assert.equal(s.ammo, 8);
  assert.equal(r.tryFire(s), true); r.tick(s, .249); assert.equal(r.tryFire(s), false);
  r.tick(s, .001); assert.equal(r.tryFire(s), true); assert.equal(s.ammo, 6); assert.equal(s.loadout.primary.ammo, 18);
});

test('tactical death loot never rolls random drops or heals the player', () => {
  const s = r.createState('hard', 'tactical'); s.hp = 20; s.healthDropMisses = 6;
  let samples = 0;
  for (const type of ['scout', 'rifle', 'heavy']) assert.deepEqual(r.lootForKill(s, type, () => { samples++; return 0; }), { ammo: 0, health: 0 });
  assert.equal(samples, 0); assert.equal(s.hp, 20); assert.equal(s.healthDropMisses, 6);
});

test('rifle accuracy reaches ADS readiness at .18 seconds and pistol at .12 seconds', () => {
  const s = tactical(); assert.equal(typeof r.tickHandling, 'function');
  handling(s, .09); close(r.accuracy(s).adsBlend, .5);
  const halfway = r.accuracy(s).spread;
  handling(s, .089); assert.ok(r.accuracy(s).adsBlend < 1);
  handling(s, .001); close(r.accuracy(s).adsBlend, 1); assert.ok(r.accuracy(s).spread < halfway / 2);
  r.switchWeapon(s, 'secondary'); assert.equal(r.accuracy(s).adsBlend, 0);
  handling(s, .3); assert.equal(r.accuracy(s).adsBlend, 0, 'switching cannot secretly prepare ADS');
  r.tick(s, .22); handling(s, .06); close(r.accuracy(s).adsBlend, .5);
  handling(s, .06); close(r.accuracy(s).adsBlend, 1);
});

test('grounded deadzone speed restores precision immediately while air and sprint remain inaccurate', () => {
  const s = tactical(); assert.equal(typeof r.accuracy, 'function');
  handling(s, .2); const rested = r.accuracy(s).spread; assert.equal(r.accuracy(s).stable, true);
  handling(s, .01, { ...stationary, speed: 5.8 }); assert.equal(r.accuracy(s).stable, false); close(r.accuracy(s).spread, rested + .02);
  handling(s, .001, { ...stationary, speed: .58 }); assert.equal(r.accuracy(s).stable, true); close(r.accuracy(s).spread, rested);
  handling(s, .001, { ...stationary, speed: .581 }); assert.equal(r.accuracy(s).stable, false); assert.ok(r.accuracy(s).spread > rested);
  handling(s, .001); assert.equal(r.accuracy(s).stable, true); close(r.accuracy(s).spread, rested);
  handling(s, .1, { ...stationary, grounded: false }); assert.equal(r.accuracy(s).stable, false);
  handling(s, .001); assert.equal(r.accuracy(s).stable, true);
  handling(s, .2, { ...stationary, sprinting: true }); assert.equal(r.accuracy(s).adsBlend, 0); assert.equal(r.accuracy(s).stable, false);
  assert.equal(r.tryFire(s), false, 'sprint cannot fire a stable aimed shot');
});

test('accepted shots have repeatable directional recoil; pauses restore first-shot control', () => {
  assert.equal(typeof r.shotKick, 'function');
  const a = tactical(), b = tactical(); handling(a, .2); handling(b, .2);
  const cleanSpread = r.accuracy(a).spread, kicks = [];
  for (let i = 0; i < 5; i++) {
    const kick = fire(a); kicks.push(kick); assert.deepEqual(kick, fire(b));
    assert.ok(kick.pitch > 0); assert.ok(Number.isFinite(kick.yaw));
    assert.deepEqual(r.shotKick(a), { pitch: 0, yaw: 0 }, 'consuming a kick twice must not move the aim twice');
    r.tick(a, .125); r.tick(b, .125); handling(a, .125); handling(b, .125);
  }
  assert.ok(kicks[4].pitch > kicks[0].pitch, 'long bursts require more control than their first shot');
  assert.ok(r.accuracy(a).spread > cleanSpread);
  handling(a, 1); r.tick(a, 1); close(r.accuracy(a).spread, cleanSpread, 1e-6);
  assert.deepEqual(fire(a), kicks[0]);
});

test('recoil recovery supplies additive aim deltas without repeating them on invalid time', () => {
  const s = tactical(); assert.equal(typeof r.shotKick, 'function'); handling(s, .2);
  const kick = fire(s); let pitch = kick.pitch, yaw = kick.yaw;
  for (let i = 0; i < 100; i++) { handling(s, .02); pitch += s.handling.recovery.pitch; yaw += s.handling.recovery.yaw; }
  close(pitch, 0, 1e-7); close(yaw, 0, 1e-7);
  handling(s, NaN); assert.deepEqual(s.handling.recovery, { pitch: 0, yaw: 0 });
  handling(s, -1); assert.deepEqual(s.handling.recovery, { pitch: 0, yaw: 0 });
});

test('handling elapsed-time partition preserves aim readiness, spread and recoil recovery', () => {
  assert.equal(typeof r.tickHandling, 'function');
  const a = tactical(), b = tactical(); handling(a, .18); for (let i = 0; i < 18; i++) handling(b, .01);
  close(r.accuracy(a).adsBlend, r.accuracy(b).adsBlend); close(r.accuracy(a).spread, r.accuracy(b).spread);
  const ka = fire(a), kb = fire(b); let pa = ka.pitch, pb = kb.pitch;
  handling(a, .5); pa += a.handling.recovery.pitch;
  for (let i = 0; i < 50; i++) { handling(b, .01); pb += b.handling.recovery.pitch; }
  close(pa, pb); close(r.accuracy(a).spread, r.accuracy(b).spread);
});

test('switch delays follow the incoming gun and cancel reloads without clearing other cooldowns', () => {
  const s = tactical(); s.ammo = 4; s.reserve = 19; s.fireCooldown = 1;
  assert.equal(r.startReload(s), true); r.tick(s, .1);
  assert.equal(r.switchWeapon(s, 'secondary'), true); assert.equal(s.reloadLeft, 0);
  r.tick(s, .219); assert.equal(r.tryFire(s), false); r.tick(s, .001); assert.equal(r.tryFire(s), true);
  assert.equal(r.switchWeapon(s, 'primary'), true); r.tick(s, .379); assert.equal(r.tryFire(s), false);
  r.tick(s, .001); assert.equal(r.tryFire(s), false, 'rifle original cooldown outlasts draw animation');
  assert.equal(s.ammo, 4); assert.equal(s.reserve, 19); r.tick(s, .3); assert.equal(r.tryFire(s), true);
  assert.equal(s.ammo, 3); assert.equal(s.loadout.secondary.ammo, 7);
});

test('empty reload takes longer and transfers only existing rounds at completion', () => {
  const a = tactical(), b = tactical(); a.ammo = 1; b.ammo = 0; b.reserve = 3;
  r.startReload(a); r.startReload(b); assert.ok(b.reloadLeft > a.reloadLeft);
  assert.equal(b.reloadLeft, b.weapon.emptyReloadTime);
  r.tick(b, b.weapon.reloadTime); assert.equal(b.ammo, 0); assert.equal(b.reserve, 3);
  r.tick(b, b.weapon.emptyReloadTime); assert.equal(b.ammo, 3); assert.equal(b.reserve, 0);
  r.tick(b, 10); assert.equal(b.ammo, 3);
});

test('player reports displacement speed so pressing into cover does not fake movement', () => {
  const flat = { size: 640, water: -10, height: () => 0, slope: () => 0 };
  const p = new FPSPlayer(flat, [{ x: 0, z: -3, y: 0, r: .6, height: 9 }]); p.reset(0, 0);
  for (let i = 0; i < 180; i++) p.update(1 / 60, { forward: 1, sprint: true });
  close(p.speed, 0); assert.equal(p.sprinting, true);
  p.reset(0, 0); close(p.speed, 0); assert.equal(p.sprinting, false);
  const before = { ...p.position }; p.update(.02, { right: 1 });
  close(p.speed, Math.hypot(p.position.x - before.x, p.position.z - before.z) / .02);
});

test('held rifle maintains 480 RPM within one round at 25, 30, 60 and 120 Hz', () => {
  const results = [];
  for (const hz of [25, 30, 60, 120]) {
    const s = tactical(); let shots = 0;
    for (let frame = 0; frame < hz * 2; frame++) {
      r.tick(s, 1 / hz, { firing: true });
      if (r.tryFire(s)) shots++;
    }
    results.push(shots);
    assert.ok(Math.abs(shots - 16) <= 1, `${hz} Hz fired ${shots}, expected 16 in two seconds`);
  }
  assert.ok(Math.max(...results) - Math.min(...results) <= 1, `frame partitions diverged: ${results}`);
});

test('continuous fire carries boundary overshoot but idle cannot bank a shortened next cooldown', () => {
  const s = tactical(); r.tryFire(s);
  for (let frame = 0; frame < 4; frame++) r.tick(s, .04, { firing: true });
  assert.equal(r.tryFire(s), true);
  close(s.fireCooldown, .09, 1e-8);
  r.tick(s, 20, { firing: false });
  r.tick(s, .04, { firing: true }); assert.equal(r.tryFire(s), true);
  close(s.fireCooldown, .125);
  assert.equal(r.tryFire(s), false, 'idle cannot stockpile simultaneous shots');
  r.tick(s, .1); assert.equal(r.tryFire(s), false);
  r.tick(s, .025); assert.equal(r.tryFire(s), true);
});

test('interrupt cancels pending reload and ADS while preserving ammo and positive weapon cooldowns', () => {
  const s = tactical(); assert.equal(typeof r.interrupt, 'function'); handling(s, .2);
  r.tryFire(s); s.ammo = 0; s.reserve = 7; assert.equal(r.startReload(s), true);
  assert.equal(s.reloadDuration, 2); r.tick(s, .5);
  s.loadout.secondary.fireCooldown = .2;
  r.interrupt(s);
  assert.equal(s.reloadLeft, 0); assert.equal(s.reloadDuration, 0);
  assert.equal(r.accuracy(s).adsBlend, 0); assert.deepEqual(r.shotKick(s), { pitch: 0, yaw: 0 });
  close(s.loadout.secondary.fireCooldown, .2);
  r.tick(s, 10); assert.equal(s.ammo, 0); assert.equal(s.reserve, 7);
  assert.equal(r.startReload(s), true); assert.equal(s.reloadDuration, 2);
});

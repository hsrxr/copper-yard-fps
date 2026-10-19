/* Tactical behavior against the real vendored renderer math and game module. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const file of ['vendor/three-r160.min.js', 'src/combat.js', 'src/random.js', 'src/enemies.js']) {
  let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  if (file.startsWith('vendor/')) source = '(function () { var exports, module, define;\n' + source + '\n}).call(globalThis);';
  vm.runInThisContext(source, { filename: file });
}
const { THREE, createEnemies, FPSRules, seededRandom } = globalThis;
const world = { isArena: true, size: 200, water: -20, height: () => 0, slope: () => 0 };
function fixture(options = {}) {
  const events = { shots: [], hits: [], cues: [], kills: [] }, colliders = [];
  const f = { time: 0, events, colliders, player: { position: new THREE.Vector3(0, 1.7, 12), velocity: new THREE.Vector3(), alive: true } };
  f.squad = createEnemies({ THREE, world, tactical: true, rng: seededRandom,
    trace: options.trace || ((origin, dir, max) => FPSRules.traceWorld(origin, dir, max, world, colliders)),
    canStand: () => true,
    onEnemyCue: (position, kind) => { if (kind === 'prepare') events.cues.push({ time: f.time, position, kind }); },
    onEnemyShot: (origin, end, type, metadata) => events.shots.push({ time: f.time, origin, end, type, metadata }),
    onPlayerHit: (damage, origin) => events.hits.push({ time: f.time, damage, origin }),
    onKill: (e) => events.kills.push(e.id) });
  f.advance = (seconds, step = 1 / 120) => {
    const count = Math.round(seconds / step);
    for (let i = 0; i < count; i++) { f.time += step; f.squad.update(step, f.player); }
  };
  f.spawn = (points = [{ x: 0, z: 0, type: 'rifle', yaw: 0, role: 'guard' }]) => {
    assert.equal(typeof f.squad.spawnEncounter, 'function', 'authored encounters must be supported');
    return f.squad.spawnEncounter(points, f.player.position);
  };
  return f;
}

test('retry preplaces all authored defenders without proximity rerolls or threat HP growth', () => {
  const f = fixture();
  const points = Array.from({ length: 10 }, (_, i) => ({ x: -36 + i * 8, z: 0, type: i === 9 ? 'heavy' : 'rifle', yaw: .2, role: 'guard' }));
  assert.equal(f.spawn(points), 10);
  const before = f.squad.getTargets();
  f.squad.setThreat({ stage: 99, difficulty: 'hard' });
  assert.ok(f.squad.getTargets().every(e => e.maxHp >= 80 && e.maxHp <= 100 && e.damage === 35));
  f.advance(1); f.squad.reset(); f.player.position.set(-36, 1.7, 0);
  assert.equal(f.spawn(points), 10, 'preplaced enemies are not skipped near the player');
  assert.deepEqual(f.squad.getTargets().map(e => [e.id, e.position, e.yaw]), before.map(e => [e.id, e.position, e.yaw]));
});

test('invalid encounter fails atomically and cannot replace an active encounter', () => {
  const f = fixture();
  assert.equal(f.spawn([{ x: 0, z: 0, type: 'rifle' }, { x: NaN, z: 9, type: 'heavy' }]), 0);
  assert.equal(f.squad.stats().alive, 0);
  assert.equal(f.spawn(), 1); assert.equal(f.spawn(), 0);
  assert.equal(f.squad.stats().alive, 1);
});

test('a visible and audible tell precedes three lethal rounds, then recovery', () => {
  const f = fixture(); f.spawn(); f.advance(.1);
  assert.equal(f.squad.getTargets()[0].attackPhase, 'tell');
  assert.equal(f.events.cues.length, 1); assert.equal(f.events.cues[0].kind, 'prepare');
  const flash = f.squad.group.children.find(m => m.name === 'Enemy muzzle flashes'), matrix = new THREE.Matrix4();
  flash.getMatrixAt(0, matrix); assert.ok(matrix.elements[13] > 2, 'preparation has a visible overhead signal');
  f.advance(.4); assert.equal(f.events.shots.length, 0);
  f.advance(.65); assert.equal(f.events.shots.length, 3);
  const first = f.events.shots[0].time - f.events.cues[0].time;
  // Reactive revision intentionally shortens cold tells while keeping them visible.
  assert.ok(first >= .5 && first <= .69, `first warning lasted ${first}`);
  for (let i = 1; i < 3; i++) assert.ok(f.events.shots[i].time - f.events.shots[i - 1].time >= .14 && f.events.shots[i].time - f.events.shots[i - 1].time <= .18);
  assert.ok(f.events.hits.length >= 2, 'a stationary exposed player really takes the dangerous burst');
  assert.ok(f.events.hits.every(h => h.damage === 35));
  assert.equal(f.squad.getTargets()[0].attackPhase, 'recover');
  f.advance(.5); assert.equal(f.events.shots.length, 3, 'recovery is a usable retaliation window');
});

test('squad attack opportunities are limited to two and burst starts are staggered', () => {
  const f = fixture();
  f.spawn(Array.from({ length: 8 }, (_, i) => ({ x: (i - 3.5) * 2.5, z: 0, type: 'rifle', yaw: 0, role: 'guard' })));
  for (let i = 0; i < 720; i++) {
    f.advance(1 / 120);
    assert.ok(f.squad.getTargets().filter(e => e.attackPhase === 'tell' || e.attackPhase === 'burst').length <= 2);
  }
  assert.ok(f.events.shots.length >= 6);
  const burstStarts = f.events.shots.filter(shot => shot.metadata.burstStart);
  const starts = burstStarts.map(shot => shot.time).sort((a, b) => a - b);
  assert.ok(new Set(burstStarts.map(shot => shot.metadata.id)).size >= 3, 'waiting defenders eventually get an opportunity');
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= .18, 'different burst starts do not coincide');
});

test('hard defenders react and recover sooner while retaining full tells and honest damage', () => {
  const results = [];
  for (const difficulty of ['standard', 'hard']) {
    const f = fixture(); f.squad.setThreat({ difficulty }); f.spawn(); f.advance(4);
    assert.ok(f.events.cues.length >= 2 && f.events.shots.length >= 6);
    assert.ok(f.events.hits.every(h => h.damage === 35));
    results.push({ tell: f.events.shots[0].time - f.events.cues[0].time,
      recovery: f.events.cues[1].time - f.events.shots[2].time });
  }
  assert.ok(results[1].tell >= .44 && results[1].tell <= .57);
  assert.ok(results[0].tell > results[1].tell, 'hard difficulty gives a shorter reaction window');
  assert.ok(results[0].recovery >= 1.1 && results[0].recovery <= 1.3);
  assert.ok(results[1].recovery >= .9 && results[1].recovery <= 1.05);
  assert.ok(results[0].recovery > results[1].recovery, 'hard defenders resume sooner');
});

test('pause interruption cancels pending bursts and requires a new complete tell without moving or healing actors', () => {
  for (const interruptionTime of [.4, .8]) {
    const f = fixture(); f.spawn(); f.advance(interruptionTime);
    assert.equal(typeof f.squad.interruptAttacks, 'function');
    const before = f.squad.getTargets().map(e => ({ position: e.position, hp: e.hp, yaw: e.yaw }));
    const shots = f.events.shots.length, cues = f.events.cues.length;
    f.squad.interruptAttacks();
    assert.deepEqual(f.squad.getTargets().map(e => ({ position: e.position, hp: e.hp, yaw: e.yaw })), before);
    assert.equal(f.squad.stats().attackers, 0);
    assert.equal(f.squad.getTargets()[0].tell, 0);
    const matrix = new THREE.Matrix4(); f.squad.group.children[2].getMatrixAt(0, matrix);
    assert.equal(matrix.elements[0], 0, 'paused preparation and muzzle markers are cleared');
    assert.equal(f.events.cues.length, cues, 'interruption itself does not emit a stale cue');
    f.advance(.49); assert.equal(f.events.shots.length, shots);
    assert.equal(f.events.cues.length, cues + 1, 'resume emits a fresh spatial cue');
    f.advance(.3); assert.ok(f.events.shots.length > shots);
    assert.ok(f.events.shots[shots].time - f.events.cues[cues].time >= .5);
  }
});

test('cover appearing during a burst stops the next round and reacquisition grants a fresh alert tell', () => {
  let blocked = false;
  const f = fixture({ trace: () => blocked ? { distance: 0 } : null }); f.spawn();
  while (!f.events.shots.length) f.advance(1 / 120);
  blocked = true; f.advance(.4);
  assert.equal(f.events.shots.length, 1); assert.equal(f.events.hits.length, 1);
  blocked = false; const cleared = f.time; f.advance(.2);
  assert.equal(f.events.shots.length, 1);
  f.advance(1.2); assert.ok(f.events.shots.length > 1);
  assert.ok(f.events.shots[1].time - cleared >= .22);
});

test('a clear eye line cannot fire a barrel through close cover', () => {
  const f = fixture({ trace: (origin, dir, max) => max < 2 ? { distance: .12 } : null });
  f.spawn(); f.advance(3);
  assert.equal(f.events.shots.length, 0); assert.equal(f.events.hits.length, 0);
});

test('a cached sighting does not permit a shot outside the current field of view', () => {
  const f = fixture(); f.spawn();
  for (let i = 0; i < 200 && (!f.squad.getTargets()[0].tell || f.squad.getTargets()[0].tell > .009); i++) f.advance(1 / 120);
  assert.equal(f.squad.getTargets()[0].attackPhase, 'tell');
  f.player.position.z = -12; f.advance(1 / 120);
  assert.equal(f.events.shots.length, 0, 'an old forward sighting cannot authorize a backwards shot');
});

test('retry and elapsed-time partition preserve attack results, positions and facing', () => {
  const points = [{ x: 0, z: 0, type: 'scout', yaw: 0, role: 'flank' }, { x: -10, z: 0, type: 'rifle', yaw: 0, role: 'guard' }];
  const outcomes = [];
  for (const fps of [30, 60, 120]) {
    const f = fixture();
    for (let retry = 0; retry < 2; retry++) {
      f.squad.reset(); f.events.shots.length = f.events.hits.length = 0; f.spawn(points); f.advance(6, 1 / fps);
      outcomes.push({ shots: f.events.shots.length, hits: f.events.hits.length,
        positions: f.squad.getTargets().map(e => e.position.map(n => Math.round(n * 1e6))),
        yaws: f.squad.getTargets().map(e => Math.round(e.yaw * 1e6)) });
    }
  }
  assert.ok(outcomes[0].shots > 3);
  for (const result of outcomes.slice(1)) assert.deepEqual(result, outcomes[0]);
});

test('rear approach is initially unseen and alerted guards remain local while engaging a distant target', () => {
  const f = fixture(); f.player.position.z = -12; f.spawn(); f.advance(.1);
  assert.equal(f.events.cues.length, 0); assert.equal(f.events.shots.length, 0);
  assert.equal(f.squad.getTargets()[0].hasMemory, false);
  f.player.position.set(0, 1.7, 90); f.advance(12);
  assert.ok(Math.hypot(...[f.squad.getTargets()[0].position[0], f.squad.getTargets()[0].position[2]]) <= 12);
  assert.ok(f.events.shots.length > 0, 'clear distant targets are now within mission engagement range');
});

test('patrol, flank and guard roles relocate within their assigned local anchors', () => {
  const f = fixture();
  f.spawn([{ x: -15, z: 0, type: 'rifle', yaw: Math.PI, role: 'patrol' },
    { x: 0, z: 0, type: 'scout', yaw: 0, role: 'flank' }, { x: 15, z: 0, type: 'rifle', yaw: 0, role: 'guard' }]);
  f.advance(3); const [patrol, flank, guard] = f.squad.getTargets();
  assert.ok(Math.hypot(patrol.position[0] + 15, patrol.position[2]) > 1);
  assert.ok(Math.hypot(flank.position[0], flank.position[2]) > 1);
  assert.ok(Math.hypot(guard.position[0] - 15, guard.position[2]) > .5, 'guards also change position instead of freezing at spawn');
  f.player.position.set(80, 1.7, 80); f.advance(15);
  for (const e of f.squad.getTargets()) assert.ok(Math.hypot(e.position[0] - e.anchor[0], e.position[2] - e.anchor[2]) <= (e.role === 'flank' ? 26 : e.role === 'patrol' ? 18 : 12));
});

test('heavy helmet absorbs first headshot then exposes a one-shot head', () => {
  const f = fixture(); f.spawn([{ x: 0, z: 0, type: 'heavy', yaw: 0, role: 'guard' }]);
  const first = f.squad.damage(1, 'head', 120, { direction: { x: 0, y: 0, z: -1 } });
  assert.equal(first.killed, false); assert.equal(first.armorHit, true); assert.equal(first.armorBreak, true);
  assert.equal(f.squad.getTargets()[0].helmet, false);
  const second = f.squad.damage(1, 'head', 120);
  assert.equal(second.killed, true); assert.equal(second.armorHit, false);
});

test('heavy torso protection is directional rather than an enlarged health pool', () => {
  const front = fixture(), rear = fixture();
  const points = [{ x: 0, z: 0, type: 'heavy', yaw: 0, role: 'guard' }]; front.spawn(points); rear.spawn(points);
  const protectedHit = front.squad.damage(1, 'upper', 40, { direction: { x: 0, y: 0, z: -1 } });
  const exposedHit = rear.squad.damage(1, 'upper', 40, { direction: { x: 0, y: 0, z: 1 } });
  assert.equal(protectedHit.armorHit, true); assert.equal(exposedHit.armorHit, false);
  assert.ok(protectedHit.damage < exposedHit.damage); assert.equal(exposedHit.damage, 40);
  assert.equal(front.squad.getTargets()[0].maxHp, 100);
});

test('death removes attacks and hit targets immediately but presents a bounded directional fall', () => {
  const f = fixture(); f.spawn(); f.advance(.8);
  const before = f.events.shots.length;
  f.squad.damage(1, 'head', 120, { direction: { x: 1, y: 0, z: 0 } });
  assert.equal(f.squad.stats().alive, 0); assert.equal(f.squad.stats().corpses, 1);
  assert.equal(f.squad.raycast(new THREE.Vector3(0, 1.4, 5), new THREE.Vector3(0, 0, -1), 8), null);
  f.advance(.4); assert.equal(f.events.shots.length, before);
  const matrix = new THREE.Matrix4(); f.squad.group.children[0].getMatrixAt(5, matrix);
  assert.ok(matrix.elements[12] > .2, 'body falls in bullet travel direction');
  f.player.alive = false; f.advance(4);
  assert.equal(f.squad.stats().corpses, 0, 'visual corpses expire even after the player dies');
});

test('mass casualties keep at most six visual corpses and reset clears all pending attacks', () => {
  const f = fixture(); f.spawn(Array.from({ length: 10 }, (_, i) => ({ x: i * 3, z: 0, type: 'rifle', yaw: 0, role: 'guard' })));
  f.advance(.4);
  for (const e of f.squad.getTargets()) f.squad.damage(e.id, 'head', 120);
  assert.equal(f.squad.stats().alive, 0); assert.ok(f.squad.stats().corpses <= 6);
  f.squad.reset(); f.advance(2);
  assert.equal(f.squad.stats().corpses, 0); assert.equal(f.events.shots.length, 0);
});

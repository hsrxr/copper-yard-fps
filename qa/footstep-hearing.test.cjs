/* Running noise is a weak, local contact, independent from visual/gunshot sensing. */
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

function fixture(tactical = true) {
  const world = { isArena: true, size: 400, water: -20, height: () => 0, slope: () => 0 };
  const f = { colliders: [], shots: [], player: { position: new THREE.Vector3(0, 1.7, 8), velocity: new THREE.Vector3(), alive: true } };
  f.squad = createEnemies({ THREE, world, tactical, rng: seededRandom,
    trace: (o, d, max) => FPSRules.traceWorld(o, d, max, world, f.colliders), canStand: () => true,
    onEnemyShot: (origin, end, type, metadata) => f.shots.push({ origin, end, type, metadata }) });
  f.spawn = (points = [{ x: 0, z: 0, type: 'rifle', role: 'guard', yaw: Math.PI }]) =>
    assert.equal(f.squad.spawnEncounter(points, f.player.position), points.length);
  f.advance = seconds => { for (let i = 0; i < Math.round(seconds * 120); i++) f.squad.update(1 / 120, f.player); };
  f.step = (position = f.player.position) => {
    assert.equal(typeof f.squad.hearPlayerFootstep, 'function', 'running footsteps need a distinct hearing API');
    return f.squad.hearPlayerFootstep(position);
  };
  f.wall = () => f.colliders.push({ shape: 'box', x: 0, y: 0, z: 4, hx: 100, hz: .3, height: 6 });
  return f;
}

test('a nearby defender facing away hears running and turns toward an approximate source', () => {
  const f = fixture(); f.spawn();
  assert.equal(f.step(), 1);
  const heard = f.squad.getTargets()[0];
  assert.equal(heard.hasMemory, true); assert.equal(heard.alertSource, 'footstep');
  assert.equal(heard.sight, false);
  const error = Math.hypot(heard.lastSeen[0], heard.lastSeen[2] - 8);
  assert.ok(error > .1 && error < 3, `sound should be approximate, error ${error}`);
  f.advance(.3);
  assert.ok(Math.abs(f.squad.getTargets()[0].yaw - Math.PI) > 1, 'a heard step turns attention behind the listener');
});

test('clear footsteps reach nearby listeners but not distant defenders', () => {
  const f = fixture(); f.player.position.set(0, 1.7, 0);
  f.spawn([{ x: 0, z: 16, type: 'rifle', role: 'guard', yaw: 0 },
    { x: 0, z: 21, type: 'rifle', role: 'guard', yaw: 0 }]);
  assert.equal(f.step(), 1);
  assert.equal(f.squad.getTargets()[0].hasMemory, true);
  assert.equal(f.squad.getTargets()[1].hasMemory, false);
});

test('solid cover attenuates footsteps and weak contacts never relay to adjacent allies', () => {
  const f = fixture(); f.wall();
  f.spawn([{ x: 0, z: 0, type: 'rifle', role: 'guard', yaw: Math.PI },
    { x: 8, z: 0, type: 'rifle', role: 'guard', yaw: Math.PI }]);
  assert.equal(f.step(), 1);
  assert.equal(f.squad.getTargets()[0].alertSource, 'footstep');
  assert.equal(f.squad.getTargets()[1].hasMemory, false, '11 m through a wall is beyond quiet footstep hearing');
  f.advance(.4);
  assert.equal(f.squad.getTargets()[1].hasMemory, false, 'an adjacent ally must not inherit a heard footstep');
  assert.equal(f.shots.length, 0, 'footsteps cannot authorize firing through cover');
});

test('heard footsteps preserve a finite snapshot and do not track later hidden movement', () => {
  const f = fixture(); f.wall(); f.spawn(); f.step();
  const remembered = f.squad.getTargets()[0].lastSeen;
  f.player.position.set(70, 1.7, 80); f.advance(4);
  assert.equal(f.squad.getTargets()[0].hasMemory, true);
  assert.deepEqual(f.squad.getTargets()[0].lastSeen, remembered);
  f.advance(2.2);
  assert.equal(f.squad.getTargets()[0].hasMemory, false);
  assert.equal(f.squad.getTargets()[0].alertSource, null);
  assert.equal(f.shots.length, 0);
});

test('footsteps cannot replace a stronger unseen gunshot contact or extend its lifetime', () => {
  const f = fixture(); f.wall(); f.spawn();
  f.squad.hearPlayerShot(new THREE.Vector3(8, 1.7, 8)); f.advance(.4);
  const before = f.squad.getTargets()[0];
  f.step(); const after = f.squad.getTargets()[0];
  assert.equal(after.alertSource, 'shot');
  assert.deepEqual(after.lastSeen, before.lastSeen);
  assert.equal(after.memoryTime, before.memoryTime);
});

test('repeated footsteps leave an active visual tell and burst unchanged', () => {
  const f = fixture(); f.spawn([{ x: 0, z: 0, type: 'rifle', role: 'guard', yaw: 0 }]);
  f.advance(.1);
  const before = f.squad.getTargets()[0]; assert.equal(before.attackPhase, 'tell');
  for (let i = 0; i < 10; i++) f.step();
  const after = f.squad.getTargets()[0];
  assert.equal(after.attackPhase, before.attackPhase); assert.equal(after.tell, before.tell);
  assert.equal(after.alertSource, 'sight'); assert.deepEqual(after.lastSeen, before.lastSeen);
  f.advance(.6); assert.ok(f.shots.length > 0);
  const bursting = f.squad.getTargets()[0]; assert.equal(bursting.attackPhase, 'burst');
  f.step(); assert.equal(f.squad.getTargets()[0].attackPhase, 'burst');
  f.advance(.4); assert.equal(f.shots.length, 3);
});

test('malformed footstep events are ignored', () => {
  const f = fixture(); f.spawn();
  for (const origin of [null, {}, { x: NaN, y: 0, z: 0 }, { x: 0, y: Infinity, z: 0 }]) assert.equal(f.step(origin), 0);
  assert.equal(f.squad.getTargets()[0].hasMemory, false);
});

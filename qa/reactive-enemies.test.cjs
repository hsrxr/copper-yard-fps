/* Reactive mission infantry: real math, world traces and authored local routes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const file of ['vendor/three-r160.min.js', 'src/combat.js', 'src/random.js', 'src/arena.js', 'src/mission.js', 'src/enemies.js']) {
  let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  if (file.startsWith('vendor/')) source = '(function () { var exports, module, define;\n' + source + '\n}).call(globalThis);';
  vm.runInThisContext(source, { filename: file });
}
const { THREE, createEnemies, FPSRules, seededRandom } = globalThis;
function fixture(options = {}) {
  const world = options.world || { isArena: true, size: 400, water: -20, height: () => 0, slope: () => 0 };
  const f = { time: 0, colliders: world.colliders || [], shots: [], hits: [], cues: [], steps: [],
    player: { position: new THREE.Vector3(0, 1.7, 50), velocity: new THREE.Vector3(), alive: true } };
  f.squad = createEnemies({ THREE, world, tactical: true, rng: seededRandom,
    trace: options.trace || ((o, d, max) => FPSRules.traceWorld(o, d, max, world, f.colliders)),
    canStand: options.canStand || ((x, z, r) => world.walkable ? world.walkable(x, z, r) : true),
    onEnemyShot: (origin, end, type, metadata) => f.shots.push({ time: f.time, origin, end, type, metadata }),
    onPlayerHit: (damage) => f.hits.push({ time: f.time, damage }),
    onEnemyCue: (position, kind) => { if (kind === 'prepare') f.cues.push(f.time); if (kind === 'step') f.steps.push(f.time); } });
  f.spawn = (points = [{ x: 0, z: 0, type: 'rifle', role: 'guard', yaw: 0 }]) => {
    assert.equal(f.squad.spawnEncounter(points, f.player.position), points.length);
  };
  f.advance = (seconds, fps = 120) => {
    for (let i = 0, n = Math.round(seconds * fps); i < n; i++) { f.time += 1 / fps; f.squad.update(1 / fps, f.player); }
  };
  return f;
}

test('every archetype engages clear near and 50/75/150 m targets without changing health or damage', () => {
  for (const type of ['scout', 'rifle', 'heavy']) for (const range of [12, 50, 75, 150]) {
    const f = fixture(); f.player.position.z = range;
    f.spawn([{ x: 0, z: 0, type, role: 'guard', yaw: 0 }]); f.advance(1.5);
    const target = f.squad.getTargets()[0];
    assert.ok(f.shots.length >= 3, `${type} ignored a visible ${range} m target`);
    assert.ok(f.hits.length >= 1, `${type} cannot pressure a stationary ${range} m target`);
    assert.ok(target.maxHp >= 80 && target.maxHp <= 100); assert.equal(target.damage, 35);
  }
});

test('unaware and already-alert tells remain readable but repeated cover peeks do not restore first-contact grace', () => {
  for (const mode of ['standard', 'hard']) {
    let blocked = false;
    const f = fixture({ trace: () => blocked ? { distance: 0 } : null }); f.player.position.z = 12;
    f.squad.setThreat({ difficulty: mode }); f.spawn();
    while (!f.shots.length && f.time < 2) f.advance(1 / 120);
    assert.ok(f.shots.length > 0, 'visible targets must receive a first response');
    const cold = f.shots[0].time - f.cues[0];
    assert.ok(cold >= (mode === 'hard' ? .44 : .5) && cold <= (mode === 'hard' ? .57 : .69), `${mode} cold tell ${cold}`);
    blocked = true; f.advance(.2); const before = f.shots.length;
    blocked = false; const peek = f.time; f.advance(.48);
    assert.ok(f.shots.length > before, `${mode} failed to punish a repeat peek`);
    const repeat = f.shots[before].time - f.cues[1];
    assert.ok(repeat >= (mode === 'hard' ? .18 : .22) && repeat <= (mode === 'hard' ? .29 : .35), `${mode} alert tell ${repeat}`);
    assert.ok(f.shots[before].time - peek < .48);
  }
});

test('exposed head over low cover is sensed and fired at while full cover blocks every shot', () => {
  for (const height of [1.35, 4]) {
    const f = fixture(); f.player.position.z = 12;
    f.colliders.push({ shape: 'box', x: 0, y: 0, z: 9, hx: 100, hz: .3, height });
    f.spawn(); f.advance(1.4);
    if (height < 2) {
      assert.ok(f.shots.length >= 3, 'a visible head is a valid sensed and aimable target');
      assert.ok(f.hits.length > 0, 'head exposure is not a harmless animation');
    } else { assert.equal(f.shots.length, 0); assert.equal(f.hits.length, 0); }
  }
});

test('local gunshot hearing is attenuated by cover and retains a snapshot without hidden live tracking', () => {
  const f = fixture({ trace: () => ({ distance: 1 }) });
  f.player.position.set(0, 1.7, 30);
  f.spawn([{ x: 0, z: 0, type: 'rifle', role: 'guard', yaw: Math.PI },
    { x: 50, z: 0, type: 'rifle', role: 'patrol', yaw: Math.PI },
    { x: 100, z: 0, type: 'rifle', role: 'flank', yaw: Math.PI }]);
  assert.equal(typeof f.squad.hearPlayerShot, 'function');
  f.squad.hearPlayerShot(f.player.position);
  const initial = f.squad.getTargets();
  assert.equal(initial[0].alerted, true); assert.equal(initial[0].alertSource, 'shot');
  assert.equal(initial[1].alerted, false, '58 m behind cover is beyond attenuated hearing');
  assert.equal(initial[2].alerted, false, 'remote squads do not get global gunshot aggro');
  assert.ok(Math.hypot(initial[0].lastSeen[0], initial[0].lastSeen[2] - 30) <= 2.1);
  const remembered = initial[0].lastSeen;
  f.player.position.set(140, 1.7, -60); f.advance(4);
  assert.deepEqual(f.squad.getTargets()[0].lastSeen, remembered);
  assert.equal(f.squad.getTargets()[0].hasMemory, true);
  assert.ok(Math.hypot(f.squad.getTargets()[0].position[0], f.squad.getTargets()[0].position[2]) > 2, 'hearing prompts an actual local investigation');
  f.advance(2.2);
  assert.ok(f.squad.getTargets().every(e => !e.hasMemory), 'all borrowed contacts expire without a radio-refresh chain');
  assert.equal(f.shots.length, 0, 'sound cannot authorize firing through full cover');
});

test('unoccluded shots are heard at 65 m but never at 75 m', () => {
  const f = fixture(); f.player.position.set(0, 1.7, 0);
  f.spawn([{ x: 0, z: 65, type: 'rifle', role: 'guard', yaw: 0 }, { x: 0, z: 75, type: 'rifle', role: 'guard', yaw: 0 }]);
  assert.equal(typeof f.squad.hearPlayerShot, 'function'); f.squad.hearPlayerShot(f.player.position);
  assert.equal(f.squad.getTargets()[0].hasMemory, true); assert.equal(f.squad.getTargets()[1].hasMemory, false);
});

test('a rear hit at 50 m alerts the victim and its nearby team before lethal removal', () => {
  for (const lethal of [false, true]) {
    const f = fixture({ trace: () => ({ distance: 1 }) });
    f.player.position.set(0, 1.7, -50);
    f.spawn([{ x: 0, z: 0, type: 'rifle', role: 'guard', yaw: 0 },
      { x: 20, z: 0, type: 'rifle', role: 'guard', yaw: 0 }, { x: 55, z: 0, type: 'rifle', role: 'guard', yaw: 0 }]);
    f.squad.damage(1, 'upper', lethal ? 120 : 40, { origin: f.player.position.clone(), direction: { x: 0, y: 0, z: 1 } });
    const [victim, ally, remote] = f.squad.getTargets();
    assert.equal(victim.hasMemory, true); assert.equal(ally.hasMemory, true); assert.equal(remote.hasMemory, false);
    assert.deepEqual(victim.lastSeen, [0, 1.7, -50]); assert.deepEqual(ally.lastSeen, [0, 1.7, -50]);
    assert.equal(victim.alive, !lethal);
    f.advance(1.5); assert.ok(Math.abs(f.squad.getTargets()[1].yaw) > 1, 'nearby team turns toward the shot source');
  }
});

test('every role keeps relocating after ten seconds while staying in its own collision-safe leash', () => {
  for (const role of ['guard', 'patrol', 'flank']) for (const alerted of [false, true]) {
    const f = fixture({ trace: alerted ? undefined : () => ({ distance: 0 }) });
    f.spawn([{ x: 0, z: 0, type: 'rifle', role, yaw: 0,
      patrol: [{ x: -5, z: 0 }, { x: 5, z: 0 }, { x: 0, z: 5 }], cover: [{ x: -6, z: 3 }, { x: 6, z: 3 }] }]);
    f.advance(10); let previous = f.squad.getTargets()[0].position, travel = 0;
    const leash = role === 'flank' ? 26 : role === 'patrol' ? 18 : 12;
    for (let i = 0; i < 100; i++) {
      f.advance(.1); const e = f.squad.getTargets()[0];
      travel += Math.hypot(e.position[0] - previous[0], e.position[2] - previous[2]); previous = e.position;
      assert.ok(Math.hypot(e.position[0], e.position[2]) <= leash + .01);
    }
    assert.ok(travel > 7, `${role} ${alerted ? 'alerted' : 'unaware'} stopped after its first move: ${travel} m`);
  }
});

test('invalid route endpoints are ignored and collision checks remain authoritative while repositioning', () => {
  const canStand = (x, z) => x < 2 && Math.abs(z) < 18;
  const f = fixture({ canStand }); f.spawn([{ x: 0, z: 0, type: 'rifle', role: 'guard', yaw: 0,
    patrol: [{ x: 30, z: 0 }, { x: NaN, z: 0 }, { x: 8, z: 0 }, { x: -5, z: 0 }],
    cover: [{ x: 100, z: 0 }, { x: 6, z: 0 }, { x: -6, z: 2 }] }]);
  for (let i = 0; i < 100; i++) { f.advance(.1); const e = f.squad.getTargets()[0]; assert.ok(canStand(e.position[0], e.position[2])); }
  assert.ok(f.shots.length > 0);
});

test('an unaware authored patrol reaches both ends of a long closed segment before changing its goal', () => {
  const f = fixture({ trace: () => ({ distance: 0 }) });
  f.spawn([{ x: 0, z: 0, type: 'rifle', role: 'patrol', yaw: 0, patrol: [{ x: -8, z: 0 }, { x: 8, z: 0 }] }]);
  let min = 0, max = 0;
  for (let i = 0; i < 250; i++) { f.advance(.1); const x = f.squad.getTargets()[0].position[0]; min = Math.min(min, x); max = Math.max(max, x); }
  assert.ok(min < -7.5, `never reached west end: ${min}`);
  assert.ok(max > 7.5, `a fixed timeout turned the patrol around before the east end: ${max}`);
});

test('reactive contact, motion and shots are deterministic across retries and 30/60/120 Hz', () => {
  const outcomes = [];
  for (const fps of [30, 60, 120]) {
    const f = fixture();
    for (let retry = 0; retry < 2; retry++) {
      f.squad.reset(); f.shots.length = f.hits.length = 0;
      f.spawn([{ x: 0, z: 0, type: 'rifle', role: 'guard', yaw: Math.PI }, { x: 15, z: 0, type: 'scout', role: 'flank', yaw: Math.PI }]);
      assert.equal(typeof f.squad.hearPlayerShot, 'function'); f.squad.hearPlayerShot(f.player.position); f.advance(12, fps);
      outcomes.push({ shots: f.shots.length, hits: f.hits.length, targets: f.squad.getTargets().map(e => ({
        position: e.position.map(n => Math.round(n * 1e5)), yaw: Math.round(e.yaw * 1e5),
        goal: e.goal.map(n => Math.round(n * 1e5)), phase: e.attackPhase, shots: e.shotsFired })) });
    }
  }
  assert.ok(outcomes[0].shots > 6);
  for (const outcome of outcomes.slice(1)) assert.deepEqual(outcome, outcomes[0]);
});

test('all three real mission layouts retain collision-safe movement during seconds 10–20, both quiet and alerted', () => {
  const mission = createTacticalMission(), results = [];
  for (let variant = 0; variant < 3; variant++) {
    const layout = mission.layout();
    for (const alert of [false, true]) {
      const world = makeArenaWorld({ tactical: true }), f = fixture({ world });
      f.player.position.set(alert ? 12 : layout.spawn.x, 1.72, alert ? 60 : layout.spawn.z); f.spawn(layout.enemies);
      let previous = f.squad.getTargets().map(e => e.position), travel = Array(10).fill(0);
      const extent = Array.from({ length: 10 }, () => ({ minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }));
      for (let tick = 0; tick < 200; tick++) {
        // Controlled incoming hits keep the alerted scenario active for the full
        // sample; a single starting sound would expire before seconds 10–20.
        if (alert && tick % 40 === 0) for (const e of f.squad.getTargets()) f.squad.damage(e.id, 'upper', 1, { origin: f.player.position.clone() });
        f.advance(.1);
        for (const [i, e] of f.squad.getTargets().entries()) {
          const radius = e.type === 'heavy' ? .5424 : e.type === 'scout' ? .4704 : .4992;
          assert.ok(world.walkable(e.position[0], e.position[2], radius), `variant ${variant} enemy ${i + 1} entered a solid`);
          const distance = Math.hypot(e.position[0] - e.anchor[0], e.position[2] - e.anchor[2]);
          assert.ok(distance <= (e.role === 'flank' ? 26 : e.role === 'patrol' ? 18 : 12) + .001);
          if (tick >= 100) {
            travel[i] += Math.hypot(e.position[0] - previous[i][0], e.position[2] - previous[i][2]);
            extent[i].minX = Math.min(extent[i].minX, e.position[0]); extent[i].maxX = Math.max(extent[i].maxX, e.position[0]);
            extent[i].minZ = Math.min(extent[i].minZ, e.position[2]); extent[i].maxZ = Math.max(extent[i].maxZ, e.position[2]);
          }
          previous[i] = e.position;
        }
      }
      for (const [i, distance] of travel.entries()) assert.ok(distance > 5, `variant ${variant} ${alert ? 'alert' : 'quiet'} enemy ${i + 1} stalled: ${distance.toFixed(2)} m in seconds 10–20`);
      for (const [i, box] of extent.entries()) assert.ok(Math.hypot(box.maxX - box.minX, box.maxZ - box.minZ) > 2.5,
        `variant ${variant} enemy ${i + 1} merely jittered without meaningful displacement`);
      assert.ok(f.steps.length > 100 && f.steps.length <= 420, 'movement cues are spatial and rate-limited per soldier');
      if (alert) assert.ok(f.shots.length > 0, 'the alerted sample includes real combat, not only expired-memory patrol');
      results.push({ variant, alert, travel: travel.map(n => +n.toFixed(2)), shots: f.shots.length });
    }
    mission.reset(true);
  }
  console.log(JSON.stringify({ actualMapMovement: results }));
});

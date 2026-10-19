/* Pooled, asset-free tactical infantry. Three r160, ordinary offline script. */
(function () {
  'use strict';

  function createEnemies(ctx) {
    const THREE = ctx.THREE, world = ctx.world, tactical = ctx.tactical === true;
    const CAPACITY = 20, ACTIVE_LIMIT = 16, BOX_PARTS = 25, ROUND_PARTS = 3;
    const group = new THREE.Group();
    group.name = 'Tactical infantry';
    const random = ctx.rng ? ctx.rng(834171) : Math.random;
    const fallback = {
      scout: { hp: 60, speed: 3.2, damage: 5, interval: .6, range: 65, score: 100, drop: 22 },
      rifle: { hp: 100, speed: 2.3, damage: 9, interval: .85, range: 85, score: 160, drop: 30 },
      heavy: { hp: 190, speed: 1.4, damage: 16, interval: 1.5, range: 55, score: 260, drop: 42 }
    };
    const palettes = {
      scout: [0xb7a279, 0x544f3c, 0xef9b35, 0x303a3a, 0xbf9471, 0x232b2e],
      rifle: [0x677c89, 0x283b49, 0xef634c, 0x243137, 0xbb9575, 0x202c31],
      heavy: [0x4b5557, 0x252f35, 0xffa13f, 0x18242b, 0xb28e71, 0x172329]
    };
    for (const key in palettes) palettes[key] = palettes[key].map(hex => new THREE.Color(hex));
    const skinFlash = new THREE.Color(0xffd2a0), eliteMark = new THREE.Color(0xffe17b), color = new THREE.Color();
    const standard = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .87, metalness: .12, flatShading: true });
    const flashMaterial = new THREE.MeshBasicMaterial({ color: 0xffd580, toneMapped: false });
    const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), standard, CAPACITY * BOX_PARTS);
    const rounds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), standard, CAPACITY * ROUND_PARTS);
    const flashes = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), flashMaterial, CAPACITY);
    boxes.name = 'Uniforms, armor and weapons'; rounds.name = 'Faces, helmets and goggles'; flashes.name = 'Enemy muzzle flashes';
    for (const mesh of [boxes, rounds, flashes]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(mesh);
    }
    boxes.castShadow = rounds.castShadow = true;
    boxes.receiveShadow = rounds.receiveShadow = true;
    const dummy = new THREE.Object3D(), root = new THREE.Object3D();
    const matrix = new THREE.Matrix4(), zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    const direction = new THREE.Vector3(), muzzle = new THREE.Vector3();
    const sightOrigin = new THREE.Vector3(), aim = new THREE.Vector3();
    const shotEnd = new THREE.Vector3(), right = new THREE.Vector3(), upward = new THREE.Vector3();
    const rayOrigin = new THREE.Vector3(), rayDirection = new THREE.Vector3(), hitPoint = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const pool = [];
    let nextId = 1, wave = 0, kills = 0, shots = 0, hits = 0, elapsed = 0;
    let pendingPlan = null, threatStage = 0, difficulty = 'standard', sightChecks = 0;
    let nextOpportunity = 0, opportunityCursor = 0, nextBurstStart = 0, hearingSerial = 0, footstepSerial = 0;

    for (let i = 0; i < CAPACITY; i++) {
      const hitboxes = [];
      for (let j = 0; j < 16; j++) hitboxes.push({ matrix: new THREE.Matrix4(), inverse: new THREE.Matrix4(), zone: j < 4 ? 'legs' : 'upper' });
      pool.push({ slot: i, id: 0, alive: false, type: 'scout', hp: 0, maxHp: 0,
        position: new THREE.Vector3(), head: new THREE.Vector3(), hitboxes: hitboxes,
        yaw: 0, scale: 1, phase: i * 2.39, moving: 0, hitFlash: 0, recoil: 0,
        flash: 0, age: 0, aimTime: 0, loseSight: 0, cooldown: 0, decision: 0,
        strafe: 1, avoid: 1, turnLock: 0, turnAngle: 0, stun: 0, hasShot: false,
        interruptImmune: 0, heavyImmune: 0, visible: false, memoryTime: 0, hasMemory: false,
        lastSeen: new THREE.Vector3(), moveAngle: 0, moveScale: 0, maneuver: 0, routeReady: false,
        patrolX: 0, patrolZ: 0, patrolTime: 0, searchAge: 0,
        anchor: new THREE.Vector3(), anchorYaw: 0, attackPhase: 'idle', tell: 0, burstLeft: 0, shotIndex: 0,
        goal: new THREE.Vector3(), hasGoal: false, goalKind: 'patrol', goalTime: 0, goalPending: false,
        patrolRoute: [], coverRoute: [], patrolIndex: 0, positionIndex: 0, holdTime: 0, blockedTime: 0,
        nextReposition: 0, nextBroadcast: 0, nextFootstep: 0, alertSource: null, coldTell: true, forceFullTell: false,
        helmet: false, corpseRemaining: 0, deathAge: 0, deathX: 0, deathZ: 1,
        elite: false, spawnWave: 1, role: 'flank', radius: .5, baseCfg: fallback.scout, cfg: fallback.scout });
    }

    function config(type) {
      if (tactical) return Object.assign({}, fallback[type], {
        hp: type === 'scout' ? 80 : 100, damage: 35, interval: .16,
        speed: type === 'scout' ? 2.8 : type === 'heavy' ? 2.1 : 2.5,
        range: 260, drop: 0
      });
      const source = globalThis.FPSRules && globalThis.FPSRules.ENEMY_TYPES && globalThis.FPSRules.ENEMY_TYPES[type];
      if (!source) return fallback[type];
      return Object.assign({}, fallback[type], source, {
        hp: source.hp || source.maxHp || fallback[type].hp,
        interval: source.fireInterval || source.interval || fallback[type].interval
      });
    }

    function scaling(number, stage, mode) {
      const rules = globalThis.FPSRules;
      return rules && rules.enemyScaling ? rules.enemyScaling(number, stage, mode) : { hp: 1, damage: 1, interval: 1, eliteChance: 0 };
    }

    // Always derive from the base archetype. Repeated director updates cannot compound stats.
    function applyThreat(e, stage, mode, preserveHealth) {
      const ratio = preserveHealth && e.maxHp > 0 ? e.hp / e.maxHp : 1;
      if (tactical) { e.cfg = Object.assign({}, e.baseCfg); e.maxHp = e.cfg.hp; e.hp = e.maxHp * ratio; return; }
      const scale = scaling(e.spawnWave, stage, mode);
      e.cfg = Object.assign({}, e.baseCfg, {
        hp: e.baseCfg.hp * Math.min(1.5, scale.hp * (e.elite ? 1.12 : 1)),
        damage: e.baseCfg.damage * Math.min(1.8, scale.damage * (e.elite ? 1.1 : 1)),
        interval: e.baseCfg.interval * Math.max(.75, scale.interval * (e.elite ? .92 : 1))
      });
      e.maxHp = e.cfg.hp; e.hp = e.maxHp * ratio;
    }

    function setThreat(options) {
      options = options || {};
      if (Number.isFinite(options.stage)) threatStage = Math.max(0, Math.floor(options.stage));
      if (options.difficulty === 'standard' || options.difficulty === 'hard') difficulty = options.difficulty;
      for (let i = 0; i < pool.length; i++) if (pool[i].alive) applyThreat(pool[i], threatStage, difficulty, true);
      return { stage: threatStage, difficulty: difficulty };
    }

    function setColor(mesh, index, palette, flash) {
      color.copy(palette);
      if (flash > 0) color.lerp(skinFlash, Math.min(.8, flash * 5));
      mesh.setColorAt(index, color);
    }

    // The same final matrices drive both the visible limbs and the hitboxes.
    function box(e, index, x, y, z, sx, sy, sz, tint, rx, rz) {
      dummy.position.set(x, y, z);
      dummy.rotation.set(rx || 0, 0, rz || 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      matrix.multiplyMatrices(root.matrix, dummy.matrix);
      boxes.setMatrixAt(e.slot * BOX_PARTS + index, matrix);
      setColor(boxes, e.slot * BOX_PARTS + index, e.elite && tint === 2 ? eliteMark : palettes[e.type][tint], e.hitFlash);
      if (index < e.hitboxes.length) {
        e.hitboxes[index].matrix.copy(matrix);
        e.hitboxes[index].inverse.copy(matrix).invert();
      }
    }

    function round(e, index, x, y, z, sx, sy, sz, tint) {
      dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
      matrix.multiplyMatrices(root.matrix, dummy.matrix);
      rounds.setMatrixAt(e.slot * ROUND_PARTS + index, matrix);
      setColor(rounds, e.slot * ROUND_PARTS + index, e.elite && tint === 2 ? eliteMark : palettes[e.type][tint], e.hitFlash);
    }

    function renderEnemy(e) {
      if (!e.alive && e.corpseRemaining <= 0) {
        for (let i = 0; i < BOX_PARTS; i++) boxes.setMatrixAt(e.slot * BOX_PARTS + i, zeroMatrix);
        for (let i = 0; i < ROUND_PARTS; i++) rounds.setMatrixAt(e.slot * ROUND_PARTS + i, zeroMatrix);
        flashes.setMatrixAt(e.slot, zeroMatrix);
        return;
      }
      const s = e.scale, heavy = e.type === 'heavy';
      const stride = Math.sin(e.phase) * .25 * e.moving;
      const bob = Math.abs(Math.cos(e.phase)) * .025 * e.moving;
      root.position.copy(e.position); root.position.y += bob;
      root.rotation.set(0, e.yaw, 0);
      if (!e.alive) {
        const fall = Math.min(1, e.deathAge / .48), ease = fall * fall * (3 - 2 * fall);
        const localX = e.deathX * Math.cos(e.yaw) - e.deathZ * Math.sin(e.yaw);
        const localZ = e.deathX * Math.sin(e.yaw) + e.deathZ * Math.cos(e.yaw);
        root.rotation.set(localZ * ease * 1.48, e.yaw, -localX * ease * 1.48);
        root.position.x += e.deathX * .32 * ease; root.position.z += e.deathZ * .32 * ease;
        root.position.y += .1 * ease - Math.max(0, .65 - e.corpseRemaining) * .6;
      }
      root.scale.set(s, s, s); root.updateMatrix();
      // Boots, legs and pelvis. Swing remains small enough to keep foot contact convincing.
      box(e, 0, -.17, .13 + Math.max(0, stride) * .16, stride * .65 + .075, .23, .25, .38, 3, -stride * .5);
      box(e, 1, .17, .13 + Math.max(0, -stride) * .16, -stride * .65 + .075, .23, .25, .38, 3, stride * .5);
      box(e, 2, -.17, .52, stride * .36, .225, .68, .25, 0, stride);
      box(e, 3, .17, .52, -stride * .36, .225, .68, .25, 0, -stride);
      box(e, 4, 0, .91, 0, .54, .23, .34, 0);
      box(e, 5, 0, 1.26, 0, heavy ? .68 : .58, .6, .36, 0);
      box(e, 6, 0, 1.29, .225, heavy ? .63 : .49, .49, heavy ? .2 : .13, 1);
      box(e, 7, 0, 1.29, -.275, .43, .49, .23, 1);
      box(e, 8, -.37, 1.45, .015, heavy ? .29 : .22, .24, .33, 1);
      box(e, 9, .37, 1.45, .015, heavy ? .29 : .22, .24, .33, 1);
      box(e, 10, -.37, 1.245, .105, .19, .36, .22, 0, -.58, -.17);
      box(e, 11, .37, 1.245, .105, .19, .36, .22, 0, -.58, .17);
      box(e, 12, -.205, 1.17, .355, .18, .2, .45, 0, -.12, -.18);
      box(e, 13, .245, 1.22, .31, .18, .19, .34, 0, -.11);
      box(e, 14, -.13, 1.19, .56, .18, .16, .16, 3);
      box(e, 15, .225, 1.235, .475, .16, .16, .15, 3);
      // Weapon is held at the shoulder, with barrel, stock, magazine and optical sight.
      const kick = e.recoil * .09;
      box(e, 16, .16, 1.315, .51 - kick, heavy ? .18 : .13, .17, heavy ? .7 : .54, 5);
      box(e, 17, .16, 1.33, .92 - kick, heavy ? .09 : .065, .065, .42, 5);
      box(e, 18, .16, 1.29, .17 - kick, .12, .19, .24, 3);
      box(e, 19, .16, 1.145, .51 - kick, .11, .25, .13, 5, -.17);
      box(e, 20, .16, 1.44, .48 - kick, .115, .08, .16, 5);
      // Bright armband, chest rank, belt and pouches make the silhouettes legible in forest shade.
      box(e, 21, -.387, 1.35, .125, .205, .11, .245, 2, -.58, -.17);
      box(e, 22, 0, 1.435, .31, .29, .065, .035, 2);
      box(e, 23, 0, 1.005, .03, .56, .095, .39, 3);
      box(e, 24, -.16, 1.13, .325, .16, .19, .1, 1);
      round(e, 0, 0, 1.735, .015, .205, .225, .205, 4);
      round(e, 1, 0, 1.83, -.012, heavy ? .26 : .235, .155, .25, 1);
      if (tactical && heavy && !e.helmet) rounds.setMatrixAt(e.slot * ROUND_PARTS + 1, zeroMatrix);
      round(e, 2, 0, 1.765, .199, .18, .062, .035, 2);
      e.head.set(0, 1.755, .015).applyMatrix4(root.matrix);
      if (e.flash > 0) {
        dummy.position.set(.16, 1.33, 1.16); dummy.scale.set(.13, .13, .29); dummy.rotation.set(0, 0, elapsed * 37); dummy.updateMatrix();
        matrix.multiplyMatrices(root.matrix, dummy.matrix); flashes.setMatrixAt(e.slot, matrix);
      } else if (tactical && e.alive && e.attackPhase === 'tell') {
        const pulse = .085 + Math.sin(elapsed * 22) * .018;
        dummy.position.set(0, 2.16, 0); dummy.scale.set(pulse, .16, pulse);
        dummy.rotation.set(0, elapsed * 2, 0); dummy.updateMatrix();
        matrix.multiplyMatrices(root.matrix, dummy.matrix); flashes.setMatrixAt(e.slot, matrix);
      } else flashes.setMatrixAt(e.slot, zeroMatrix);
    }

    function upload() {
      boxes.instanceMatrix.needsUpdate = rounds.instanceMatrix.needsUpdate = flashes.instanceMatrix.needsUpdate = true;
      if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
      if (rounds.instanceColor) rounds.instanceColor.needsUpdate = true;
    }

    function stand(x, z, radius) {
      const half = (world.size || 640) * .5 - 7;
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      const inside = world.inBounds ? world.inBounds(x, z, radius + .15) : Math.abs(x) <= half && Math.abs(z) <= half;
      const height = world.height(x, z);
      if (!inside || !Number.isFinite(height) || (!world.isArena && height < world.water + .65) || world.slope(x, z) > .94) return false;
      if (ctx.canStand) return ctx.canStand(x, z, radius);
      const colliders = ctx.colliders || [];
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i], dx = x - c.x, dz = z - c.z;
        if (dx * dx + dz * dz < (radius + c.r) * (radius + c.r)) return false;
      }
      return true;
    }

    function clearDistance(origin, dir, distance) {
      if (!ctx.trace) return distance;
      const hit = ctx.trace(origin, dir, distance);
      if (!hit) return distance;
      return Number.isFinite(hit.distance) ? Math.max(0, Math.min(distance, hit.distance)) : 0;
    }

    function reset() {
      wave = kills = shots = hits = elapsed = 0; nextId = 1; pendingPlan = null;
      nextOpportunity = nextBurstStart = hearingSerial = footstepSerial = 0; opportunityCursor = 0;
      sightChecks = 0; threatStage = 0; difficulty = 'standard';
      if (ctx.getHuntStage) threatStage = Math.max(0, Math.floor(Number(ctx.getHuntStage()) || 0));
      if (ctx.getDifficulty && ctx.getDifficulty() === 'hard') difficulty = 'hard';
      for (let i = 0; i < pool.length; i++) {
        pool[i].alive = false; pool[i].hp = 0; pool[i].id = 0; pool[i].corpseRemaining = 0;
        pool[i].attackPhase = 'idle'; pool[i].tell = pool[i].burstLeft = pool[i].flash = 0;
        renderEnemy(pool[i]);
      }
      upload();
    }

    function planWave(number, playerPosition, options) {
      options = options || {};
      pendingPlan = null;
      const numericWave = Number(number);
      if (!Number.isFinite(numericWave) || numericWave < 1 || !playerPosition ||
          !Number.isFinite(playerPosition.x) || !Number.isFinite(playerPosition.z)) return Object.freeze([]);
      const plannedWave = Math.floor(numericWave);
      let free = 0;
      for (let i = 0; i < pool.length; i++) if (!pool[i].alive) free++;
      const alive = CAPACITY - free;
      const count = Number.isFinite(options.count) ? Math.max(0, Math.floor(options.count)) : 4 + (plannedWave - 1) * 2;
      const requested = Math.min(ACTIVE_LIMIT - alive, count, free);
      const px = playerPosition.x, pz = playerPosition.z;
      const shore = world.isArena ? 0 : Math.sign(pz - world.river(px)) || 1;
      const stage = Number.isFinite(options.stage) ? Math.max(0, Math.floor(options.stage)) : ctx.getHuntStage ? Number(ctx.getHuntStage()) || 0 : threatStage;
      const mode = options.difficulty === 'hard' || options.difficulty === 'standard' ? options.difficulty : ctx.getDifficulty ? ctx.getDifficulty() : difficulty;
      const scale = scaling(plannedWave, stage, mode);
      const authoredPoints = world.isArena && Array.isArray(world.spawnPoints) && world.spawnPoints.length ? world.spawnPoints : null;
      const plan = [];
      for (let slot = 0; slot < free && plan.length < requested; slot++) {
        const n = plan.length;
        const type = options.kind === 'flank' ? (n % 3 === 2 ? 'rifle' : 'scout') :
          options.kind === 'elite' ? (n % 3 === 0 ? 'heavy' : 'rifle') :
          options.kind === 'assault' ? (n % 4 === 0 ? 'heavy' : n % 4 === 3 ? 'scout' : 'rifle') :
          plannedWave > 1 && n % 5 === 4 ? 'heavy' : n % 4 < 2 ? 'scout' : 'rifle';
        let found = false, x = 0, z = 0;
        // A small authored arena never needs hundreds of repeated random guesses.
        // Rotate the starting point to vary waves, then inspect each candidate once.
        const first = authoredPoints ? Math.floor(random() * authoredPoints.length) : 0;
        const attempts = authoredPoints ? authoredPoints.length : 650;
        for (let attempt = 0; attempt < attempts; attempt++) {
          if (authoredPoints) {
            const point = authoredPoints[(first + attempt) % authoredPoints.length];
            if (!point) continue;
            x = point.x; z = point.z;
            if (Math.hypot(x - px, z - pz) < 25) continue;
          } else {
            const angle = random() * Math.PI * 2;
            const radius = 25 + random() * (plannedWave === 1 ? 22 : 40);
            x = px + Math.cos(angle) * radius; z = pz + Math.sin(angle) * radius;
          }
          if ((!world.isArena && Math.sign(z - world.river(x)) !== shore) || !stand(x, z, .65)) continue;
          let nearby = false;
          for (let j = 0; j < pool.length; j++) {
            if (!pool[j].alive) continue;
            const dx = pool[j].position.x - x, dz = pool[j].position.z - z;
            if (dx * dx + dz * dz < 3.5 * 3.5) { nearby = true; break; }
          }
          if (nearby) continue;
          for (let j = 0; j < plan.length; j++) {
            const dx = plan[j].x - x, dz = plan[j].z - z;
            if (dx * dx + dz * dz < 3.5 * 3.5) { nearby = true; break; }
          }
          if (nearby) continue;
          // Reject islands and routes crossing the river, even when endpoint shore signs agree.
          for (let j = 1; !world.isArena && j < 10; j++) {
            const t = j / 10, tx = px + (x - px) * t, tz = pz + (z - pz) * t;
            if (world.height(tx, tz) < world.water + .25 || world.slope(tx, tz) > 1.1) { nearby = true; break; }
          }
          if (!nearby) { found = true; break; }
        }
        if (!found) continue;
        plan.push(Object.freeze({ x: x, y: world.height(x, z) + .025, z: z, type: type,
          elite: options.kind === 'elite' || random() < scale.eliteChance }));
      }
      Object.freeze(plan);
      if (plan.length) pendingPlan = { plan: plan, wave: plannedWave, originX: px, originZ: pz, stage: stage, difficulty: mode };
      return plan;
    }

    function spawnPlanned(plan, playerPosition) {
      // Only this instance's current immutable plan may be committed, once.
      if (!pendingPlan || pendingPlan.plan !== plan) return 0;
      const pending = pendingPlan; pendingPlan = null;
      let free = 0;
      for (let i = 0; i < pool.length; i++) if (!pool[i].alive) free++;
      if (!Array.isArray(plan) || plan.length < 1 || plan.length > ACTIVE_LIMIT || plan.length > free) return 0;
      for (let i = 0; i < plan.length; i++) {
        const p = plan[i];
        if (!p || !fallback[p.type] || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
            !Number.isFinite(p.z) || !stand(p.x, p.z, .65)) return 0;
      }
      const px = playerPosition && Number.isFinite(playerPosition.x) ? playerPosition.x : pending.originX;
      const pz = playerPosition && Number.isFinite(playerPosition.z) ? playerPosition.z : pending.originZ;
      wave = pending.wave;
      let spawned = 0, slot = 0;
      const room = Math.max(0, ACTIVE_LIMIT - (CAPACITY - free));
      for (let n = 0; n < plan.length && spawned < room; n++) {
        const p = plan[n], type = p.type, x = p.x, z = p.z;
        // The player may approach a warning. Skip that exact point; never reroll a hidden spawn.
        if (Math.hypot(px - x, pz - z) < 12) continue;
        while (slot < pool.length && pool[slot].alive) slot++;
        if (slot >= pool.length) break;
        const e = pool[slot++];
        e.id = nextId++; e.type = type; e.baseCfg = config(type); e.spawnWave = pending.wave; e.elite = !!p.elite;
        e.role = type === 'scout' ? 'flank' : type === 'rifle' ? 'crossfire' : 'advance';
        // A hunt stage can advance during the warning countdown. Keep the announced
        // location/composition while applying that newer threat level exactly once.
        applyThreat(e, Math.max(pending.stage, threatStage), pending.difficulty, false);
        e.alive = true; e.position.set(x, p.y, z);
        e.yaw = Math.atan2(px - x, pz - z); e.scale = type === 'heavy' ? 1.13 : type === 'scout' ? .98 : 1.04;
        e.radius = .48 * e.scale; e.age = 0; e.aimTime = 0; e.loseSight = 0; e.cooldown = 1.8 + random() * .85;
        e.flash = e.hitFlash = e.recoil = e.stun = e.turnLock = e.turnAngle = e.moving = 0;
        e.interruptImmune = e.heavyImmune = 0; e.visible = false; e.memoryTime = 6; e.hasMemory = true;
        e.lastSeen.set(px, playerPosition && Number.isFinite(playerPosition.y) ? playerPosition.y : world.height(px, pz) + 1.7, pz);
        e.moveScale = 0; e.moveAngle = e.yaw; e.routeReady = false;
        e.patrolTime = 0; e.searchAge = 0; e.patrolX = x; e.patrolZ = z;
        e.decision = random() * .2; e.maneuver = 1.4 + random() * 1.5;
        e.strafe = e.id % 2 ? -1 : 1; e.avoid = e.strafe; e.hasShot = false;
        renderEnemy(e); spawned++;
      }
      upload();
      return spawned;
    }

    function spawnWave(number, playerPosition, options) {
      return spawnPlanned(planWave(number, playerPosition, options), playerPosition);
    }

    // An encounter is a complete authored layout, committed before play begins.
    // Player proximity never removes a defender and reset preserves every supplied coordinate.
    function spawnEncounter(points, playerPosition) {
      if (!tactical || !Array.isArray(points) || points.length < 1 || points.length > 12 || pool.some(e => e.alive)) return 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!p || !fallback[p.type] || !stand(p.x, p.z, .65) || (p.yaw !== undefined && !Number.isFinite(p.yaw))) return 0;
        for (let j = 0; j < i; j++) if (Math.hypot(p.x - points[j].x, p.z - points[j].z) < 1.1) return 0;
      }
      pendingPlan = null; wave = 1; nextOpportunity = elapsed; opportunityCursor = 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i], e = pool[i];
        e.id = nextId++; e.type = p.type; e.baseCfg = config(p.type); e.spawnWave = 1; e.elite = false;
        applyThreat(e, 0, difficulty, false);
        e.alive = true; e.position.set(p.x, world.height(p.x, p.z) + .025, p.z); e.anchor.copy(e.position);
        e.yaw = Number.isFinite(p.yaw) ? p.yaw : 0; e.anchorYaw = e.yaw;
        e.role = p.role === 'hold' ? 'guard' : ['guard', 'patrol', 'flank'].includes(p.role) ? p.role : p.type === 'scout' ? 'flank' : 'guard';
        e.scale = p.type === 'heavy' ? 1.13 : p.type === 'scout' ? .98 : 1.04; e.radius = .48 * e.scale;
        e.age = e.aimTime = e.loseSight = e.cooldown = e.flash = e.hitFlash = e.recoil = e.stun = 0;
        e.turnLock = e.turnAngle = e.moving = e.interruptImmune = e.heavyImmune = e.memoryTime = 0;
        e.visible = e.hasMemory = e.hasShot = e.routeReady = false; e.lastSeen.copy(e.position);
        e.phase = i * 2.39; e.moveScale = 0; e.moveAngle = e.yaw; e.decision = i * .009;
        e.patrolTime = 0; e.searchAge = 0; e.patrolX = p.x; e.patrolZ = p.z;
        e.strafe = i % 2 ? -1 : 1; e.avoid = e.strafe;
        e.attackPhase = 'idle'; e.tell = e.burstLeft = e.shotIndex = e.corpseRemaining = e.deathAge = 0;
        e.goal.copy(e.position); e.hasGoal = false; e.goalKind = 'patrol'; e.goalTime = e.holdTime = e.blockedTime = 0;
        e.goalPending = false; e.patrolIndex = e.positionIndex = 0; e.nextReposition = e.nextBroadcast = e.nextFootstep = 0;
        e.alertSource = null; e.coldTell = true; e.forceFullTell = false;
        e.patrolRoute = validRoute(e, p.patrol); e.coverRoute = validRoute(e, p.cover);
        e.helmet = p.type === 'heavy'; renderEnemy(e);
      }
      upload(); return points.length;
    }

    // Ray against a vertical capsule: cylinder plus two spherical caps.
    function sphereDistance(origin, dir, x, y, z, radius) {
      const ox = origin.x - x, oy = origin.y - y, oz = origin.z - z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      const c = ox * ox + oy * oy + oz * oz - radius * radius;
      const discriminant = b * b - c;
      if (discriminant < 0) return Infinity;
      const near = -b - Math.sqrt(discriminant), far = -b + Math.sqrt(discriminant);
      return near >= 0 ? near : far >= 0 ? far : Infinity;
    }

    function playerDistance(origin, dir, position) {
      const radius = .32, bottom = position.y - 1.27, top = position.y - .17;
      let best = Math.min(sphereDistance(origin, dir, position.x, bottom, position.z, radius),
        sphereDistance(origin, dir, position.x, top, position.z, radius));
      const ox = origin.x - position.x, oz = origin.z - position.z;
      const a = dir.x * dir.x + dir.z * dir.z;
      const b = ox * dir.x + oz * dir.z, c = ox * ox + oz * oz - radius * radius;
      const disc = b * b - a * c;
      if (a > 1e-9 && disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / a, y = origin.y + dir.y * t;
        if (t >= 0 && y >= bottom && y <= top) best = Math.min(best, t);
      }
      return best;
    }

    function fire(e, player) {
      const p = player.position, cs = Math.cos(e.yaw), sn = Math.sin(e.yaw), s = e.scale;
      // Decisions are staggered, but a cached sighting never grants a shot through new cover.
      sightOrigin.set(e.position.x, e.position.y + 1.55 * s, e.position.z);
      if (tactical) {
        if (!visibleAim(e, p, sightOrigin, aim)) { e.visible = false; return false; }
      } else {
        aim.copy(p); aim.y -= .55;
        direction.copy(aim).sub(sightOrigin); const currentSight = direction.length(); direction.normalize();
        if (currentSight > e.cfg.range || clearDistance(sightOrigin, direction, currentSight) < currentSight - .04) {
          e.visible = false; return false;
        }
      }
      muzzle.set(e.position.x + (.16 * cs + 1.16 * sn) * s,
        e.position.y + 1.33 * s, e.position.z + (-.16 * sn + 1.16 * cs) * s);
      sightOrigin.set(e.position.x, e.position.y + 1.4 * s, e.position.z);
      direction.copy(muzzle).sub(sightOrigin); const barrelLength = direction.length(); direction.normalize();
      // The barrel may not reach through a nearby trunk before firing.
      if (clearDistance(sightOrigin, direction, barrelLength) < barrelLength - .025) return false;
      if (tactical) {
        // Eye visibility alone does not authorize a shot. Select a point the current
        // muzzle can actually reach, including an exposed head over waist-high cover.
        if (!visibleAim(e, p, muzzle, aim)) return false;
      } else { aim.copy(p); aim.y -= .64; }
      direction.copy(aim).sub(muzzle).normalize(); right.crossVectors(direction, up).normalize(); upward.crossVectors(right, direction).normalize();
      const moving = player.velocity ? Math.hypot(player.velocity.x || 0, player.velocity.z || 0) : 0;
      const spread = (tactical ? Math.min(.008, .27 / Math.max(1, muzzle.distanceTo(aim))) : e.type === 'scout' ? .032 : e.type === 'heavy' ? .038 : .025) * (1 + Math.min(moving, 9) * .045);
      // Fixed mission recoil is reproducible across retries; survival keeps its original randomness.
      const lateral = tactical ? Math.sin(e.id * 2.17 + e.shotIndex * 2.4) : random() * 2 - 1;
      const vertical = tactical ? Math.cos(e.id * 1.39 + e.shotIndex * 1.7) : random() * 2 - 1;
      direction.addScaledVector(right, lateral * spread).addScaledVector(upward, vertical * spread * .7).normalize();
      const obstruction = clearDistance(muzzle, direction, e.cfg.range);
      const contact = playerDistance(muzzle, direction, p);
      const hitPlayer = contact < obstruction - .015 && contact <= e.cfg.range;
      const travel = hitPlayer ? contact : obstruction;
      shotEnd.copy(muzzle).addScaledVector(direction, travel);
      e.flash = .075; e.recoil = 1; e.hasShot = true; shots++;
      if (tactical) e.shotIndex++;
      if (ctx.onEnemyShot) ctx.onEnemyShot(muzzle.clone(), shotEnd.clone(), e.type,
        tactical ? { id: e.id, burstStart: e.burstLeft === 3 } : undefined);
      if (hitPlayer && player.alive) { hits++; if (ctx.onPlayerHit) ctx.onPlayerHit(e.cfg.damage, muzzle.clone()); }
      return true;
    }

    function tryMove(e, angle, amount) {
      const x = e.position.x + Math.sin(angle) * amount, z = e.position.z + Math.cos(angle) * amount;
      if (tactical && Math.hypot(x - e.anchor.x, z - e.anchor.z) > leash(e)) return false;
      if (!stand(x, z, e.radius)) return false;
      for (let i = 0; i < pool.length; i++) {
        const other = pool[i]; if (!other.alive || other === e) continue;
        const dx = x - other.position.x, dz = z - other.position.z;
        if (dx * dx + dz * dz < .95 * .95) return false;
      }
      const y = world.height(x, z) + .025;
      if (Math.abs(y - e.position.y) > Math.max(.24, amount * .96)) return false;
      e.position.set(x, y, z);
      return true;
    }

    // Only sensing reads the live player position. Movement uses this stored sighting,
    // and navigation is recomputed at 4–7 Hz rather than for every soldier every frame.
    function decide(e, player) {
      e.decision = .15 + random() * .1;
      sightOrigin.set(e.position.x, e.position.y + 1.55 * e.scale, e.position.z);
      aim.copy(player.position); aim.y -= .55;
      direction.copy(aim).sub(sightOrigin); const sightLength = direction.length(); direction.normalize();
      sightChecks++;
      e.visible = sightLength <= e.cfg.range && clearDistance(sightOrigin, direction, sightLength) >= sightLength - .04;
      if (e.visible) {
        e.lastSeen.copy(player.position); e.hasMemory = true; e.memoryTime = 6; e.loseSight = 0; e.searchAge = 0;
      }
      e.moveScale = 0; e.routeReady = false;
      // Losing the player removes pursuit information, not the soldier from combat:
      // continue searching authored routes (or nearby forest ground) without consulting
      // the hidden player's coordinates. This prevents an entire full squad going idle.
      if (!e.hasMemory && (e.patrolTime <= 0 || Math.hypot(e.patrolX - e.position.x, e.patrolZ - e.position.z) < 1.5)) {
        e.patrolTime = 3 + random() * 3;
        for (let attempt = 0; attempt < 12; attempt++) {
          let x, z;
          if (world.isArena && world.spawnPoints && world.spawnPoints.length) {
            const point = world.spawnPoints[Math.floor(random() * world.spawnPoints.length)]; x = point.x; z = point.z;
          } else {
            const angle = random() * Math.PI * 2, distance = 8 + Math.min(48, e.searchAge * .35) + random() * 18;
            x = e.lastSeen.x + Math.sin(angle) * distance; z = e.lastSeen.z + Math.cos(angle) * distance;
          }
          if (Math.hypot(x - e.position.x, z - e.position.z) > 4 && stand(x, z, e.radius)) { e.patrolX = x; e.patrolZ = z; break; }
        }
      }
      const targetX = e.hasMemory ? e.lastSeen.x : e.patrolX, targetZ = e.hasMemory ? e.lastSeen.z : e.patrolZ;
      const dx = targetX - e.position.x, dz = targetZ - e.position.z;
      const distance = Math.hypot(dx, dz), face = Math.atan2(dx, dz);
      let goalX = targetX, goalZ = targetZ, angle = face, moveScale = e.hasMemory ? 1 : .8;
      if (e.visible) {
        if (e.type === 'scout') {
          // Opposite stable flank signs divide the squad instead of producing one pursuit train.
          angle += e.strafe * (distance > 19 ? .55 : distance > 11 ? 1.05 : 1.95);
          moveScale = distance < 11 ? .8 : 1;
        } else if (e.type === 'rifle') {
          angle += distance < 22 ? Math.PI + e.strafe * .25 : distance < 36 ? e.strafe * 1.57 : e.strafe * .2;
          moveScale = distance < 36 ? .62 : 1;
        } else {
          angle += distance < 12 ? e.strafe * 1.7 : 0;
          moveScale = distance < 12 ? .45 : 1;
        }
        goalX = e.position.x + Math.sin(angle) * 8;
        goalZ = e.position.z + Math.cos(angle) * 8;
      } else if (distance < 1) return;
      if (world.navigate) {
        const waypoint = world.navigate(e.position.x, e.position.z, goalX, goalZ);
        if (!waypoint || !Number.isFinite(waypoint.x) || !Number.isFinite(waypoint.z)) return;
        const routeX = waypoint.x - e.position.x, routeZ = waypoint.z - e.position.z;
        if (Math.hypot(routeX, routeZ) < .12) return;
        angle = Math.atan2(routeX, routeZ); e.routeReady = true;
      }
      e.moveAngle = angle; e.moveScale = moveScale;
    }

    function leash(e) { return e.role === 'flank' ? 26 : e.role === 'patrol' ? 18 : 12; }

    function validRoute(e, route) {
      if (!Array.isArray(route)) return [];
      return route.filter(p => p && Math.hypot(p.x - e.anchor.x, p.z - e.anchor.z) <= leash(e) &&
        stand(p.x, p.z, e.radius)).map(p => ({ x: p.x, z: p.z }));
    }

    // Shared by sensing and each actual round. Body and head exposure both count;
    // neither the six-second memory nor a teammate's callout can authorize a shot.
    function visibleAim(e, position, origin, target) {
      const dx = position.x - e.position.x, dz = position.z - e.position.z, flat = Math.hypot(dx, dz);
      if (flat > e.cfg.range || (flat > .001 && (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / flat < (e.role === 'flank' ? .42 : .5))) return false;
      for (let point = 0; point < 2; point++) {
        target.copy(position); target.y -= point ? .10 : .55;
        direction.copy(target).sub(origin); const distance = direction.length(); direction.normalize(); sightChecks++;
        if (distance <= e.cfg.range && clearDistance(origin, direction, distance) >= distance - .04) return true;
      }
      return false;
    }

    function contact(e, source, kind) {
      const fresh = !e.hasMemory;
      e.lastSeen.copy(source); e.hasMemory = true; e.memoryTime = 6; e.alertSource = kind;
      if (kind !== 'sight') e.coldTell = false;
      if (fresh || kind === 'shot' || kind === 'damage') { e.goalPending = true; e.decision = 0; }
      if (fresh && (kind === 'shot' || kind === 'damage') && ctx.onEnemyCue) ctx.onEnemyCue(e.position.clone(), 'alert');
    }

    function shareContact(e, source) {
      // Only firsthand sightings/hits call this function. Recipients never relay it,
      // so isolated squads cannot keep each other's stale contact alive forever.
      for (let i = 0; i < pool.length; i++) {
        const ally = pool[i];
        if (!ally.alive || ally === e || ally.visible || Math.hypot(ally.position.x - e.position.x, ally.position.z - e.position.z) > 28) continue;
        contact(ally, source, 'ally');
      }
    }

    function hearPlayerShot(origin) {
      if (!tactical || !origin || ![origin.x, origin.y, origin.z].every(Number.isFinite)) return 0;
      hearingSerial++; let heard = 0;
      for (let i = 0; i < pool.length; i++) {
        const e = pool[i]; if (!e.alive) continue;
        sightOrigin.set(e.position.x, e.position.y + 1.55 * e.scale, e.position.z);
        direction.copy(origin).sub(sightOrigin); const distance = direction.length();
        if (distance > 70) continue;
        direction.normalize(); const blocked = clearDistance(sightOrigin, direction, distance) < distance - .04;
        if (blocked && distance > 45) continue;
        // Sound gives an approximate snapshot, not a moving target or global aggro.
        const angle = e.id * 2.17 + hearingSerial * 1.31;
        aim.set(origin.x + Math.sin(angle) * 1.8, origin.y, origin.z + Math.cos(angle) * 1.8);
        contact(e, aim, 'shot'); heard++;
      }
      return heard;
    }

    // The host emits one event per grounded running step; silent walking, blocked
    // movement, airborne motion and paused input never call this method.
    function hearPlayerFootstep(origin) {
      if (!tactical || !origin || ![origin.x, origin.y, origin.z].every(Number.isFinite)) return 0;
      footstepSerial++; let heard = 0;
      for (let i = 0; i < pool.length; i++) {
        const e = pool[i];
        // A weak sound must not replace visual aim or a stronger contact, refresh
        // that contact's lifetime, or disrupt an already prepared burst.
        if (!e.alive || e.visible || (e.hasMemory && e.alertSource !== 'footstep')) continue;
        sightOrigin.set(e.position.x, e.position.y + 1.55 * e.scale, e.position.z);
        direction.copy(origin).sub(sightOrigin); const distance = direction.length();
        if (distance > 18) continue;
        direction.normalize(); const blocked = clearDistance(sightOrigin, direction, distance) < distance - .04;
        if (blocked && distance > 10) continue;
        const angle = e.id * 2.17 + footstepSerial * 1.31;
        aim.set(origin.x + Math.sin(angle) * 1.8, origin.y, origin.z + Math.cos(angle) * 1.8);
        // Sound is only a local snapshot. No team relay happens until this
        // listener independently sees the player or is hit by them.
        contact(e, aim, 'footstep'); heard++;
      }
      return heard;
    }

    function setGoal(e, x, z, kind) {
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x - e.anchor.x, z - e.anchor.z) > leash(e) ||
          Math.hypot(x - e.position.x, z - e.position.z) < 1 || !stand(x, z, e.radius)) return false;
      if (world.navigate) {
        const waypoint = world.navigate(e.position.x, e.position.z, x, z);
        if (!waypoint || !Number.isFinite(waypoint.x) || !Number.isFinite(waypoint.z)) return false;
      }
      const travelTime = Math.hypot(x - e.position.x, z - e.position.z) / (e.cfg.speed * .85);
      e.goal.set(x, world.height(x, z) + .025, z); e.hasGoal = true; e.goalKind = kind;
      // Quiet patrols finish authored segments, including longer bends around cargo;
      // combat still changes position promptly after a burst or incoming shot.
      e.goalTime = kind === 'patrol' ? Math.max(3.8, Math.min(20, travelTime * 1.5 + 3)) : 3.8 + (e.id % 3) * .3;
      e.holdTime = 0; e.blockedTime = 0;
      e.goalPending = false; e.nextReposition = elapsed + .55;
      return true;
    }

    function chooseTacticalGoal(e) {
      const previousKind = e.goalKind;
      e.positionIndex++;
      if (!e.hasMemory && e.patrolRoute.length) {
        for (let n = 0; n < e.patrolRoute.length; n++) {
          const p = e.patrolRoute[e.patrolIndex++ % e.patrolRoute.length];
          if (setGoal(e, p.x, p.z, 'patrol')) return;
        }
      }
      if (e.hasMemory && e.coverRoute.length && previousKind !== 'cover') {
        for (let n = 0; n < e.coverRoute.length; n++) {
          const p = e.coverRoute[(e.positionIndex + n + e.id) % e.coverRoute.length];
          if (setGoal(e, p.x, p.z, 'cover')) return;
        }
      }
      const bearing = e.hasMemory ? Math.atan2(e.lastSeen.x - e.anchor.x, e.lastSeen.z - e.anchor.z) : e.anchorYaw;
      const base = Math.min(leash(e) * .65, e.role === 'flank' ? 12 : e.role === 'patrol' ? 9 : 7);
      for (let n = 0; n < 16; n++) {
        const angle = bearing + e.strafe * (e.positionIndex + n + 1) * 1.37;
        const distance = base * (n < 8 ? 1 : .5);
        let x = e.anchor.x + Math.sin(angle) * distance, z = e.anchor.z + Math.cos(angle) * distance;
        let kind = e.hasMemory ? (e.visible ? 'lateral' : 'investigate') : 'patrol';
        if (e.hasMemory && previousKind === 'cover' && n < 8) {
          // Leave the cover position after a short hold to peek from a new edge.
          x = e.position.x + Math.sin(angle) * 3.8; z = e.position.z + Math.cos(angle) * 3.8; kind = 'peek';
        }
        if (setGoal(e, x, z, kind)) return;
      }
      e.hasGoal = false; e.goalPending = false; e.goalTime = .6;
    }

    function tacticalDecision(e, player) {
      e.decision = .1;
      sightOrigin.set(e.position.x, e.position.y + 1.55 * e.scale, e.position.z);
      e.visible = visibleAim(e, player.position, sightOrigin, aim);
      if (e.visible) {
        contact(e, player.position, 'sight');
        if (elapsed >= e.nextBroadcast) { shareContact(e, e.lastSeen); e.nextBroadcast = elapsed + 2; }
      }
      e.moveScale = 0; e.routeReady = false;
      const reached = e.hasGoal && Math.hypot(e.goal.x - e.position.x, e.goal.z - e.position.z) < .35;
      if (reached && e.goalKind === 'cover' && !e.goalPending && e.holdTime <= 0) {
        e.holdTime = .4; e.goalTime = .4; e.hasGoal = false; return;
      }
      if (e.holdTime > 0 && !e.goalPending) return;
      if (reached || e.goalTime <= 0 || (e.goalPending && elapsed >= e.nextReposition)) chooseTacticalGoal(e);
      if (!e.hasGoal) return;
      let goalX = e.goal.x, goalZ = e.goal.z;
      if (world.navigate) {
        const waypoint = world.navigate(e.position.x, e.position.z, goalX, goalZ);
        if (!waypoint || !Number.isFinite(waypoint.x) || !Number.isFinite(waypoint.z)) { e.goalPending = true; return; }
        goalX = waypoint.x; goalZ = waypoint.z; e.routeReady = true;
      }
      if (Math.hypot(goalX - e.position.x, goalZ - e.position.z) < .15) return;
      e.moveAngle = Math.atan2(goalX - e.position.x, goalZ - e.position.z); e.moveScale = e.hasMemory ? 1 : .85;
    }

    function recover(e, lostSight) {
      e.attackPhase = 'recover';
      e.cooldown = lostSight ? .08 : difficulty === 'hard' ? .9 + (e.id % 3) * .05 : 1.1 + (e.id % 3) * .08;
      e.tell = 0; e.burstLeft = 0; e.goalPending = true; e.decision = 0;
    }

    function interruptAttacks() {
      if (!tactical) return;
      nextOpportunity = nextBurstStart = elapsed; opportunityCursor = 0;
      for (let i = 0; i < pool.length; i++) {
        const e = pool[i]; if (!e.alive) continue;
        if (e.attackPhase === 'tell' || e.attackPhase === 'burst') { e.attackPhase = 'idle'; e.cooldown = 0; }
        e.tell = e.burstLeft = e.flash = e.aimTime = 0;
        e.visible = false; e.decision = 0; e.forceFullTell = true;
        renderEnemy(e);
      }
      upload();
    }

    function updateTactical(dt, player) {
      dt = Math.max(0, Math.min(.1, Number(dt) || 0)); if (!dt) return;
      // Small steps preserve burst ordering and movement at 30/60/120 Hz without
      // queuing stale bullets. Every actual shot still checks the current world.
      const steps = Math.ceil(dt / (1 / 120)), step = dt / steps;
      for (let tick = 0; tick < steps; tick++) {
        elapsed += step;
        for (let i = 0; i < pool.length; i++) {
          const e = pool[i];
          if (!e.alive) {
            if (e.corpseRemaining > 0) { e.deathAge += step; e.corpseRemaining = Math.max(0, e.corpseRemaining - step); }
            continue;
          }
          e.age += step; e.flash = Math.max(0, e.flash - step); e.hitFlash = Math.max(0, e.hitFlash - step);
          e.recoil = Math.max(0, e.recoil - step * 8); e.stun = Math.max(0, e.stun - step);
          e.interruptImmune = Math.max(0, e.interruptImmune - step); e.heavyImmune = Math.max(0, e.heavyImmune - step);
          e.cooldown -= step; e.decision -= step; e.patrolTime -= step;
          e.goalTime -= step; e.holdTime = Math.max(0, e.holdTime - step);
          e.memoryTime = Math.max(0, e.memoryTime - step);
          if (e.memoryTime <= 0 && e.hasMemory) { e.hasMemory = false; e.alertSource = null; e.goalPending = true; e.decision = 0; e.coldTell = true; }
          if (!player || !player.position || !player.alive) { e.attackPhase = 'idle'; e.tell = 0; e.burstLeft = 0; e.visible = false; continue; }
          if (e.decision <= 0) tacticalDecision(e, player);
          const face = e.hasMemory ? Math.atan2(e.lastSeen.x - e.position.x, e.lastSeen.z - e.position.z) :
            e.moveScale > 0 ? e.moveAngle : e.anchorYaw + Math.sin(e.age * .7 + e.id) * .24;
          const turn = Math.atan2(Math.sin(face - e.yaw), Math.cos(face - e.yaw));
          e.yaw += turn * Math.min(1, step * 10);
          const preparing = e.attackPhase === 'tell' || e.attackPhase === 'burst';
          const amount = e.cfg.speed * step * e.moveScale * (e.attackPhase === 'burst' ? 0 : e.attackPhase === 'tell' ? .55 : 1) * (e.stun > 0 ? .2 : 1);
          let moved = amount > 0 && tryMove(e, e.moveAngle, amount);
          if (!moved && amount > 0) {
            for (let n = 1; n <= 3 && !moved; n++) moved = tryMove(e, e.moveAngle + e.avoid * n * .55, amount);
          }
          e.blockedTime = !moved && amount > 0 ? e.blockedTime + step : 0;
          if (e.blockedTime > .65) { e.goalPending = true; e.avoid *= -1; e.blockedTime = 0; }
          if (moved && elapsed >= e.nextFootstep) {
            e.nextFootstep = elapsed + .48 + (e.id % 3) * .03;
            if (ctx.onEnemyCue) ctx.onEnemyCue(e.position.clone(), 'step');
          }
          e.moving += ((moved ? 1 : 0) - e.moving) * Math.min(1, step * 10);
          e.phase += step * e.cfg.speed * (moved ? 3.6 : .8);
          if (preparing && !e.visible) { recover(e, true); continue; }
          if (e.attackPhase === 'recover' && e.cooldown <= 0) e.attackPhase = 'idle';
          if (e.attackPhase === 'tell') {
            e.tell = Math.max(0, e.tell - step);
            if (e.tell <= 0 && e.stun <= 0 && Math.abs(turn) < .2 && elapsed + 1e-8 >= nextBurstStart) {
              e.attackPhase = 'burst'; e.burstLeft = 3; e.cooldown = 0;
            }
          }
          if (e.attackPhase === 'burst' && e.cooldown <= 0 && e.stun <= 0 && player.alive) {
            if (!fire(e, player)) { recover(e, true); continue; }
            if (e.burstLeft === 3) nextBurstStart = elapsed + .2;
            e.burstLeft--;
            if (e.burstLeft <= 0) recover(e);
            else e.cooldown += .16;
          }
        }
        if (player && player.alive && elapsed + 1e-8 >= nextOpportunity) {
          const active = pool.reduce((sum, e) => sum + (e.alive && (e.attackPhase === 'tell' || e.attackPhase === 'burst') ? 1 : 0), 0);
          if (active < 2) {
            // Round-robin grants opportunities fairly; waiting soldiers never emit
            // fake harmless shots and successful bullets are never cancelled.
            for (let n = 0; n < pool.length; n++) {
              const index = (opportunityCursor + n) % pool.length, e = pool[index];
              if (!e.alive || !e.visible || e.attackPhase !== 'idle' || e.stun > 0 || e.holdTime > 0) continue;
              e.attackPhase = 'tell';
              e.tell = e.coldTell || e.forceFullTell ? (difficulty === 'hard' ? .44 + (e.id % 4) * .04 : .5 + (e.id % 4) * .06) :
                (difficulty === 'hard' ? .18 + (e.id % 3) * .05 : .22 + (e.id % 4) * .04);
              e.coldTell = e.forceFullTell = false;
              nextOpportunity = elapsed + .38; opportunityCursor = (index + 1) % pool.length;
              if (ctx.onEnemyCue) ctx.onEnemyCue(new THREE.Vector3(e.position.x, e.position.y + 1.5 * e.scale, e.position.z), 'prepare');
              break;
            }
          }
        }
      }
      for (let i = 0; i < pool.length; i++) renderEnemy(pool[i]);
      upload();
    }

    function update(dt, player) {
      if (tactical) { updateTactical(dt, player); return; }
      if (!player || !player.position || !player.alive) return;
      dt = Math.max(0, Math.min(.1, Number(dt) || 0)); if (!dt) return;
      elapsed += dt;
      for (let i = 0; i < pool.length; i++) {
        const e = pool[i]; if (!e.alive) continue;
        e.age += dt; e.flash = Math.max(0, e.flash - dt); e.hitFlash = Math.max(0, e.hitFlash - dt);
        e.recoil = Math.max(0, e.recoil - dt * 8); e.stun = Math.max(0, e.stun - dt);
        e.interruptImmune = Math.max(0, e.interruptImmune - dt); e.heavyImmune = Math.max(0, e.heavyImmune - dt);
        e.cooldown -= dt; e.decision -= dt; e.turnLock = Math.max(0, e.turnLock - dt);
        e.memoryTime = Math.max(0, e.memoryTime - dt); e.maneuver -= dt; e.patrolTime -= dt;
        if (!e.visible) e.searchAge += dt;
        if (e.memoryTime <= 0 && e.hasMemory) { e.hasMemory = false; e.moveScale = 0; e.decision = 0; }
        if (e.maneuver <= 0) { e.maneuver = 1.8 + random() * 2; if (e.type === 'rifle') e.strafe *= -1; }
        if (e.decision <= 0) decide(e, player);
        const face = e.hasMemory ? Math.atan2(e.lastSeen.x - e.position.x, e.lastSeen.z - e.position.z) : e.moveScale > 0 ? e.moveAngle : e.yaw;
        let turn = face - e.yaw; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        e.yaw += turn * Math.min(1, dt * 8);
        if (e.visible) { e.aimTime += dt; e.loseSight = 0; }
        else { e.loseSight += dt; if (e.loseSight > .45) e.aimTime = 0; }
        let moveAngle = e.moveAngle;
        if (!e.visible && !e.routeReady && e.turnLock > 0) moveAngle += e.turnAngle;
        const amount = e.cfg.speed * dt * e.moveScale * (e.stun > 0 ? .2 : 1);
        let moved = amount > 0 && tryMove(e, moveAngle, amount);
        if (!moved && amount > 0) {
          for (let step = 1; step <= 4 && !moved; step++) {
            const angle = moveAngle + e.avoid * step * .62;
            moved = tryMove(e, angle, amount);
            if (moved) { e.turnAngle = e.avoid * step * .62; e.turnLock = .8; }
          }
          if (!moved) { e.avoid *= -1; e.turnLock = 0; }
        }
        e.moving += ((moved ? 1 : 0) - e.moving) * Math.min(1, dt * 10);
        e.phase += dt * e.cfg.speed * (moved ? 3.6 : .8);
        // A fresh sighting always grants an aiming tell before the first incoming round.
        if (e.visible && e.aimTime >= (e.hasShot ? .65 : 1.65) && e.age >= 1.8 && e.cooldown <= 0 && e.stun <= 0 && Math.abs(turn) < .2) {
          if (fire(e, player)) e.cooldown = e.cfg.interval * (.9 + random() * .35);
          else e.cooldown = .22;
        }
        renderEnemy(e);
      }
      upload();
    }

    function unitBoxDistance(origin, dir) {
      let near = -Infinity, far = Infinity;
      for (let axis = 0; axis < 3; axis++) {
        const o = axis === 0 ? origin.x : axis === 1 ? origin.y : origin.z;
        const d = axis === 0 ? dir.x : axis === 1 ? dir.y : dir.z;
        if (Math.abs(d) < 1e-10) { if (o < -.5 || o > .5) return Infinity; continue; }
        let a = (-.5 - o) / d, b = (.5 - o) / d;
        if (a > b) { const tmp = a; a = b; b = tmp; }
        near = Math.max(near, a); far = Math.min(far, b);
        if (near > far || far < 0) return Infinity;
      }
      return near >= 0 ? near : far;
    }

    function raycast(origin, dir, max) {
      let nearest = Number.isFinite(max) ? max : Infinity, chosen = null, zone = null;
      direction.copy(dir).normalize();
      for (let i = 0; i < pool.length; i++) {
        const e = pool[i]; if (!e.alive) continue;
        const t = sphereDistance(origin, direction, e.head.x, e.head.y, e.head.z, .245 * e.scale);
        if (t < nearest) { nearest = t; chosen = e; zone = 'head'; }
        // A broad phase excludes enemies far away from this bullet before transforming limbs.
        const centerY = e.position.y + 1.02 * e.scale;
        if (!Number.isFinite(sphereDistance(origin, direction, e.position.x, centerY, e.position.z, 1.15 * e.scale))) continue;
        for (let j = 0; j < e.hitboxes.length; j++) {
          const box = e.hitboxes[j];
          rayOrigin.copy(origin).applyMatrix4(box.inverse);
          rayDirection.copy(direction).transformDirection(box.inverse);
          const localDistance = unitBoxDistance(rayOrigin, rayDirection);
          if (!Number.isFinite(localDistance)) continue;
          hitPoint.copy(rayOrigin).addScaledVector(rayDirection, localDistance).applyMatrix4(box.matrix);
          const distance = hitPoint.distanceTo(origin);
          if (distance < nearest) { nearest = distance; chosen = e; zone = box.zone; }
        }
      }
      if (!chosen) return null;
      hitPoint.copy(origin).addScaledVector(direction, nearest);
      return { id: chosen.id, zone: zone, distance: nearest, point: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z } };
    }

    function damage(id, zone, amount, metadata) {
      const e = pool.find(enemy => enemy.id === id && enemy.alive);
      if (!e || !Number.isFinite(amount) || amount < 0) return { hit: false, killed: false };
      const heavyKnife = !!metadata && metadata.kind === 'knife' && metadata.mode === 'heavy';
      const origin = metadata && metadata.origin;
      const validOrigin = origin && [origin.x, origin.y, origin.z].every(Number.isFinite);
      let backstab = false;
      if (heavyKnife && validOrigin) {
        // The host already confirmed range and cover at blade contact. Use the
        // current attacker location and defender facing, never the press-time
        // pose or the direction of one ray in the knife's small hit fan.
        const dx = origin.x - e.position.x, dz = origin.z - e.position.z, distance = Math.hypot(dx, dz);
        // Rear 120-degree cone: within 60 degrees either side of straight back.
        backstab = distance > 1e-6 && (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / distance <= -.5 + 1e-9;
      }
      if (amount === 0 && !backstab) return { hit: false, killed: false };
      let armorHit = false, armorBreak = false;
      const impact = metadata && metadata.direction;
      if (tactical && validOrigin) {
        // Deliver the contact before damage/death so a first lethal hit still alerts
        // the victim's local team, including at ranges beyond ordinary hearing.
        contact(e, origin, 'damage'); shareContact(e, e.lastSeen);
      } else if (tactical) { e.goalPending = true; e.decision = 0; }
      if (!backstab && tactical && e.type === 'heavy') {
        if (zone === 'head' && e.helmet) {
          e.helmet = false; armorHit = armorBreak = true; amount = 0;
        } else if (zone === 'upper' && impact && Number.isFinite(impact.x) && Number.isFinite(impact.z)) {
          const length = Math.hypot(impact.x, impact.z);
          // Direction is bullet travel, so a frontal incoming round points opposite facing.
          const facing = length > 1e-6 ? -(impact.x * Math.sin(e.yaw) + impact.z * Math.cos(e.yaw)) / length : 0;
          if (facing > .45) { amount *= .45; armorHit = true; }
        }
      }
      // An execution is a death decision, independent of base damage or zone
      // multipliers. Still report actual HP removed and use the one death path.
      const dealt = backstab ? e.hp : Math.min(e.hp, amount);
      e.hp = backstab ? 0 : Math.max(0, e.hp - amount); e.hitFlash = .17;
      if (heavyKnife && e.heavyImmune <= 0) {
        e.stun = .26; e.heavyImmune = .8; e.interruptImmune = .8;
      } else if (!heavyKnife && e.interruptImmune <= 0) {
        e.stun = .12; e.interruptImmune = .65;
      }
      if (ctx.onHit) ctx.onHit(e, zone, dealt);
      const killed = e.hp <= 0;
      if (killed) {
        e.alive = false; kills++;
        if (tactical) {
          e.attackPhase = 'dead'; e.tell = e.burstLeft = e.flash = e.moving = 0;
          e.corpseRemaining = 3; e.deathAge = 0;
          const dx = impact && Number.isFinite(impact.x) ? impact.x : Math.sin(e.yaw);
          const dz = impact && Number.isFinite(impact.z) ? impact.z : Math.cos(e.yaw);
          const length = Math.hypot(dx, dz) || 1; e.deathX = dx / length; e.deathZ = dz / length;
          const corpses = pool.filter(other => !other.alive && other.corpseRemaining > 0).sort((a, b) => b.deathAge - a.deathAge || a.id - b.id);
          while (corpses.length > 6) { const oldest = corpses.shift(); oldest.corpseRemaining = 0; renderEnemy(oldest); }
        }
        renderEnemy(e); upload();
        if (ctx.onKill) ctx.onKill(e, zone);
      } else if (tactical) { renderEnemy(e); upload(); }
      return { hit: true, killed: killed, id: e.id, type: e.type, zone: zone, damage: dealt, hp: e.hp, maxHp: e.maxHp,
        armorHit: armorHit, armorBreak: armorBreak, backstab: backstab };
    }

    function stats() {
      let alive = 0, scouts = 0, rifles = 0, heavies = 0, elites = 0;
      for (let i = 0; i < pool.length; i++) if (pool[i].alive) {
        alive++; if (pool[i].elite) elites++;
        if (pool[i].type === 'scout') scouts++; else if (pool[i].type === 'rifle') rifles++; else heavies++;
      }
      return { alive: alive, wave: wave, kills: kills, shots: shots, hits: hits, capacity: CAPACITY, drawCalls: 3,
        planned: pendingPlan ? pendingPlan.plan.length : 0, plannedWave: pendingPlan ? pendingPlan.wave : 0,
        scouts: scouts, rifles: rifles, heavies: heavies, elites: elites, activeLimit: ACTIVE_LIMIT,
        sightChecks: sightChecks, huntStage: threatStage, difficulty: difficulty,
        attackers: pool.filter(e => e.alive && (e.attackPhase === 'tell' || e.attackPhase === 'burst')).length,
        corpses: pool.filter(e => !e.alive && e.corpseRemaining > 0).length };
    }

    function getTargets() {
      return pool.filter(e => e.id > 0).map(e => ({ id: e.id, type: e.type, hp: e.hp, maxHp: e.maxHp,
        position: [e.position.x, e.position.y, e.position.z], head: [e.head.x, e.head.y, e.head.z], alive: e.alive,
        elite: e.elite, role: e.role, stun: e.stun, interruptImmune: e.interruptImmune,
        damage: e.cfg.damage, interval: e.cfg.interval, sight: e.visible, hasMemory: e.hasMemory,
        memoryTime: e.memoryTime, lastSeen: [e.lastSeen.x, e.lastSeen.y, e.lastSeen.z],
        yaw: e.yaw, anchor: [e.anchor.x, e.anchor.y, e.anchor.z], attackPhase: e.attackPhase, tell: e.tell,
        alerted: e.hasMemory, alertSource: e.alertSource, tactic: e.goalKind, goal: [e.goal.x, e.goal.y, e.goal.z], shotsFired: e.shotIndex,
        helmet: e.helmet, corpseRemaining: e.corpseRemaining }));
    }

    if (ctx.scene) ctx.scene.add(group);
    reset();
    return { group: group, reset: reset, planWave: planWave, spawnPlanned: spawnPlanned, spawnWave: spawnWave, update: update, raycast: raycast, damage: damage,
      stats: stats, getTargets: getTargets, setThreat: setThreat, spawnEncounter: spawnEncounter, interruptAttacks: interruptAttacks,
      hearPlayerShot: hearPlayerShot, hearPlayerFootstep: hearPlayerFootstep };
  }

  globalThis.createEnemies = createEnemies;
})();

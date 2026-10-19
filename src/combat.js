/* Pure combat state and collision math. No rendering or browser dependencies. */
(function () {
  'use strict';
  const EPS = 1e-8;
  const MAX_LEVEL = 20;
  const RESERVE_MAX = 180;
  const SLOTS = ['primary', 'secondary', 'knife'];
  const SWITCH_TIME = 0.2;
  const HEALTH_DROP_CHANCE = 0.3;
  const HEALTH_DROP_AMOUNT = 30;
  const TACTICAL_RUN_SPEED = 5.8;
  const STILL_SPEED = TACTICAL_RUN_SPEED * .1;
  const RECOIL_DELAY = .14;
  const BURST_RESET_TIME = .35;
  const LEVEL_THRESHOLDS = Object.freeze([0, 3, 6, 9, 12, 18, 24, 30, 36, 42, 52, 62, 72, 82, 92, 107, 122, 137, 152, 167]);
  function normalizeDifficulty(value) { return value === 'hard' ? 'hard' : 'standard'; }
  function boundedInteger(value, fallback, min, max) {
    return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : fallback)));
  }

  // XP is expressed in kills. These thresholds preserve quick early upgrades,
  // then space out both weapon growth and the full-health upgrade reward.
  function progression(kills) {
    const total = boundedInteger(kills, 0, 0, Number.MAX_SAFE_INTEGER);
    let level = 1;
    while (level < MAX_LEVEL && total >= LEVEL_THRESHOLDS[level]) level++;
    if (level === MAX_LEVEL) return { level: level, current: 0, required: 0, ratio: 1, total: total, nextAt: null };
    const current = total - LEVEL_THRESHOLDS[level - 1];
    const required = LEVEL_THRESHOLDS[level] - LEVEL_THRESHOLDS[level - 1];
    return { level: level, current: current, required: required, ratio: current / required, total: total, nextAt: LEVEL_THRESHOLDS[level] };
  }

  // Multipliers apply to each enemy's base stats, never to already-scaled stats.
  // Wave growth is deliberately mild; hunt stages raise the threat after level 20.
  // Numerical caps keep endless sessions from creating unkillable bullet sponges.
  function enemyScaling(wave = 1, huntStage = 0, difficulty = 'standard') {
    const waves = Math.min(24, boundedInteger(wave, 1, 1, 1000) - 1);
    const hunt = boundedInteger(huntStage, 0, 0, 1000);
    const hard = normalizeDifficulty(difficulty) === 'hard' ? 1 : 0;
    return {
      hp: Math.min(1.5, 1 + waves * .012 + hunt * .055 + hard * .06),
      damage: Math.min(1.8, 1 + waves * .018 + hunt * .09 + hard * .12),
      interval: Math.max(.75, 1 - waves * .004 - hunt * .022 - hard * .025),
      eliteChance: Math.min(.5, waves * .01 + hunt * .07 + hard * .05)
    };
  }
  // Input and contact use fixed profiles; the authored viewmodel curves mirror
  // these timings. Both buttons use the same knife cooldown and cover rules.
  const KNIFE_ATTACKS = Object.freeze({
    light: Object.freeze({ mode: 'light', damage: 80, range: 2.7, cooldown: .6, hitDelay: .12, duration: .52, fan: .10 }),
    heavy: Object.freeze({ mode: 'heavy', damage: 145, range: 2.7, cooldown: 1.05, hitDelay: .28, duration: .95, fan: .075 })
  });
  function knifeAttack(mode) { return KNIFE_ATTACKS[mode === 'heavy' ? 'heavy' : 'light']; }
  // Seconds/metres throughout. Enemy guns intentionally differ in cadence and reach.
  const ENEMY_TYPES = Object.freeze({
    scout: Object.freeze({ name: '侦察兵', weapon: 'SMG', hp: 60, speed: 3.2, damage: 5, fireInterval: 0.6, range: 65, score: 100, drop: 22 }),
    rifle: Object.freeze({ name: '突击兵', weapon: 'RIFLE', hp: 100, speed: 2.3, damage: 9, fireInterval: 0.85, range: 85, score: 160, drop: 30 }),
    heavy: Object.freeze({ name: '重装兵', weapon: 'LMG', hp: 190, speed: 1.4, damage: 16, fireInterval: 1.5, range: 55, score: 260, drop: 42 })
  });

  function weaponAt(level, slot = 'primary') {
    level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 1)));
    const n = level - 1;
    if (slot === 'knife') return {
      level: level, name: 'K-01 KNIFE', slot: 'knife', kind: 'knife', automatic: false,
      canADS: false, range: 2.7, moveMultiplier: 1.3, damage: KNIFE_ATTACKS.light.damage, rpm: 100,
      recoil: 0, spread: 0, magSize: 0, reloadTime: 0, reserveMax: 0
    };
    if (slot === 'secondary') return {
      level: level, name: 'P-' + String(level).padStart(2, '0'), slot: 'secondary',
      kind: 'gun', automatic: false, canADS: true, range: 180, moveMultiplier: 1,
      damage: 34 + n * 1.5, rpm: 260 + n * 6,
      recoil: Math.max(.012, .023 * Math.pow(.97, n)),
      spread: Math.max(.001, .00225 * Math.pow(.98, n)),
      magSize: 12 + 2 * Math.floor(n / 4),
      reloadTime: Math.max(1.15, 1.45 - n * .015), reserveMax: 96
    };
    return {
      level: level, name: 'R-' + String(level).padStart(2, '0'),
      slot: 'primary', kind: 'gun', automatic: true, canADS: true, range: 300, moveMultiplier: 1,
      damage: 23 + n * 2,
      rpm: 420 + n * 14,
      recoil: Math.max(0.006, 0.016 * Math.pow(0.955, n)),
      spread: Math.max(0.001, 0.003 * Math.pow(0.97, n)),
      magSize: 24 + 2 * Math.floor(n / 2),
      reloadTime: Math.max(1.15, 1.7 - n * 0.025),
      reserveMax: RESERVE_MAX
    };
  }

  function tacticalWeapon(slot) {
    const weapon = weaponAt(1, slot);
    if (slot === 'knife') return Object.assign(weapon, { adsTime: 0, switchTime: .22, emptyReloadTime: 0 });
    return Object.assign(weapon, slot === 'secondary' ? {
      name: 'P-50', damage: 50, rpm: 240, magSize: 8, headMultiplier: 2,
      recoil: .014, spread: .003, adsSpread: .00045, adsTime: .12,
      switchTime: .22, reloadTime: 1.15, emptyReloadTime: 1.45, reserveMax: 64
    } : {
      name: 'R-40', damage: 40, rpm: 480, magSize: 20, headMultiplier: 3,
      recoil: .009, spread: .00225, adsSpread: .000325, adsTime: .18,
      switchTime: .38, reloadTime: 1.6, emptyReloadTime: 2, reserveMax: 160
    });
  }

  function createState(difficulty = 'standard', mode = 'survival') {
    const tactical = mode === 'tactical';
    const state = {
      hp: 100, maxHp: 100, score: 0, kills: 0, headshots: 0,
      difficulty: normalizeDifficulty(difficulty), healthDropMisses: 0, tactical: tactical,
      level: 1, activeSlot: 'primary', switchCooldown: 0, reloadLeft: 0, reloadDuration: 0, dead: false,
      loadout: {
        primary: { weapon: weaponAt(1), ammo: 24, reserve: 96, fireCooldown: 0 },
        secondary: { weapon: weaponAt(1, 'secondary'), ammo: 12, reserve: 48, fireCooldown: 0 },
        knife: { weapon: weaponAt(1, 'knife'), ammo: 0, reserve: 0, fireCooldown: 0 }
      }
    };
    if (tactical) {
      for (const slot of SLOTS) {
        const weapon = tacticalWeapon(slot);
        state.loadout[slot] = {
          weapon: weapon, ammo: weapon.magSize, reserve: slot === 'primary' ? 140 : slot === 'secondary' ? 48 : 0,
          fireCooldown: 0, shotsInBurst: 0, shotAge: BURST_RESET_TIME, bloom: 0
        };
      }
      state.handling = {
        adsBlend: 0, stillTime: 0, speed: 0, grounded: true, sprinting: false,
        recoilPitch: 0, recoilYaw: 0, shotAge: BURST_RESET_TIME, pendingKick: null,
        recovery: { pitch: 0, yaw: 0 }
      };
    }
    // Preserve the old flat read/write API as enumerable live views. The host and
    // HUD can still use state.ammo, while each slot owns its actual inventory/CD.
    for (const key of ['weapon', 'ammo', 'reserve', 'fireCooldown']) {
      Object.defineProperty(state, key, {
        enumerable: true,
        get() { return this.loadout[this.activeSlot][key]; },
        set(value) { this.loadout[this.activeSlot][key] = value; }
      });
    }
    Object.defineProperty(state, 'reserveMax', {
      enumerable: true,
      get() { return this.weapon.reserveMax; },
      set(value) { this.weapon.reserveMax = value; }
    });
    return state;
  }

  function switchWeapon(state, slot) {
    if (state.dead || state.hp <= 0 || !SLOTS.includes(slot) || slot === state.activeSlot) return false;
    // No pending reload can finish into a different gun after switching.
    state.reloadLeft = 0;
    state.reloadDuration = 0;
    state.activeSlot = slot;
    state.switchCooldown = state.tactical ? state.weapon.switchTime : SWITCH_TIME;
    if (state.tactical) {
      state.handling.adsBlend = 0;
      state.handling.pendingKick = null;
      for (const name of SLOTS) state.loadout[name].fireCooldown = Math.max(0, state.loadout[name].fireCooldown);
    }
    return true;
  }

  // Host calls once after movement and before firing. Recovery is an angular
  // delta, not an absolute look angle: add it to pitch/yaw to preserve mouse aim.
  // Splitting a frame at the recoil delay gives the same recovery at any rate.
  function tickHandling(state, dt, input = {}) {
    if (!state.tactical) return state;
    const h = state.handling;
    h.recovery.pitch = h.recovery.yaw = 0;
    if (state.dead || !(state.hp > 0) || !Number.isFinite(dt) || dt <= 0) return state;
    h.speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;
    h.grounded = input.grounded !== false;
    h.sprinting = !!input.sprinting;
    const still = h.grounded && !h.sprinting && h.speed <= STILL_SPEED;
    h.stillTime = still ? Math.min(10, h.stillTime + dt) : 0;
    const canAim = state.weapon.canADS && !h.sprinting && state.switchCooldown <= EPS && state.reloadLeft <= EPS;
    if (!canAim) h.adsBlend = 0;
    else h.adsBlend = Math.max(0, Math.min(1, h.adsBlend + (input.ads ? 1 : -1) * dt / state.weapon.adsTime));
    const recoveryTime = Math.max(0, h.shotAge + dt - RECOIL_DELAY) - Math.max(0, h.shotAge - RECOIL_DELAY);
    h.shotAge = Math.min(10, h.shotAge + dt);
    const recoilDecay = Math.exp(-12 * recoveryTime);
    h.recovery.pitch = h.recoilPitch * (recoilDecay - 1);
    h.recovery.yaw = h.recoilYaw * (recoilDecay - 1);
    h.recoilPitch *= recoilDecay;
    h.recoilYaw *= recoilDecay;
    for (const slot of SLOTS) {
      const item = state.loadout[slot];
      const recover = Math.max(0, item.shotAge + dt - RECOIL_DELAY) - Math.max(0, item.shotAge - RECOIL_DELAY);
      item.shotAge = Math.min(10, item.shotAge + dt);
      item.bloom *= Math.exp(-12 * recover);
      if (item.shotAge >= BURST_RESET_TIME - EPS) item.shotsInBurst = 0;
    }
    return state;
  }

  function accuracy(state) {
    if (!state.tactical) return { spread: state.weapon.spread, stable: true, adsBlend: 0 };
    const h = state.handling, item = state.loadout[state.activeSlot], weapon = item.weapon;
    const stable = h.grounded && !h.sprinting && h.speed <= STILL_SPEED && state.switchCooldown <= EPS && state.reloadLeft <= EPS;
    if (weapon.kind === 'knife') return { spread: 0, stable: stable, adsBlend: 0 };
    const aimed = weapon.spread + (weapon.adsSpread - weapon.spread) * h.adsBlend;
    // The low-speed crossing is a real firing window, not another 80 ms wait.
    // ADS transition, airborne penalty, bloom and recoil still apply normally.
    const motion = .02 * Math.min(1.7, Math.max(0, (h.speed - STILL_SPEED) / (TACTICAL_RUN_SPEED - STILL_SPEED)));
    return { spread: aimed + motion + (!h.grounded ? .025 : 0) + (h.sprinting ? .025 : 0) + item.bloom, stable: stable, adsBlend: h.adsBlend };
  }

  // The yaw sequence is authored rather than sampled. The first three rounds
  // stay near the centre; holding the trigger increases climb and lateral kick.
  function queueShotKick(state) {
    const item = state.loadout[state.activeSlot], h = state.handling;
    const index = item.shotsInBurst++, gain = 1 + Math.min(index, 7) * .16;
    const yawPattern = [0.12, -0.12, 0.18, 0.32, -0.4, -0.5, 0.35, 0.5];
    const aimScale = 1 + (1 - h.adsBlend) * .25;
    h.pendingKick = {
      pitch: item.weapon.recoil * gain * aimScale,
      yaw: item.weapon.recoil * yawPattern[index % yawPattern.length] * aimScale
    };
    item.shotAge = 0;
    item.bloom = Math.min(.007, item.bloom + .0007);
  }

  // Consume only after tryFire succeeds. Positive pitch looks up; positive yaw
  // turns left in FPSPlayer. The host applies this to the actual aim, then adds
  // handling.recovery each tick; no additional camera-only recoil is needed.
  function shotKick(state) {
    if (!state.tactical || state.dead || !state.handling.pendingKick) return { pitch: 0, yaw: 0 };
    const h = state.handling, kick = h.pendingKick;
    h.pendingKick = null;
    h.recoilPitch += kick.pitch;
    h.recoilYaw += kick.yaw;
    h.shotAge = 0;
    return kick;
  }

  function tick(state, dt, options = {}) {
    if (state.dead || !Number.isFinite(dt) || dt <= 0) return state;
    // Preserve only the boundary remainder of uninterrupted automatic fire.
    // A zero cooldown is idle, not a bank of missed shots. Reload/switch/sprint
    // and inactive guns never receive credit. Long stalls cannot queue a burst.
    const heldAutomatic = state.tactical && options.firing === true && state.weapon.automatic && state.ammo > 0 &&
      state.switchCooldown <= EPS && state.reloadLeft <= EPS && !state.handling.sprinting;
    state.switchCooldown = Math.max(0, state.switchCooldown - dt);
    for (const slot of SLOTS) {
      const item = state.loadout[slot];
      const carry = heldAutomatic && slot === state.activeSlot && item.fireCooldown > EPS;
      const floor = carry ? -Math.min(dt, 30 / item.weapon.rpm) : 0;
      item.fireCooldown = Math.max(floor, item.fireCooldown - dt);
    }
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft <= EPS) {
        state.reloadLeft = 0;
        const transfer = Math.min(state.reserve, Math.max(0, state.weapon.magSize - state.ammo));
        state.ammo += transfer;
        state.reserve -= transfer;
      }
    }
    return state;
  }

  function tryFire(state, mode = 'light') {
    if (state.dead || state.hp <= 0 || state.switchCooldown > EPS || state.reloadLeft > 0 || state.fireCooldown > EPS) return false;
    if (state.tactical && state.handling.sprinting && state.weapon.kind !== 'knife') return false;
    if (state.weapon.kind !== 'knife') {
      if (state.ammo <= 0) return false;
      state.ammo -= 1;
    }
    const carry = state.tactical && state.weapon.automatic ? Math.min(0, state.fireCooldown) : 0;
    state.fireCooldown = state.weapon.kind === 'knife' ? knifeAttack(mode).cooldown : 60 / state.weapon.rpm + carry;
    if (state.tactical && state.weapon.kind !== 'knife') queueShotKick(state);
    return true;
  }

  function startReload(state) {
    if (state.dead || state.hp <= 0 || state.weapon.kind === 'knife' || state.switchCooldown > EPS || state.reloadLeft > 0 || state.reserve <= 0 || state.ammo >= state.weapon.magSize) return false;
    state.reloadLeft = state.tactical && state.ammo === 0 ? state.weapon.emptyReloadTime : state.weapon.reloadTime;
    state.reloadDuration = state.reloadLeft;
    state.fireCooldown = Math.max(0, state.fireCooldown);
    if (state.tactical) state.handling.adsBlend = 0;
    return true;
  }

  // Pause/lifecycle cancellation does not refill a magazine or erase a positive
  // shot/switch cooldown. Host input queues and pending melee remain host-owned.
  function interrupt(state) {
    state.reloadLeft = state.reloadDuration = 0;
    for (const slot of SLOTS) state.loadout[slot].fireCooldown = Math.max(0, state.loadout[slot].fireCooldown);
    if (state.tactical) {
      const h = state.handling;
      h.adsBlend = 0;
      h.sprinting = false;
      h.pendingKick = null;
      h.recovery.pitch = h.recovery.yaw = 0;
    }
    return state;
  }

  // One shared pickup fills the held gun first, then the other gun. A knife has
  // no ammunition, so it uses primary-first order. Return the TOTAL accepted.
  function addAmmo(state, amount) {
    if (state.dead || state.hp <= 0 || !Number.isFinite(amount) || amount <= 0) return 0;
    const first = state.activeSlot === 'secondary' ? 'secondary' : 'primary';
    const second = first === 'primary' ? 'secondary' : 'primary';
    let remaining = Math.floor(amount), accepted = 0;
    for (const slot of [first, second]) {
      const item = state.loadout[slot];
      const transfer = Math.max(0, Math.min(remaining, item.weapon.reserveMax - item.reserve));
      item.reserve += transfer;
      remaining -= transfer;
      accepted += transfer;
    }
    return accepted;
  }

  function healPlayer(state, amount) {
    if (state.dead || !Number.isFinite(state.hp) || state.hp <= 0 ||
        !Number.isFinite(state.maxHp) || !Number.isFinite(amount) || amount <= 0) return 0;
    const recovered = Math.max(0, Math.min(amount, state.maxHp - state.hp));
    state.hp += recovered;
    return recovered;
  }

  function rollHealthDrop(random = Math.random) {
    const sample = random();
    return Number.isFinite(sample) && sample >= 0 && sample < HEALTH_DROP_CHANCE ? HEALTH_DROP_AMOUNT : 0;
  }

  // Called once for a confirmed death. Standard retains its original economy;
  // hard mode bounds dry health streaks to six kills before a guaranteed pack.
  function lootForKill(state, type, random = Math.random) {
    const config = ENEMY_TYPES[type];
    if (!state || state.dead || !(state.hp > 0) || !config || state.tactical) return { ammo: 0, health: 0 };
    const hard = normalizeDifficulty(state.difficulty) === 'hard';
    const misses = boundedInteger(state.healthDropMisses, 0, 0, 6);
    const sample = random();
    const rolled = Number.isFinite(sample) && sample >= 0 && sample < (hard ? .2 : HEALTH_DROP_CHANCE);
    const health = rolled || (hard && misses >= 6) ? HEALTH_DROP_AMOUNT : 0;
    state.healthDropMisses = health ? 0 : Math.min(6, misses + 1);
    const ammo = hard ? (type === 'scout' ? 6 : type === 'heavy' ? 12 : 9) : config.drop;
    return { ammo: ammo, health: health };
  }

  function zoneMultiplier(zone, weapon) {
    return zone === 'head' ? (weapon && Number.isFinite(weapon.headMultiplier) ? weapon.headMultiplier : 3) : zone === 'legs' ? 0.55 : 1;
  }

  // Kills award XP and score. Ammunition is earned by collecting the enemy's drop.
  // A head kill adds 50% score; upgrade capacity never creates free ammunition.
  function registerKill(state, type, zone) {
    const config = ENEMY_TYPES[type];
    if (state.dead || state.hp <= 0 || !config) return { upgraded: false, level: state.level, points: 0 };
    const head = zone === 'head';
    const points = config.score + (head ? Math.round(config.score * 0.5) : 0);
    state.kills += 1;
    state.headshots += head ? 1 : 0;
    state.score += points;
    if (state.tactical) return { upgraded: false, level: state.level, points: points };
    const level = progression(state.kills).level;
    const upgraded = level > state.level;
    if (upgraded) {
      state.level = level;
      for (const slot of SLOTS) {
        const item = state.loadout[slot];
        item.weapon = weaponAt(level, slot);
        item.ammo = Math.min(item.ammo, item.weapon.magSize);
        item.reserve = Math.min(item.reserve, item.weapon.reserveMax);
      }
      // Recovery belongs only to this real level transition, never to a kill at
      // maximum level or a death/settlement update. Upgrades do not grant ammo.
      state.hp = state.maxHp;
    }
    return { upgraded: upgraded, level: state.level, points: points };
  }

  function damagePlayer(state, amount) {
    if (state.dead || !Number.isFinite(amount) || amount <= 0) return { applied: 0, died: false };
    const applied = Math.min(state.hp, amount);
    state.hp = Math.max(0, state.hp - applied);
    const died = state.hp === 0;
    if (died) {
      state.dead = true;
      state.reloadLeft = 0;
      state.reloadDuration = 0;
      state.switchCooldown = 0;
      if (state.tactical) {
        state.handling.adsBlend = 0;
        state.handling.pendingKick = null;
        state.handling.recovery.pitch = state.handling.recovery.yaw = 0;
      }
      for (const slot of SLOTS) state.loadout[slot].fireCooldown = 0;
    }
    return { applied: applied, died: died };
  }

  // Ray direction is expected to be normalized; results are forward distances or null.
  // An origin already inside a solid is obstructed at distance zero.
  function raySphere(origin, dir, center, radius, max) {
    if (max === undefined) max = Infinity;
    if (!(radius > 0) || !(max >= 0)) return null;
    const ox = origin.x - center.x, oy = origin.y - center.y, oz = origin.z - center.z;
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    if (c <= EPS) return 0;
    const a = dir.x * dir.x + dir.y * dir.y + dir.z * dir.z;
    if (a <= EPS) return null;
    const b = ox * dir.x + oy * dir.y + oz * dir.z;
    const discriminant = b * b - a * c;
    if (discriminant < 0) return null;
    const t = (-b - Math.sqrt(discriminant)) / a;
    return t >= 0 && t <= max ? t : null;
  }

  // c.y is the BASE; c.height is the finite vertical height. Both caps are solid.
  function rayCylinder(origin, dir, c, max) {
    if (max === undefined) max = Infinity;
    if (!(c.r > 0) || !(c.height > 0) || !(max >= 0)) return null;
    const ox = origin.x - c.x, oz = origin.z - c.z;
    const bottom = c.y, top = bottom + c.height, radiusSq = c.r * c.r;
    const radial = ox * ox + oz * oz;
    if (radial <= radiusSq + EPS && origin.y >= bottom - EPS && origin.y <= top + EPS) return 0;
    let nearest = Infinity;
    const a = dir.x * dir.x + dir.z * dir.z;
    if (a > EPS) {
      const b = ox * dir.x + oz * dir.z;
      const discriminant = b * b - a * (radial - radiusSq);
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        const t0 = (-b - root) / a;
        const t1 = (-b + root) / a;
        if (t0 >= 0 && t0 <= max) {
          const y = origin.y + dir.y * t0;
          if (y >= bottom - EPS && y <= top + EPS) nearest = t0;
        }
        if (t1 >= 0 && t1 <= max && t1 < nearest) {
          const y = origin.y + dir.y * t1;
          if (y >= bottom - EPS && y <= top + EPS) nearest = t1;
        }
      }
    }
    if (Math.abs(dir.y) > EPS) {
      const t0 = (bottom - origin.y) / dir.y;
      const t1 = (top - origin.y) / dir.y;
      if (t0 >= 0 && t0 <= max && t0 < nearest) {
        const x = ox + dir.x * t0, z = oz + dir.z * t0;
        if (x * x + z * z <= radiusSq + EPS) nearest = t0;
      }
      if (t1 >= 0 && t1 <= max && t1 < nearest) {
        const x = ox + dir.x * t1, z = oz + dir.z * t1;
        if (x * x + z * z <= radiusSq + EPS) nearest = t1;
      }
    }
    return nearest === Infinity ? null : nearest;
  }

  // Exact slab intersection for walls/crates. y is the base; hx/hz are half
  // extents. The optional broad-phase radius must never fill real corner gaps.
  function rayBox(origin, dir, c, max = Infinity) {
    if (!(max >= 0) || !(c.hx > 0) || !(c.hz > 0) || !(c.height > 0) ||
        !Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z) ||
        !Number.isFinite(c.hx) || !Number.isFinite(c.hz) || !Number.isFinite(c.height)) return null;
    let near = 0, far = max;
    for (let axis = 0; axis < 3; axis++) {
      const value = axis === 0 ? origin.x : axis === 1 ? origin.y : origin.z;
      const direction = axis === 0 ? dir.x : axis === 1 ? dir.y : dir.z;
      const lo = axis === 0 ? c.x - c.hx : axis === 1 ? c.y : c.z - c.hz;
      const hi = axis === 0 ? c.x + c.hx : axis === 1 ? c.y + c.height : c.z + c.hz;
      if (!Number.isFinite(value) || !Number.isFinite(direction) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
      if (Math.abs(direction) < EPS) {
        if (value < lo - EPS || value > hi + EPS) return null;
      } else {
        const a = (lo - value) / direction, b = (hi - value) / direction;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
        if (near > far + EPS) return null;
      }
    }
    return near <= max ? near : null;
  }

  function terrainNormal(world, x, z) {
    const dx = (world.height(x + 0.1, z) - world.height(x - 0.1, z)) * 5;
    const dz = (world.height(x, z + 0.1) - world.height(x, z - 0.1)) * 5;
    const length = Math.sqrt(dx * dx + 1 + dz * dz);
    return { x: -dx / length, y: 1 / length, z: -dz / length };
  }

  // Traverse crossed grid cells, solving the ray against their two triangle planes.
  // This catches grazing ridge contacts that fixed-distance samples can jump over.
  // Outside the finite field, coordinates clamp exactly as world.height does.
  function rayHeightfield(origin, dir, max, world) {
    const n = world.n, step = world.step, heights = world.heights, half = world.size * .5;
    const dx = dir.x, dz = dir.z, dy = dir.y, ox = origin.x, oz = origin.z, oy = origin.y;
    let start = 0;
    // A straight segment crosses at most n boundaries on each horizontal axis.
    for (let iteration = 0; iteration < n * 2 + 8 && start < max; iteration++) {
      const x = ox + dx * start, z = oz + dz * start;
      const cx = Math.max(-half, Math.min(half, x)), cz = Math.max(-half, Math.min(half, z));
      let gx = (cx + half) / step, gz = (cz + half) / step;
      const rx = Math.round(gx), rz = Math.round(gz);
      if (Math.abs(gx - rx) < 1e-9) gx = rx;
      if (Math.abs(gz - rz) < 1e-9) gz = rz;
      const ix = Math.max(0, Math.min(n - 1, Math.floor(gx) - (dx < 0 && gx === Math.floor(gx) ? 1 : 0)));
      const iz = Math.max(0, Math.min(n - 1, Math.floor(gz) - (dz < 0 && gz === Math.floor(gz) ? 1 : 0)));
      let nextX = Infinity, nextZ = Infinity;
      if (dx > 0) {
        if (x < -half) nextX = (-half - ox) / dx;
        else if (x < half) nextX = (-half + (ix + 1) * step - ox) / dx;
      } else if (dx < 0) {
        if (x > half) nextX = (half - ox) / dx;
        else if (x > -half) nextX = (-half + ix * step - ox) / dx;
      }
      if (dz > 0) {
        if (z < -half) nextZ = (-half - oz) / dz;
        else if (z < half) nextZ = (-half + (iz + 1) * step - oz) / dz;
      } else if (dz < 0) {
        if (z > half) nextZ = (half - oz) / dz;
        else if (z > -half) nextZ = (-half + iz * step - oz) / dz;
      }
      const end = Math.min(max, nextX, nextZ), duration = Math.max(0, end - start);
      const effectiveDX = x < -half || x > half || (x <= -half && dx < 0) || (x >= half && dx > 0) ? 0 : dx;
      const effectiveDZ = z < -half || z > half || (z <= -half && dz < 0) || (z >= half && dz > 0) ? 0 : dz;
      const u = (cx + half - ix * step) / step, v = (cz + half - iz * step) / step;
      const du = effectiveDX / step, dv = effectiveDZ / step;
      const index = iz * (n + 1) + ix;
      const a = heights[index], b = heights[index + 1], c = heights[index + n + 1], d = heights[index + n + 2];
      let nearest = Infinity;
      for (let triangle = 0; triangle < 2; triangle++) {
        const slopeU = triangle === 0 ? b - a : d - c;
        const slopeV = triangle === 0 ? c - a : d - b;
        const intercept = triangle === 0 ? a : b + c - d;
        const gap = oy + dy * start - (intercept + slopeU * u + slopeV * v);
        const rate = dy - slopeU * du - slopeV * dv;
        let local;
        if (Math.abs(rate) > 1e-12) local = -gap / rate;
        else {
          if (Math.abs(gap) > EPS) continue;
          local = 0;
          const sum = u + v, sumRate = du + dv;
          // Coplanar rays may first enter this triangle at the cell's diagonal.
          if (triangle === 0 && sum > 1 + EPS) {
            if (sumRate >= 0) continue;
            local = (1 - sum) / sumRate;
          } else if (triangle === 1 && sum < 1 - EPS) {
            if (sumRate <= 0) continue;
            local = (1 - sum) / sumRate;
          }
        }
        if (local < -EPS || local > duration + EPS) continue;
        local = Math.max(0, Math.min(duration, local));
        const hitU = u + du * local, hitV = v + dv * local;
        if (hitU < -EPS || hitU > 1 + EPS || hitV < -EPS || hitV > 1 + EPS) continue;
        if (triangle === 0 ? hitU + hitV > 1 + EPS : hitU + hitV < 1 - EPS) continue;
        nearest = Math.min(nearest, start + local);
      }
      if (nearest !== Infinity) return nearest;
      if (end >= max) break;
      // Numerical ties at a cell boundary must not stall the traversal.
      start = end > start ? end : start + 1e-8;
    }
    return null;
  }

  // Shared by player bullets and enemy sight/fire. Leaves are never physical cover.
  // Actual terrain uses exact grid triangles. Non-grid worlds use a bounded march.
  // Only the final hit allocates points/normals; misses allocate no temporary vectors.
  function traceWorld(origin, dir, max, world, colliders) {
    const limit = Math.min(max === undefined ? 350 : max, 350);
    if (!(limit >= 0)) return null;
    let nearest = limit, collider = null, kind = null;
    if (colliders) {
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (c.kind === 'leaf' || c.kind === 'leaves' || c.kind === 'foliage') continue;
        const distance = c.shape === 'box' ? rayBox(origin, dir, c, nearest) : rayCylinder(origin, dir, c, nearest);
        if (distance !== null && (!kind || distance < nearest)) {
          nearest = distance;
          collider = c;
          kind = c.kind || 'solid';
        }
      }
    }
    if (world && typeof world.height === 'function') {
      if (origin.y <= world.height(origin.x, origin.z) + EPS) {
        nearest = 0;
        collider = null;
        kind = 'terrain';
      } else if (world.heights && world.n > 0 && world.step > 0 && world.size > 0) {
        const distance = rayHeightfield(origin, dir, nearest, world);
        if (distance !== null) {
          nearest = distance;
          collider = null;
          kind = 'terrain';
        }
      } else {
        let previous = 0;
        while (previous < nearest) {
          const distance = Math.min(previous + 0.6, nearest);
          const x = origin.x + dir.x * distance;
          const y = origin.y + dir.y * distance;
          const z = origin.z + dir.z * distance;
          if (y <= world.height(x, z)) {
            let lo = previous, hi = distance;
            for (let i = 0; i < 6; i++) {
              const mid = (lo + hi) * 0.5;
              const mx = origin.x + dir.x * mid, mz = origin.z + dir.z * mid;
              if (origin.y + dir.y * mid <= world.height(mx, mz)) hi = mid;
              else lo = mid;
            }
            nearest = hi;
            collider = null;
            kind = 'terrain';
            break;
          }
          previous = distance;
        }
      }
    }
    if (!kind) return null;
    const point = { x: origin.x + dir.x * nearest, y: origin.y + dir.y * nearest, z: origin.z + dir.z * nearest };
    let normal;
    if (kind === 'terrain') {
      normal = terrainNormal(world, point.x, point.z);
    } else if (Math.abs(point.y - collider.y) <= 1e-5) {
      normal = { x: 0, y: -1, z: 0 };
    } else if (Math.abs(point.y - collider.y - collider.height) <= 1e-5) {
      normal = { x: 0, y: 1, z: 0 };
    } else if (collider.shape === 'box') {
      const x = point.x - collider.x, z = point.z - collider.z;
      const faceX = Math.abs(Math.abs(x) - collider.hx), faceZ = Math.abs(Math.abs(z) - collider.hz);
      normal = nearest === 0 && faceX > 1e-5 && faceZ > 1e-5 ?
        { x: -dir.x, y: -dir.y, z: -dir.z } :
        faceX <= faceZ ? { x: x < 0 ? -1 : 1, y: 0, z: 0 } : { x: 0, y: 0, z: z < 0 ? -1 : 1 };
    } else {
      const x = point.x - collider.x, z = point.z - collider.z;
      const length = Math.sqrt(x * x + z * z);
      normal = length > EPS ? { x: x / length, y: 0, z: z / length } : { x: -dir.x, y: -dir.y, z: -dir.z };
    }
    return { distance: nearest, point: point, normal: normal, kind: kind, collider: collider };
  }

  globalThis.FPSRules = Object.freeze({
    ENEMY_TYPES: ENEMY_TYPES, weaponAt: weaponAt, createState: createState, knifeAttack: knifeAttack,
    progression: progression, enemyScaling: enemyScaling, lootForKill: lootForKill,
    tick: tick, tryFire: tryFire, startReload: startReload, addAmmo: addAmmo, switchWeapon: switchWeapon,
    tickHandling: tickHandling, accuracy: accuracy, shotKick: shotKick, interrupt: interrupt,
    healPlayer: healPlayer, rollHealthDrop: rollHealthDrop,
    HEALTH_DROP_CHANCE: HEALTH_DROP_CHANCE, HEALTH_DROP_AMOUNT: HEALTH_DROP_AMOUNT,
    registerKill: registerKill, damagePlayer: damagePlayer, zoneMultiplier: zoneMultiplier,
    raySphere: raySphere, rayCylinder: rayCylinder, rayBox: rayBox, traceWorld: traceWorld
  });
}());

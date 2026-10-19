/* Exercise actual host ray generation and combat state, with deterministic RNG.
 * Rendering, audio and target damage are sinks; this is not a browser playtest. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const math = Object.create(Math); math.random = () => .999;
const library = vm.createContext({ console: { warn() {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'vendor/three-r160.min.js'), 'utf8'), library);
const THREE = library.THREE;
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const start = app.indexOf('  function shoot('), end = app.indexOf('  function updateEye(', start);
assert.ok(start >= 0 && end > start);
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

function fixture({ slot = 'primary', ads = false } = {}) {
  const rays = [], noop = () => {};
  const ctx = vm.createContext({ Math: math, screen: 'playing', tactical: true, ads,
    camera: new THREE.PerspectiveCamera(), globalUp: new THREE.Vector3(0, 1, 0),
    shotDir: new THREE.Vector3(), shotRight: new THREE.Vector3(), shotUp: new THREE.Vector3(),
    shotStart: new THREE.Vector3(), shotEnd: new THREE.Vector3(),
    player: { moving: 0, grounded: true, pitch: 0, yaw: 0, recoil: 0 },
    trace: () => null, enemies: { hearPlayerShot: noop, raycast: (_, dir) => { rays.push(dir.clone()); return null; } },
    effects: { tracer: noop, impact: noop }, viewModel: { shoot: noop }, audio: { shot: noop },
    recordAttack: noop, applyPlayerHit: () => null, reload: noop, elapsed: 0, lastEmptyToast: 0,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v))
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'src/combat.js'), 'utf8'), ctx);
  const r = ctx.FPSRules, s = ctx.combat = r.createState('standard', 'tactical');
  s.activeSlot = slot;
  r.tickHandling(s, .3, { ads, speed: 0, grounded: true });
  vm.runInContext(app.slice(start, end), ctx);
  return { ctx, r, s, rays, spread: () => Math.abs(rays.at(-1).x / rays.at(-1).z) / .998 };
}

for (const slot of ['primary', 'secondary']) for (const ads of [false, true]) {
  test(`${slot} ${ads ? 'ADS' : 'hip'} ray uses pre-shot accuracy, with bloom reserved for later rounds`, () => {
    const { ctx, r, s, rays, spread } = fixture({ slot, ads });
    const ready = r.accuracy(s).spread;
    assert.equal(ctx.shoot(), true); close(spread(), ready);
    const ammo = s.ammo, bloom = s.loadout[slot].bloom;
    assert.equal(ctx.shoot(), false); assert.equal(rays.length, 1);
    assert.equal(s.ammo, ammo); close(s.loadout[slot].bloom, bloom);
    const interval = 60 / s.weapon.rpm;
    r.tick(s, interval); r.tickHandling(s, interval, { ads, speed: 0, grounded: true });
    const next = r.accuracy(s).spread;
    assert.ok(next > ready); assert.equal(ctx.shoot(), true); close(spread(), next);
    r.tick(s, 2); r.tickHandling(s, 2, { ads, speed: 0, grounded: true });
    assert.equal(ctx.shoot(), true); close(spread(), ready, 1e-8);
  });
}

test('real tactical rays retain movement, air and incomplete ADS penalties', () => {
  for (const input of [{ ads: true, speed: 5.8, grounded: true }, { ads: true, speed: 0, grounded: false }, { ads: true, speed: 0, grounded: true }]) {
    const { ctx, r, s, spread } = fixture();
    r.tickHandling(s, .09, input);
    const before = r.accuracy(s).spread;
    assert.ok(before > s.weapon.adsSpread);
    assert.equal(ctx.shoot(), true); close(spread(), before);
  }
});

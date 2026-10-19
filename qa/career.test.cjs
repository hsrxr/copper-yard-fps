/* Career persistence is exercised through real serialized state; storage is the
 * sole injected platform boundary so denial/quota/reload can be deterministic. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const filename = require('node:path').join(__dirname, '../src/career.js');
if (fs.existsSync(filename)) require(filename);
const KEY = 'copper-yard-fps.career.v1';
function storage(initial) {
  const items = new Map(initial === undefined ? [] : [[KEY, initial]]);
  return { writes: 0, getItem(k) { return items.get(k) ?? null; }, setItem(k, v) { this.writes++; items.set(k, v); } };
}
function fixture(options = {}) {
  assert.equal(typeof globalThis.createCareer, 'function', 'career factory must exist');
  let clock = 1700000000000;
  const disk = options.storage ?? storage();
  const unlocks = [];
  const career = createCareer({ storage: disk, now: () => clock, onUnlock: a => unlocks.push(a), ...options });
  return { career, disk, unlocks, advance(ms) { clock += ms; } };
}
function achieved(c, id) { return c.snapshot().achievements.find(a => a.id === id); }

test('death records finalized totals once and remains unchanged by later events', () => {
  const { career: c, advance } = fixture();
  c.begin({ spawn: { x: 12, y: 8, z: -4 }, quality: 'low' });
  c.sync({ elapsed: 46.5, score: 320, kills: 2, headshots: 1, level: 1, wave: 2 });
  assert.equal(c.snapshot().totals.runs, 0);
  assert.equal(achieved(c, 'first_kill').unlocked, true);
  advance(46500); c.finish('death'); c.finish('death');
  c.sync({ kills: 99 }); c.attack({ slot: 'primary', hit: true });
  const s = c.snapshot();
  assert.equal(s.active, null); assert.equal(s.records.length, 1);
  assert.deepEqual(s.totals, { runs: 1, kills: 2, headshots: 1, bestScore: 320, bestWave: 2, seconds: 46.5 });
  assert.equal(s.records[0].endedAt - s.records[0].startedAt, 46500);
  assert.equal(s.records[0].outcome, 'death'); assert.equal(s.records[0].quality, 'low');
});

test('begin finalizes a previous unfinished match as restart exactly once', () => {
  const { career: c } = fixture();
  c.begin(); c.sync({ elapsed: 10, kills: 3, headshots: 0, score: 300 });
  c.begin(); const s = c.snapshot();
  assert.equal(s.records[0].outcome, 'restart'); assert.equal(s.totals.kills, 3);
  assert.notEqual(s.active.id, s.records[0].id);
  c.finish('restart'); c.finish('restart'); assert.equal(c.snapshot().totals.runs, 2);
});

test('gun accuracy counts misses and head hits while knife swings do not dilute it', () => {
  const { career: c } = fixture(); c.begin();
  c.attack({ slot: 'primary', hit: false });
  c.attack({ slot: 'secondary', hit: true, zone: 'head', killed: false });
  c.attack({ slot: 'knife', hit: false });
  c.attack({ slot: 'knife', hit: true, zone: 'head', killed: true, type: 'heavy' });
  c.attack({ slot: 'unknown', hit: true, killed: true });
  let r = c.snapshot().active;
  assert.equal(r.shots, 2); assert.equal(r.hits, 1); assert.equal(r.headHits, 1); assert.equal(r.accuracy, .5);
  assert.equal(r.knifeKills, 1); assert.equal(r.heavyKills, 1); assert.equal(r.kills, 0);
  assert.equal(achieved(c, 'first_headshot').unlocked, false);
  c.sync({ kills: 1, headshots: 1 });
  assert.equal(achieved(c, 'first_headshot').unlocked, true);
  c.finish(); c.begin(); assert.equal(c.snapshot().active.accuracy, null);
});

test('live progress unlocks each achievement once and finalized lifetime totals survive reload', () => {
  const { career: c, disk, unlocks } = fixture(); c.begin();
  for (let i = 0; i < 5; i++) c.attack({ slot: 'knife', hit: true, killed: true, type: 'heavy' });
  c.sync({ elapsed: 300, kills: 100, headshots: 10, level: 1, wave: 3 });
  c.sync({ elapsed: 301, kills: 100, headshots: 10, level: 1, wave: 3 });
  assert.equal(unlocks.length, 9); assert.equal(new Set(unlocks.map(a => a.id)).size, 9);
  c.finish('death');
  const restored = fixture({ storage: disk }); restored.career.begin();
  restored.career.sync({ elapsed: 300, kills: 1, headshots: 1 });
  assert.equal(restored.unlocks.length, 0); assert.equal(restored.career.snapshot().totals.kills, 100);
  assert.equal(restored.career.snapshot().achievements.filter(a => a.unlocked).length, 9);
});

test('refresh recovers the last checkpoint as abandoned without counting it twice', () => {
  const { career: c, disk, advance } = fixture(); c.begin();
  c.sync({ elapsed: 20, kills: 3, score: 300, wave: 2 }); advance(20000); c.checkpoint();
  c.sync({ elapsed: 40, kills: 9, score: 900 });
  const recovered = fixture({ storage: disk }); let s = recovered.career.snapshot();
  assert.equal(s.active, null); assert.equal(s.records[0].outcome, 'abandoned');
  assert.equal(s.records[0].duration, 20); assert.equal(s.totals.kills, 3); assert.equal(recovered.unlocks.length, 0);
  recovered.career.checkpoint();
  const twice = fixture({ storage: disk }).career.snapshot();
  assert.equal(twice.totals.runs, 1); assert.equal(twice.records.length, 1); assert.equal(twice.totals.kills, 3);
});

test('retaining only 100 recent records never truncates lifetime statistics', () => {
  const { career: c, disk, advance } = fixture();
  for (let i = 0; i < 105; i++) { c.begin(); c.sync({ elapsed: 2, kills: 1, score: i }); advance(2000); c.finish('death'); }
  const s = fixture({ storage: disk }).career.snapshot();
  assert.equal(s.records.length, 100); assert.equal(s.totals.runs, 105);
  assert.equal(s.totals.kills, 105); assert.equal(s.totals.seconds, 210); assert.equal(s.totals.bestScore, 104);
  assert.equal(s.records[0].score, 104); assert.equal(s.records[99].score, 5);
});

test('frame aggregation is finite and excludes invalid samples', () => {
  const { career: c } = fixture(); c.begin();
  c.frame(33.4); c.frame(50); c.frame(50.1);
  for (const bad of [0, -1, NaN, Infinity, undefined, '16', 60001]) c.frame(bad);
  const p = c.snapshot().active.performance;
  assert.equal(p.frames, 3); assert.ok(Math.abs(p.averageFps - 22.471910112359552) < 1e-10);
  assert.equal(p.worstFrameMs, 50.1); assert.equal(p.slowFrames, 1);
});

test('hot frame, sync and attack paths do not write localStorage', () => {
  const { career: c, disk } = fixture(); assert.equal(disk.writes, 0); c.begin();
  const count = disk.writes;
  for (let i = 0; i < 1000; i++) { c.frame(16); c.sync({ elapsed: i / 60 }); c.attack({ slot: 'primary', hit: false }); }
  assert.equal(disk.writes, count); c.checkpoint(); assert.equal(disk.writes, count + 1);
});

test('read denial, write quota and missing storage degrade to usable in-memory history', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const quota = { getItem() { return null; }, setItem() { throw new Error('quota'); } };
  for (const disk of [denied, quota, null]) {
    const c = createCareer({ storage: disk }); c.begin(); c.sync({ kills: 1 }); c.finish();
    const s = c.snapshot(); assert.equal(s.storage.available, false); assert.ok(s.storage.message);
    assert.equal(s.totals.kills, 1); assert.equal(s.records.length, 1);
    assert.equal(JSON.parse(c.exportJSON()).records[0].kills, 1);
  }
});

test('invalid JSON and future versions are preserved rather than overwritten', () => {
  for (const raw of ['{broken', JSON.stringify({ version: 99, active: { kills: 200 } })]) {
    const disk = storage(raw), c = createCareer({ storage: disk });
    assert.equal(c.snapshot().storage.available, false); c.begin(); c.finish(); c.checkpoint();
    assert.equal(disk.getItem(KEY), raw); assert.equal(disk.writes, 0);
  }
});

test('malformed saved and incoming fields cannot inject nonfinite or inconsistent counters', () => {
  const disk = storage(JSON.stringify({ version: 1, totals: { runs: -2, kills: 'bad', seconds: -10 },
    records: [null, { id: 'one', startedAt: 1, outcome: 'death', kills: 2, headshots: 20, hits: 20, shots: 3,
      spawn: { x: 'bad', y: 4, z: 1e300 }, performance: { frames: -2, averageFps: 'bad' } }], achievements: 'bad' }));
  const c = createCareer({ storage: disk }), saved = c.snapshot();
  assert.equal(saved.records.length, 1); assert.equal(saved.records[0].headshots, 2); assert.equal(saved.records[0].hits, 3);
  assert.equal(saved.totals.kills, 2); assert.equal(saved.records[0].performance.frames, 0);
  c.begin({ spawn: { x: Infinity, y: NaN, z: 'x' } });
  c.sync({ elapsed: NaN, kills: -99, headshots: Infinity, score: 'oops', wave: -2, level: -5 });
  const a = c.snapshot().active;
  assert.equal(a.kills, 0); assert.equal(a.headshots, 0); assert.equal(a.score, 0); assert.equal(a.level, 1);
  assert.deepEqual(a.spawn, { x: 0, y: 0, z: 0 }); assert.ok(!c.exportJSON().includes('Infinity'));
});

test('snapshots and unlock callbacks cannot mutate internal data', () => {
  const { career: c, unlocks } = fixture(); c.begin({ spawn: { x: 1, y: 2, z: 3 } }); c.sync({ kills: 1 });
  const s = c.snapshot(); s.active.spawn.x = 400; s.active.performance.frames = 999;
  s.achievements[0].unlocked = false; s.totals.kills = 900; unlocks[0].title = 'changed';
  assert.equal(c.snapshot().active.spawn.x, 1); assert.equal(c.snapshot().active.performance.frames, 0);
  assert.equal(c.snapshot().totals.kills, 0); assert.equal(achieved(c, 'first_kill').unlocked, true);
  c.finish(); const f = c.snapshot(); f.records[0].score = 50;
  assert.equal(c.snapshot().records[0].score, 0);
});


test('standalone career uses its own storage key and forces tactical map metadata', () => {
  const reads=[],writes=[],old=JSON.stringify({version:1,totals:{runs:25,kills:250},records:[]});
  const items=new Map([['valley-fps.career.v1',old]]);
  const disk={getItem(key){reads.push(key);return items.get(key)||null;},setItem(key,value){writes.push(key);items.set(key,value);}};
  const c=createCareer({storage:disk});assert.equal(c.snapshot().totals.runs,0);
  c.begin({map:'valley',ruleset:'hunt-v2'});c.sync({wave:3,kills:1});c.finish('extracted');
  const r=c.snapshot().records[0];assert.equal(r.map,'depot');assert.equal(r.ruleset,'tactical-v2');
  assert.equal(achieved(c,'mission_complete').unlocked,true);
  assert.deepEqual(reads,[KEY]);assert.ok(writes.length>0&&writes.every(key=>key===KEY));
  assert.equal(items.get('valley-fps.career.v1'),old);
});

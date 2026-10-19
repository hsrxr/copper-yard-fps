/* Local, bounded career history. Hot paths mutate counters only: the host calls
 * checkpoint at a quiet interval and on pagehide, never once per shot/frame.
 * Public totals contain finalized runs; achievements also include the live run.
 * This is not a replay or cloud save. Clearing site data removes this history. */
(function () {
  'use strict';
  const KEY = 'copper-yard-fps.career.v1', MAX = Number.MAX_SAFE_INTEGER, RECORD_LIMIT = 500;
  const DEFINITIONS = [
    ['first_kill', '首次交锋', '累计击杀 1 名敌人', 1, 'kills'],
    ['kills_25', '货场猎手', '累计击杀 25 名敌人', 25, 'kills'],
    ['kills_100', '铜港守卫', '累计击杀 100 名敌人', 100, 'kills'],
    ['first_headshot', '一击中的', '完成 1 次爆头击杀', 1, 'headshots'],
    ['headshots_10', '精准射手', '累计完成 10 次爆头击杀', 10, 'headshots'],
    ['first_knife', '近身交锋', '使用刀击杀 1 名敌人', 1, 'knifeKills'],
    ['heavy_5', '破甲先锋', '累计击杀 5 名重装兵', 5, 'heavyKills'],
    ['mission_complete', '安全撤离', '单局完成全部 3 个任务目标', 3, 'wave'],
    ['survivor_300', '持久战士', '单局存活 300 秒', 300, 'duration']
  ];
  function object(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function number(v, fallback = 0, max = MAX) { return Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : fallback; }
  function count(v, fallback = 0, max = MAX) { return Math.floor(number(v, fallback, max)); }
  function add(a, b) { return Math.min(MAX, a + b); }
  function coordinate(v) { return Number.isFinite(v) ? Math.max(-1000000, Math.min(1000000, v)) : 0; }
  function sanitizeSpawn(v) { const p = object(v); return { x: coordinate(p.x), y: coordinate(p.y), z: coordinate(p.z) }; }
  function sanitizeRecord(value, fallbackId) {
    const r = object(value), p = object(r.performance);
    const shots = count(r.shots), hits = Math.min(shots, count(r.hits)), kills = count(r.kills);
    const frames = count(p.frames), averageFps = number(p.averageFps, 0, 1000000);
    return {
      id: typeof r.id === 'string' && r.id ? r.id.slice(0, 96) : fallbackId,
      startedAt: count(r.startedAt), endedAt: r.endedAt == null ? null : Math.max(count(r.startedAt), count(r.endedAt)),
      outcome: ['death', 'restart', 'abandoned', 'extracted'].includes(r.outcome) ? r.outcome : 'active',
      duration: number(r.duration), score: count(r.score), kills, headshots: Math.min(kills, count(r.headshots)),
      level: Math.max(1, count(r.level, 1, 20)), wave: count(r.wave), shots, hits,
      headHits: Math.min(hits, count(r.headHits)), knifeKills: count(r.knifeKills), heavyKills: count(r.heavyKills),
      accuracy: shots ? hits / shots : null,
      quality: ['low', 'medium', 'high'].includes(r.quality) ? r.quality : 'medium', spawn: sanitizeSpawn(r.spawn),
      // This edition stores only Copper Yard tactical runs in its own namespace.
      map: 'depot', difficulty: r.difficulty === 'hard' ? 'hard' : 'standard',
      ruleset: 'tactical-v2', huntStage: count(r.huntStage, 0, 3),
      performance: { frames, averageFps: frames ? averageFps : 0, worstFrameMs: number(p.worstFrameMs, 0, 60000), slowFrames: Math.min(frames, count(p.slowFrames)) }
    };
  }
  function copyRecord(r) {
    return r ? Object.assign({}, r, { spawn: Object.assign({}, r.spawn), performance: Object.assign({}, r.performance) }) : null;
  }
  function createCareer(options = {}) {
    options = object(options);
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const onUnlock = typeof options.onUnlock === 'function' ? options.onUnlock : null;
    const totals = { runs: 0, kills: 0, headshots: 0, bestScore: 0, bestWave: 0, seconds: 0 };
    const lifetime = { knifeKills: 0, heavyKills: 0, bestLevel: 1, bestDuration: 0 };
    const unlocked = Object.create(null), storageState = { available: true, message: '记录保存在当前浏览器' };
    let disk = null, active = null, records = [], sequence = 0, checkpointAt = 0, frameTotalMs = 0;
    function timestamp() { let t; try { t = now(); } catch (_) { t = Date.now(); } return count(t); }
    function unavailable(message) { storageState.available = false; storageState.message = message; }
    function progress(key) {
      const live = active || {};
      if (key === 'kills' || key === 'headshots') return add(totals[key], live[key] || 0);
      if (key === 'knifeKills' || key === 'heavyKills') return add(lifetime[key], live[key] || 0);
      if (key === 'wave') return Math.max(totals.bestWave, live.wave || 0);
      if (key === 'level') return Math.max(lifetime.bestLevel, live.level || 1);
      return Math.max(lifetime.bestDuration, live.duration || 0);
    }
    function achievement(d) {
      return { id: d[0], title: d[1], description: d[2], current: Math.min(d[3], progress(d[4])), target: d[3],
        unlocked: Object.prototype.hasOwnProperty.call(unlocked, d[0]), unlockedAt: unlocked[d[0]] ?? null };
    }
    function evaluate(notify = true) {
      for (let i = 0; i < DEFINITIONS.length; i++) {
        const d = DEFINITIONS[i];
        if (Object.prototype.hasOwnProperty.call(unlocked, d[0]) || progress(d[4]) < d[3]) continue;
        unlocked[d[0]] = timestamp();
        // A presentation callback must never break a match or invalidate storage.
        if (notify && onUnlock) { try { onUnlock(achievement(d)); } catch (_) {} }
      }
    }
    function totalRecord(r) {
      totals.runs = add(totals.runs, 1); totals.kills = add(totals.kills, r.kills);
      totals.headshots = add(totals.headshots, r.headshots); totals.seconds = add(totals.seconds, r.duration);
      totals.bestScore = Math.max(totals.bestScore, r.score); totals.bestWave = Math.max(totals.bestWave, r.wave);
      lifetime.knifeKills = add(lifetime.knifeKills, r.knifeKills); lifetime.heavyKills = add(lifetime.heavyKills, r.heavyKills);
      lifetime.bestLevel = Math.max(lifetime.bestLevel, r.level); lifetime.bestDuration = Math.max(lifetime.bestDuration, r.duration);
    }
    function finalize(outcome, endedAt, notify) {
      if (!active) return null;
      evaluate(notify); active.outcome = outcome; active.endedAt = Math.max(active.startedAt, endedAt);
      const finished = active; active = null; totalRecord(finished);
      records.unshift(finished); if (records.length > RECORD_LIMIT) records.length = RECORD_LIMIT;
      frameTotalMs = 0; return finished;
    }
    // Read once. Malformed/newer data is preserved intact and explicitly placed
    // in memory-only mode, so this version cannot erase another version's save.
    try {
      disk = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : globalThis.localStorage;
      if (!disk || typeof disk.getItem !== 'function' || typeof disk.setItem !== 'function') unavailable('本地存储不可用，本次记录仅保存在内存，可导出备份');
      else {
        const raw = disk.getItem(KEY);
        if (raw != null) {
          let saved;
          try { saved = JSON.parse(raw); } catch (_) { unavailable('本地记录损坏，已保留原数据；本次记录仅保存在内存'); }
          if (storageState.available) {
            if (!saved || saved.version !== 1) unavailable('本地记录版本不兼容，已保留原数据；本次记录仅保存在内存');
            else {
              const s = object(saved), previous = object(s.totals), extra = object(s.lifetime), stamps = object(s.unlocked);
              sequence = count(s.sequence); checkpointAt = count(s.checkpointAt);
              if (Array.isArray(s.records)) {
                const ids = new Set();
                for (let i = 0; i < s.records.length && records.length < RECORD_LIMIT; i++) {
                  if (!s.records[i] || typeof s.records[i] !== 'object' || Array.isArray(s.records[i])) continue;
                  const r = sanitizeRecord(s.records[i], 'recovered-' + i);
                  if (ids.has(r.id)) continue;
                  ids.add(r.id); if (r.outcome === 'active') r.outcome = 'abandoned';
                  if (r.endedAt === null) r.endedAt = r.startedAt;
                  records.push(r); totalRecord(r);
                }
              }
              // Lifetime totals are independent of the retained-record limit.
              for (const key of Object.keys(totals)) totals[key] = Math.max(totals[key], key === 'seconds' ? number(previous[key]) : count(previous[key]));
              totals.headshots = Math.min(totals.kills, totals.headshots);
              for (const key of Object.keys(lifetime)) lifetime[key] = Math.max(lifetime[key], number(extra[key]));
              for (const d of DEFINITIONS) if (Number.isFinite(stamps[d[0]]) && stamps[d[0]] >= 0) unlocked[d[0]] = count(stamps[d[0]]);
              if (s.active && typeof s.active === 'object' && !Array.isArray(s.active)) {
                const recovered = sanitizeRecord(s.active, 'recovered-active');
                // A partially duplicated save must not count a finished ID again.
                if (!records.some(r => r.id === recovered.id)) {
                  active = recovered;
                  finalize('abandoned', checkpointAt || recovered.startedAt, false);
                }
              }
              evaluate(false);
            }
          }
        }
      }
    } catch (_) { unavailable('浏览器阻止了本地存储，本次记录仅保存在内存，可导出备份'); }

    function checkpoint() {
      checkpointAt = timestamp();
      if (!storageState.available) return false;
      try {
        disk.setItem(KEY, JSON.stringify({ version: 1, sequence, checkpointAt, totals, lifetime, unlocked, records, active }));
        return true;
      } catch (_) { unavailable('本地保存失败或空间不足，本次记录仅保存在内存，可导出备份'); return false; }
    }
    function begin(config = {}) {
      config = object(config);
      if (active) finalize('restart', timestamp(), true);
      const startedAt = timestamp(); sequence = add(sequence, 1);
      active = sanitizeRecord({ id: startedAt.toString(36) + '-' + sequence.toString(36), startedAt,
        quality: config.quality, spawn: config.spawn, level: 1,
        map: 'depot', difficulty: config.difficulty, ruleset: 'tactical-v2' }, 'run');
      frameTotalMs = 0; checkpoint(); return copyRecord(active);
    }
    function sync(value = {}) {
      if (!active) return;
      const s = object(value);
      // All combat/session counters are monotonic within one run. Ignore invalid
      // or stale samples instead of erasing earned progress.
      active.duration = Math.max(active.duration, number(s.elapsed));
      active.score = Math.max(active.score, count(s.score)); active.kills = Math.max(active.kills, count(s.kills));
      active.headshots = Math.min(active.kills, Math.max(active.headshots, count(s.headshots)));
      active.level = Math.max(active.level, count(s.level, 1, 20)); active.wave = Math.max(active.wave, count(s.wave));
      active.huntStage = Math.max(active.huntStage, count(s.huntStage, 0, 9999));
      evaluate();
    }
    function attack(value = {}) {
      if (!active) return;
      const a = object(value);
      if (a.slot !== 'primary' && a.slot !== 'secondary' && a.slot !== 'knife') return;
      if (a.slot !== 'knife') {
        active.shots = add(active.shots, 1);
        if (a.hit === true) { active.hits = add(active.hits, 1); if (a.zone === 'head') active.headHits = add(active.headHits, 1); }
        active.accuracy = active.hits / active.shots;
      }
      if (a.hit === true && a.killed === true) {
        if (a.slot === 'knife') active.knifeKills = add(active.knifeKills, 1);
        if (a.type === 'heavy') active.heavyKills = add(active.heavyKills, 1);
        evaluate();
      }
    }
    function frame(wallMs) {
      // No objects, arrays, strings, snapshots or storage writes in this path.
      if (!active || !Number.isFinite(wallMs) || wallMs <= 0 || wallMs > 60000) return;
      const p = active.performance; p.frames = add(p.frames, 1); frameTotalMs += wallMs;
      p.averageFps = p.frames * 1000 / frameTotalMs;
      if (wallMs > p.worstFrameMs) p.worstFrameMs = wallMs;
      if (wallMs > 50) p.slowFrames = add(p.slowFrames, 1);
    }
    function finish(outcome = 'death') {
      if (!active) return null;
      if (!['death', 'restart', 'abandoned', 'extracted'].includes(outcome)) outcome = 'abandoned';
      const finished = finalize(outcome, timestamp(), true); checkpoint(); return copyRecord(finished);
    }
    function snapshot() {
      // Build mode rankings only on inspection, from the retained records. The
      // separately persisted lifetime totals remain independent of this cap.
      const groups = [], byMode = new Map();
      for (const r of records) {
        const key = r.map + ':' + r.difficulty + ':' + r.ruleset;
        let group = byMode.get(key);
        if (!group) {
          group = { map: r.map, difficulty: r.difficulty, ruleset: r.ruleset, runs: 0, bestScore: 0, bestWave: 0, totalKills: 0 };
          byMode.set(key, group); groups.push(group);
        }
        group.runs++; group.bestScore = Math.max(group.bestScore, r.score);
        group.bestWave = Math.max(group.bestWave, r.wave); group.totalKills = add(group.totalKills, r.kills);
      }
      return { version: 1, storage: Object.assign({}, storageState), totals: Object.assign({}, totals),
        records: records.map(copyRecord), groups, active: copyRecord(active), achievements: DEFINITIONS.map(achievement) };
    }
    function exportJSON() { return JSON.stringify(snapshot(), null, 2); }
    return { begin, sync, attack, frame, finish, checkpoint, snapshot, exportJSON };
  }
  globalThis.createCareer = createCareer;
})();

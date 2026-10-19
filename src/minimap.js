/* Offline Canvas2D radar. Terrain is cached once; the host updates markers at 10 Hz. */
(function () {
  'use strict';
  function createMinimap(canvas, world) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Minimap requires Canvas 2D.');
    const RANGE = 90, CACHE = 256, MAX_MARKERS = 40;
    const size = world.size || 640, half = size * .5, water = Number.isFinite(world.water) ? world.water : 0;
    const owner = canvas.ownerDocument || globalThis.document;
    const terrain = owner && owner.createElement ? owner.createElement('canvas') :
      typeof globalThis.OffscreenCanvas === 'function' ? new globalThis.OffscreenCanvas(CACHE, CACHE) : null;
    if (!terrain) throw new Error('Minimap requires an offscreen drawing surface.');
    terrain.width = terrain.height = CACHE;
    const terrainContext = terrain.getContext('2d'), pixels = terrainContext.createImageData(CACHE, CACHE);
    const heights = new Float32Array(CACHE * CACHE);
    let samples = 0, updates = 0, disposed = false;
    let width = Math.max(80, canvas.clientWidth || canvas.width || 200), height = Math.max(80, canvas.clientHeight || canvas.height || 200);
    let last = { range: RANGE, northUp: true, width: width, height: height, player: null, enemies: [], warnings: [], warningTime: 0, wave: 0, time: 0 };

    for (let y = 0; y < CACHE; y++) for (let x = 0; x < CACHE; x++) {
      heights[y * CACHE + x] = world.height(-half + (x + .5) / CACHE * size, -half + (y + .5) / CACHE * size);
      samples++;
    }
    for (let y = 0; y < CACHE; y++) for (let x = 0; x < CACHE; x++) {
      const index = y * CACHE + x, h = heights[index], offset = index * 4;
      const relief = (heights[y * CACHE + Math.max(0, x - 1)] - heights[Math.max(0, y - 1) * CACHE + x]) * .045;
      let r, g, b;
      if (h <= water) { r = 26; g = 62; b = 78; }
      else if (h < water + 4) { r = 105; g = 112; b = 77; }
      else {
        const high = Math.max(0, Math.min(1, (h - water - 12) / 110));
        r = 41 + high * 65; g = 77 + high * 44; b = 55 + high * 45;
        const contour = x && Math.floor(h / 12) !== Math.floor(heights[index - 1] / 12) ? .82 : 1;
        const shade = Math.max(.73, Math.min(1.18, 1 + relief)) * contour;
        r *= shade; g *= shade; b *= shade;
      }
      pixels.data[offset] = r; pixels.data[offset + 1] = g; pixels.data[offset + 2] = b; pixels.data[offset + 3] = 255;
    }
    terrainContext.putImageData(pixels, 0, 0);
    if(world.isArena){
      terrainContext.fillStyle='#5c6968';terrainContext.fillRect(0,0,CACHE,CACHE);
      for(const b of world.minimapBlocks||[]){terrainContext.fillStyle=b.kind==='crate'?'#a57c52':'#c0c4b4';terrainContext.fillRect((b.x-b.hx+half)/size*CACHE,(b.z-b.hz+half)/size*CACHE,2*b.hx/size*CACHE,2*b.hz/size*CACHE);}
      terrainContext.font='bold 12px sans-serif';terrainContext.textAlign='center';terrainContext.fillStyle='#f6d298';
      for(const zone of world.zones||[])terrainContext.fillText(zone.name.split(' ')[0],(zone.x+half)/size*CACHE,(zone.z+half)/size*CACHE);
    }

    function marker(x, z, player, cx, cy, radius, data) {
      const dx = x - player.x, dz = z - player.z, distance = Math.hypot(dx, dz);
      const scale = radius / RANGE, edge = distance > RANGE, factor = edge ? radius / distance : scale;
      return Object.assign({ x: x, z: z, mapX: cx + dx * factor, mapY: cy + dz * factor,
        unclampedX: cx + dx * scale, unclampedY: cy + dz * scale, distance: distance, atEdge: edge,
        direction: Math.atan2(dz, dx) }, data);
    }

    function drawMarker(mark, warning, time) {
      const pulse = warning ? .5 + Math.sin(time * 5.4) * .5 : 0;
      context.save(); context.translate(mark.mapX, mark.mapY);
      context.fillStyle = warning ? '#ffb24b' : mark.visible===false?'#bf9a80':'#ff625b';
      context.globalAlpha=Number.isFinite(mark.opacity)?mark.opacity:1;
      context.strokeStyle = '#101d1a'; context.lineWidth = 1.5;
      if (warning) {
        context.globalAlpha = .35 + pulse * .4; context.strokeStyle = '#ffb24b';
        context.beginPath(); context.arc(0, 0, 5.5 + pulse * 4, 0, Math.PI * 2); context.stroke();
        context.globalAlpha = 1; context.strokeStyle = '#101d1a';
      }
      context.beginPath();
      if (mark.atEdge) {
        context.rotate(mark.direction); context.moveTo(5, 0); context.lineTo(-3.5, -3.5); context.lineTo(-3.5, 3.5); context.closePath();
      } else if (warning) {
        context.moveTo(0, -4); context.lineTo(4, 0); context.lineTo(0, 4); context.lineTo(-4, 0); context.closePath();
      } else context.arc(0, 0, mark.visible===false?3:3.5, 0, Math.PI * 2);
      if(mark.visible===false&&!warning){context.strokeStyle='#dfb496';context.lineWidth=1.3;context.stroke();}else{context.fill();context.stroke();}context.restore();
    }

    function update(input = {}) {
      if (disposed) return;
      const p = input.player || {}, player = {
        x: Number.isFinite(p.x) ? p.x : 0, z: Number.isFinite(p.z) ? p.z : 0,
        yaw: Number.isFinite(p.yaw) ? p.yaw : 0
      };
      width = Math.max(80, canvas.clientWidth || width); height = Math.max(80, canvas.clientHeight || height);
      const ratio = Math.max(1, Math.min(2, Number(globalThis.devicePixelRatio) || 1));
      const pixelWidth = Math.round(width * ratio), pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      const cx = width * .5, cy = height * .5, outerRadius = Math.min(width, height) * .5 - 13, mapRadius = outerRadius - 9;
      const time = Number.isFinite(input.time) ? input.time : 0;
      const enemies = [], warnings = [], objectives=[];
      const targets = Array.isArray(input.targets) ? input.targets : [], pending = Array.isArray(input.warnings) ? input.warnings : [];
      for (let i = 0; i < targets.length && i < MAX_MARKERS * 4 && enemies.length < MAX_MARKERS; i++) {
        const target = targets[i], position = target && target.position;
        if (!target || !target.alive || !position) continue;
        const x=Number.isFinite(position.x)?position.x:position[0],z=Number.isFinite(position.z)?position.z:position[2];
        if(!Number.isFinite(x)||!Number.isFinite(z))continue;
        // The host is the authority for observation and expiration. Render
        // copied snapshots only; never seek a matching live enemy position.
        const age=Math.max(0,Number(target.age)||0),opacity=Number.isFinite(target.opacity)?Math.max(0,Math.min(1,target.opacity)):target.visible===false?Math.max(.18,1-age/6):1;
        if(opacity<=0)continue;
        enemies.push(marker(x,z,player,cx,cy,mapRadius,{id:target.id,type:target.type,visible:target.visible!==false,age,opacity}));
      }
      for (let i = 0; i < pending.length && i < MAX_MARKERS * 4 && warnings.length < MAX_MARKERS; i++) {
        const warning = pending[i];
        if (!warning || !Number.isFinite(warning.x) || !Number.isFinite(warning.z)) continue;
        warnings.push(marker(warning.x, warning.z, player, cx, cy, mapRadius, { type: warning.type }));
      }
      const validPoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
      for(const objective of (Array.isArray(input.objectives)?input.objectives:[]).slice(0,8))if(validPoint(objective))objectives.push(marker(objective.x,objective.z,player,cx,cy,mapRadius,{label:String(objective.label||'').slice(0,3),kind:objective.kind,active:objective.active!==false,completed:!!objective.completed}));
      const extraction=validPoint(input.extraction)?marker(input.extraction.x,input.extraction.z,player,cx,cy,mapRadius,{}):null;
      const danger=validPoint(input.danger)?marker(input.danger.x,input.danger.z,player,cx,cy,mapRadius,{radius:Math.max(0,Math.min(20,Number(input.danger.radius)||0))}):null;
      last = { range: RANGE, northUp: true, width: width, height: height, mapRadius: mapRadius,extraction,danger,objectives,
        player: { x: player.x, z: player.z, yaw: player.yaw, mapX: cx, mapY: cy,
          headingX: -Math.sin(player.yaw), headingY: -Math.cos(player.yaw) },
        enemies: enemies, warnings: warnings, warningTime: Number.isFinite(input.warningTime) ? Math.max(0, input.warningTime) : 0,
        wave: Number.isFinite(input.wave) ? Math.max(0, Math.floor(input.wave)) : 0, time: time };

      context.save(); context.beginPath(); context.arc(cx, cy, outerRadius, 0, Math.PI * 2); context.clip();
      context.fillStyle = '#0b1917'; context.fillRect(0, 0, width, height);
      const scale = mapRadius / RANGE;
      context.globalAlpha = .92;
      context.drawImage(terrain, cx + (-half - player.x) * scale, cy + (-half - player.z) * scale, size * scale, size * scale);
      context.globalAlpha = 1; context.strokeStyle = 'rgba(191,224,199,.11)'; context.lineWidth = 1;
      context.beginPath();
      for (let line = Math.ceil((player.x - RANGE) / 30) * 30; line <= player.x + RANGE; line += 30) {
        const x = cx + (line - player.x) * scale; context.moveTo(x, cy - outerRadius); context.lineTo(x, cy + outerRadius);
      }
      for (let line = Math.ceil((player.z - RANGE) / 30) * 30; line <= player.z + RANGE; line += 30) {
        const y = cy + (line - player.z) * scale; context.moveTo(cx - outerRadius, y); context.lineTo(cx + outerRadius, y);
      }
      context.stroke();
      if(danger){context.fillStyle='rgba(255,99,69,.4)';context.strokeStyle='#ff785d';context.beginPath();context.arc(danger.mapX,danger.mapY,Math.max(3,danger.radius*scale),0,Math.PI*2);context.fill();context.stroke();}
      if(extraction){context.fillStyle='#91f5d3';context.strokeStyle='#12352b';context.beginPath();context.arc(extraction.mapX,extraction.mapY,5,0,Math.PI*2);context.fill();context.stroke();context.font='bold 10px sans-serif';context.textAlign='center';context.fillText('E',extraction.mapX,extraction.mapY-9);}
      for(const objective of objectives){
        context.save();context.globalAlpha=objective.completed?.35:objective.active?1:.5;context.fillStyle=objective.kind==='medical'?'#9ce3b9':objective.kind==='extract'?'#91f5d3':'#f3c581';context.strokeStyle='#162a23';context.lineWidth=1.6;context.beginPath();context.moveTo(objective.mapX,objective.mapY-5);context.lineTo(objective.mapX+5,objective.mapY);context.lineTo(objective.mapX,objective.mapY+5);context.lineTo(objective.mapX-5,objective.mapY);context.closePath();context.fill();context.stroke();context.font='bold 9px sans-serif';context.textAlign='center';context.fillText(objective.label||'E',objective.mapX,objective.mapY-11);context.restore();
      }
      for (let i = 0; i < warnings.length; i++) drawMarker(warnings[i], true, time);
      for (let i = 0; i < enemies.length; i++) drawMarker(enemies[i], false, time);
      context.save(); context.translate(cx, cy); context.rotate(-player.yaw);
      context.fillStyle = '#e7fff2'; context.strokeStyle = '#10251c'; context.lineWidth = 2;
      context.beginPath(); context.moveTo(0, -8); context.lineTo(5.5, 5.5); context.lineTo(0, 2.5); context.lineTo(-5.5, 5.5); context.closePath(); context.fill(); context.stroke(); context.restore();
      context.restore();
      context.strokeStyle = 'rgba(187,216,192,.55)'; context.lineWidth = 1.2;
      context.beginPath(); context.arc(cx, cy, outerRadius, 0, Math.PI * 2); context.stroke();
      context.font = '600 10px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#d8eedc';
      context.fillText('N', cx, cy - outerRadius - 7);
      context.font = '9px system-ui, sans-serif'; context.fillStyle = warnings.length ? '#ffc16a' : '#aec5b6';
      context.fillText(warnings.length ? '敌人抵达 ' + last.warningTime.toFixed(1) + ' 秒' : '90 m', cx, cy + outerRadius + 7);
      updates++;
    }

    function getState() {
      return { range: last.range, northUp: true, width: last.width, height: last.height, mapRadius: last.mapRadius,
        player: last.player ? Object.assign({}, last.player) : null,
        enemies: last.enemies.map(mark => Object.assign({}, mark)), warnings: last.warnings.map(mark => Object.assign({}, mark)),
        extraction:last.extraction?Object.assign({},last.extraction):null,danger:last.danger?Object.assign({},last.danger):null,objectives:(last.objectives||[]).map(mark=>Object.assign({},mark)),
        warningTime: last.warningTime, wave: last.wave, time: last.time };
    }
    function stats() {
      return { updates: updates, terrainBuilds: 1, terrainSamples: samples, cacheSize: CACHE, range: RANGE,
        enemyMarkers: last.enemies.length, warningMarkers: last.warnings.length,
        edgeMarkers: last.enemies.filter(mark => mark.atEdge).length + last.warnings.filter(mark => mark.atEdge).length,
        maxMarkersPerKind: MAX_MARKERS, disposed: disposed };
    }
    return { update: update, getState: getState, stats: stats, dispose() { disposed = true; context.clearRect(0, 0, width, height); } };
  }
  globalThis.createMinimap = createMinimap;
})();

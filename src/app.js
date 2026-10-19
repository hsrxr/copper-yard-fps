/* COPPER YARD: input, game lifecycle, grounded movement and render orchestration. */
(() => {
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),finite=(v,d)=>Number.isFinite(v)?v:d;
  const canvas=document.getElementById('scene'),errors=[],keys=Object.create(null);
  let ready=false,screen='menu',locked=false,lost=false,failed=false,frame=0,time=0,elapsed=0,last=performance.now();
  let controlRequest=null;
  const displayKey='copper-yard-fps.displaySettings';let savedDisplay;
  try{savedDisplay=JSON.parse(localStorage.getItem(displayKey));}catch{/* Bad or unavailable storage falls back to native resolution. */}
  const display=FPSDisplay.create(savedDisplay);
  let resizePending=true,fps=60,frameMs=16.67,drawCalls=0,triangles=0;
  let maxRenderDimension=16384,renderedDPR=0,renderDimensions={width:0,height:0,limited:false};
  let firing=false,attackQueued=null,ads=false,wave=1,deathCount=0,enemyFire=true,lastEmptyToast=-9,lastHUD=0;
  let renderer,scene,camera,world,arena,atmosphere,post,viewModel,player,enemies,effects,ctx,sun,hemi,sceneRT,lastSpawn,minimap;
  const sensitivityKey='copper-yard-fps.sensitivity';let sensitivity=1;
  try{const stored=localStorage.getItem(sensitivityKey);if(stored!==null&&stored.trim()!==''&&Number.isFinite(Number(stored)))sensitivity=Number(stored);}catch{/* Storage can be disabled in private/offline contexts. */}
  // This standalone edition always runs Copper Yard's tactical mission.
  const mapId='depot',tactical=true;
  let difficulty='standard';try{difficulty=localStorage.getItem('copper-yard-fps.difficulty')==='hard'?'hard':'standard';}catch{}
  let combat=FPSRules.createState(difficulty,'tactical');const audio=createGameAudio(),mission=createTacticalMission();
  let aimMode='hold';try{aimMode=localStorage.getItem('copper-yard-fps.aimMode')==='toggle'?'toggle':'hold';}catch{}
  let crosshairStyle='classic';try{const saved=localStorage.getItem('copper-yard-fps.crosshairStyle');if(['classic','dot','cross','gap'].includes(saved))crosshairStyle=saved;}catch{}
  const observed=new Map(),missionActors=[],runStats={shots:0,hits:0,damageTaken:0};let medicActor;
  let lastHurtAt=-10;
  const meleeAttack={active:false,mode:'light',left:0};
  let footstepDistance=0,playerFootsteps=0,footstepListeners=0;
  const shotDir=new THREE.Vector3(),shotRight=new THREE.Vector3(),shotUp=new THREE.Vector3(),shotEnd=new THREE.Vector3(),shotStart=new THREE.Vector3(),globalUp=new THREE.Vector3(0,1,0),daylight=new THREE.Color(0xd7e6f5);
  const playerInfo={position:null,alive:true,velocity:null},viewState={ads:false,moving:0,sprinting:false,reloadProgress:0,level:1};
  const hudState={},metrics={fps:60,quality:'medium',renderScale:1,drawCalls:0,triangles:0};
  const ui=createFPSUI({start:()=>startGame(),resume:()=>resumeGame(),restart:()=>startGame(),newMission:()=>startGame(true),setAimMode,setCrosshairStyle,setQuality,setRenderScale,setAdaptive,setSensitivity:v=>setSensitivity(v),setDifficulty,menu:returnToMenu,mute:()=>audio.mute(),openCareer,exportCareer});ui.setScreen('menu');ui.setSetup(mapId,difficulty);if(ui.setAimMode)ui.setAimMode(aimMode);ui.setCrosshairStyle(crosshairStyle);ui.setDisplaySettings(display.snapshot());
  let careerStorage=null;try{careerStorage=window.localStorage;}catch{/* Local files/private policies can deny storage. */}
  const career=createCareer({storage:careerStorage,onUnlock:item=>{ui.achievement(item);queueCareerSave();}});
  let careerSaveHandle=null,careerSaveIsIdle=false,lastCareerSync=0,nextCareerCheckpoint=15;
  function syncCareer(){career.sync({elapsed,score:combat.score,kills:combat.kills,headshots:combat.headshots,level:combat.level,wave:mission.snapshot().stage,huntStage:mission.snapshot().stage});lastCareerSync=elapsed;}
  function setAimMode(value){aimMode=value==='toggle'?'toggle':'hold';ads=false;if(ui.setAimMode)ui.setAimMode(aimMode);try{localStorage.setItem('copper-yard-fps.aimMode',aimMode);}catch{}}
  function setCrosshairStyle(value){crosshairStyle=ui.setCrosshairStyle(value);try{localStorage.setItem('copper-yard-fps.crosshairStyle',crosshairStyle);}catch{}return crosshairStyle;}
  function setDifficulty(value){if(screen!=='menu')return;difficulty=value==='hard'?'hard':'standard';try{localStorage.setItem('copper-yard-fps.difficulty',difficulty);}catch{}ui.setSetup(mapId,difficulty);}
  function returnToMenu(){if(!ready)return;syncCareer();career.finish('abandoned');releaseInput();if(document.pointerLockElement)document.exitPointerLock();screen='menu';ui.setScreen('menu');for(const marker of missionActors)marker.visible=false;medicActor.visible=false;ui.setSetup(mapId,difficulty);}
  // Aggregate in memory. Storage is touched at lifecycle boundaries and in a
  // coalesced idle checkpoint, never for each frame or ordinary bullet.
  function queueCareerSave(){
    if(careerSaveHandle!==null)return;
    const save=()=>{careerSaveHandle=null;syncCareer();career.checkpoint();};
    careerSaveIsIdle=typeof requestIdleCallback==='function';
    careerSaveHandle=careerSaveIsIdle?requestIdleCallback(save,{timeout:5000}):setTimeout(save,1000);
  }
  function saveCareerNow(){
    if(careerSaveHandle!==null){if(careerSaveIsIdle)cancelIdleCallback(careerSaveHandle);else clearTimeout(careerSaveHandle);careerSaveHandle=null;}
    syncCareer();career.checkpoint();
  }
  function openCareer(){if(screen==='playing')pauseGame();syncCareer();ui.showCareer(career.snapshot());}
  function exportCareer(){
    syncCareer();const json=career.exportJSON(),blob=new Blob([json],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='copper-yard-records-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return json;
  }
  function setSensitivity(value){sensitivity=ui.setSensitivity(value);if(player)player.setSensitivity(sensitivity);try{localStorage.setItem(sensitivityKey,String(sensitivity));}catch{}return sensitivity;}
  function fail(error){const message=error?.message||String(error);if(!errors.includes(message)&&errors.length<16)errors.push(message);failed=true;ui.error(message);console.error(error);if(document.pointerLockElement)document.exitPointerLock();}
  function trace(origin,dir,max){return FPSRules.traceWorld(origin,dir,max,world,arena.colliders);}
  function cancelMelee(){meleeAttack.active=false;meleeAttack.left=0;if(viewModel)viewModel.cancelMelee();}
  function releaseInput(){firing=ads=false;attackQueued=null;footstepDistance=0;cancelMelee();for(const k in keys)keys[k]=false;if(tactical)mission.tick(0,{interact:false});}
  function requestControl(){
    if(screen!=='playing'||controlRequest||document.pointerLockElement===canvas)return;
    canvas.focus();audio.init();
    const request={promiseBased:false};controlRequest=request;
    function rejected(error,raw){
      if(controlRequest!==request)return;
      // Raw input bypasses the platform-adjusted pointer path. Only unsupported
      // raw input may fall back; permission/focus errors must not retry capture.
      if(raw&&error?.name==='NotSupportedError'&&screen==='playing'){attempt(false);return;}
      controlRequest=null;
      if(screen==='playing'){pauseGame();ui.toast('点击继续，允许鼠标控制后进入战斗。','info');}
    }
    function attempt(raw){
      try{
        const p=raw?canvas.requestPointerLock({unadjustedMovement:true}):canvas.requestPointerLock();
        request.promiseBased=!!(p&&typeof p.then==='function');
        if(request.promiseBased)p.then(()=>{
          if(controlRequest!==request)return;controlRequest=null;
          if(screen!=='playing'&&document.pointerLockElement===canvas)document.exitPointerLock();
        },error=>rejected(error,raw));
        // Older implementations return undefined; their events finish the request.
      }catch(error){rejected(error,raw);}
    }
    attempt(true);
  }
  function selectSpawn(){
    lastSpawn=mission.layout().spawn;player.reset(lastSpawn.x,lastSpawn.z,lastSpawn.yaw);player.pitch=-.025;updateEye(0);
  }
  function startGame(newVariant=false){
    if(!ready||lost||failed)return;syncCareer();career.finish('restart');ui.closeCareer();ui.resetFeedback();releaseInput();mission.reset(newVariant===true);observed.clear();Object.assign(runStats,{shots:0,hits:0,damageTaken:0});combat=FPSRules.createState(difficulty,'tactical');elapsed=0;wave=1;deathCount=0;enemyFire=true;lastCareerSync=0;nextCareerCheckpoint=15;
    lastHurtAt=-10;playerFootsteps=footstepListeners=footstepDistance=0;
    enemies.reset();effects.reset();viewModel.reset();selectSpawn();
    enemies.setThreat({stage:0,difficulty});career.begin({spawn:lastSpawn,quality:display.quality,map:mapId,difficulty,ruleset:'tactical-v2'});
    screen='playing';ui.setScreen(screen);enemies.spawnEncounter(mission.layout().enemies,camera.position);ui.toast('WASD 奔跑 · Shift 无声静步 · 反向轻点急停射击','info');requestControl();renderer.shadowMap.needsUpdate=true;last=performance.now();updateHUD(true);
  }
  function pauseGame(){if(screen!=='playing')return;screen='paused';locked=false;releaseInput();if(tactical){FPSRules.interrupt(combat);enemies.interruptAttacks();}ui.setScreen(screen);if(document.pointerLockElement)document.exitPointerLock();saveCareerNow();updateHUD(true);}
  function resumeGame(){if(screen!=='paused'||lost||failed||ui.isCareerOpen())return;screen='playing';ui.setScreen(screen);releaseInput();last=performance.now();requestControl();}
  function takeDamage(amount,origin){
    if(screen!=='playing')return {applied:0,died:false};const result=FPSRules.damagePlayer(combat,amount);
    if(result.applied){lastHurtAt=elapsed;runStats.damageTaken+=result.applied;if(tactical)mission.tick(0,{damaged:true});const angle=origin?Math.atan2(origin.x-camera.position.x,camera.position.z-origin.z)+player.yaw:0;ui.hurt(angle);audio.hurt();}
    if(result.died){deathCount++;screen='dead';releaseInput();syncCareer();career.finish('death');ui.setScreen(screen);audio.death();if(document.pointerLockElement)document.exitPointerLock();updateHUD(true);}
    return result;
  }
  function killed(enemy,zone){
    const result=FPSRules.registerKill(combat,enemy.type,zone);if(!result.points)return;
    const loot=FPSRules.lootForKill(combat,enemy.type);if(loot.ammo)effects.drop(enemy.position,loot.ammo);
    if(loot.health)effects.dropHealth(enemy.position,loot.health);
    if(result.upgraded){audio.upgrade();ui.toast('升级 LV.'+combat.level+' · 生命已回满 · 武器性能提升','upgrade');}
    renderer.shadowMap.needsUpdate=true;
  }
  function reload(){if(screen==='playing'&&FPSRules.startReload(combat)){combat.reloadDuration=combat.reloadLeft;audio.reload();return true;}return false;}
  function equip(slot){if(screen!=='playing'||!FPSRules.switchWeapon(combat,slot))return false;firing=ads=false;attackQueued=null;cancelMelee();player.recoil=0;updateHUD(true);return true;}
  function applyPlayerHit(hit,weapon,attackMeta){
    if(!hit)return null;
    const scoreBefore=combat.score,result=enemies.damage(hit.id,hit.zone,weapon.damage*FPSRules.zoneMultiplier(hit.zone,weapon),Object.assign({origin:{x:camera.position.x,y:camera.position.y,z:camera.position.z},direction:{x:shotDir.x,y:shotDir.y,z:shotDir.z}},attackMeta));
    if(!result.hit)return null;
    const kind=result.armorBreak?'armorBreak':result.armorHit?'armor':hit.zone==='head'?(result.killed?'headshotKill':'headshot'):(result.killed?'kill':'hit');
    shotEnd.set(hit.point.x,hit.point.y,hit.point.z);effects.impact(shotEnd,true,kind);
    ui.combatFeedback({kind,damage:result.damage,enemyName:FPSRules.ENEMY_TYPES[result.type]?.name||'敌人',points:combat.score-scoreBefore});audio.feedback(kind);
    return result;
  }
  function recordAttack(weapon,hit,result){if(weapon.kind!=='knife'){runStats.shots++;if(result?.hit)runStats.hits++;}career.attack({slot:weapon.slot,hit:!!result?.hit,zone:hit?.zone,killed:!!result?.killed,type:result?.type});syncCareer();}
  function updateMelee(dt){
    if(!meleeAttack.active)return;
    meleeAttack.left=Math.max(0,meleeAttack.left-dt);
    if(meleeAttack.left>1e-8)return;
    // One contact at the strike phase. Sample current aim/positions, so turning,
    // stepping out of range and moving behind a trunk during windup all matter.
    meleeAttack.active=false;
    if(screen!=='playing'||combat.dead||combat.activeSlot!=='knife')return;
    const attack=FPSRules.knifeAttack(meleeAttack.mode);
    camera.getWorldDirection(shotDir);shotRight.crossVectors(shotDir,globalUp).normalize();
    let hit=null;
    for(let i=0;i<3;i++){
      const offset=i===0?0:i===1?-attack.fan:attack.fan;
      shotEnd.copy(shotDir).addScaledVector(shotRight,offset).normalize();
      const wall=trace(camera.position,shotEnd,attack.range),candidate=enemies.raycast(camera.position,shotEnd,wall?wall.distance:attack.range);
      if(candidate&&(!hit||candidate.distance<hit.distance))hit=candidate;
    }
    audio.melee(attack.mode);
    const result=applyPlayerHit(hit,attack,{kind:'knife',mode:attack.mode});recordAttack(combat.loadout.knife.weapon,hit,result);
  }
  function shoot(mode='light'){
    if(screen!=='playing')return false;
    const weapon=combat.weapon,melee=weapon.kind==='knife';
    // Snapshot before tryFire adds this round's bloom; that penalty affects later shots.
    const spread=melee?0:FPSRules.accuracy(combat).spread;
    if(!FPSRules.tryFire(combat,mode)){if(!melee&&combat.ammo===0&&!combat.reloadLeft){if(combat.reserve>0)reload();else if(elapsed-lastEmptyToast>2){lastEmptyToast=elapsed;ui.toast('当前武器弹药耗尽 · 切换其他武器或战术刀','info');}}return false;}
    if(melee){
      const attack=FPSRules.knifeAttack(mode);meleeAttack.active=true;meleeAttack.mode=attack.mode;meleeAttack.left=attack.hitDelay;
      viewModel.shoot(weapon.slot,attack.mode);return true;
    }
    if(tactical)enemies.hearPlayerShot(camera.position);
    camera.getWorldDirection(shotDir);shotRight.crossVectors(shotDir,globalUp).normalize();shotUp.crossVectors(shotRight,shotDir).normalize();
    shotDir.addScaledVector(shotRight,(Math.random()-.5)*spread*2).addScaledVector(shotUp,(Math.random()-.5)*spread*2).normalize();
    const range=weapon.range||300,obstruction=trace(camera.position,shotDir,range),limit=obstruction?obstruction.distance:range;
    const hit=enemies.raycast(camera.position,shotDir,limit);
    const result=applyPlayerHit(hit,weapon);
    if(!result){shotEnd.copy(camera.position).addScaledVector(shotDir,limit);if(obstruction)effects.impact(shotEnd,false);}
    recordAttack(weapon,hit,result);
    shotStart.copy(camera.position).addScaledVector(shotRight,ads?.03:.23);shotStart.y-=ads?.12:.22;shotStart.addScaledVector(shotDir,.55);effects.tracer(shotStart,shotEnd,false);
    const kick=FPSRules.shotKick(combat);player.pitch=clamp(player.pitch+kick.pitch,-1.42,1.42);player.yaw+=kick.yaw;viewModel.shoot(weapon.slot);audio.shot(false,weapon.slot);return true;
  }
  function updateEye(dt){
    camera.position.set(player.position.x,player.position.y+player.eyeHeight,player.position.z);
    camera.rotation.order='YXZ';camera.rotation.set(clamp(player.pitch+player.recoil,-1.45,1.45),player.yaw,0);
    const f=72-16*FPSRules.accuracy(combat).adsBlend;camera.fov+=(f-camera.fov)*(dt?1-Math.exp(-dt*16):1);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
  // Mission objectives and the single-use medical point.
  function createObjectiveMarkers(){
    const geo=new THREE.RingGeometry(.88,1,48);
    function ring(color,radius){const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.scale.setScalar(radius);m.visible=false;scene.add(m);return m;}
    if(tactical){
      for(const [i,p]of mission.layout().objectives.entries()){
        const marker=ring(i===2?0x67ecc2:0xf4c369,2.7);marker.position.set(p.x,.06,p.z);missionActors.push(marker);
        if(i<2){const panel=new THREE.Mesh(new THREE.BoxGeometry(.65,.5,.09),new THREE.MeshBasicMaterial({color:0x67ecc2}));panel.position.set(p.x,1.25,p.z-.87);scene.add(panel);}
      }
      medicActor=ring(0x67ecc2,2.2);const m=mission.medic();medicActor.position.set(m.x,.07,m.z);
      const crossMat=new THREE.MeshBasicMaterial({color:0xb1ffe1});for(const dims of [[.15,.55,.03],[.55,.15,.03]]){const cross=new THREE.Mesh(new THREE.BoxGeometry(...dims),crossMat);cross.position.set(m.x,.67,m.z-.86);scene.add(cross);}
    }
  }
  function updateObjectives(dt){
    if(tactical){
      const result=mission.tick(dt,{position:player.position,interact:!!keys.KeyE,health:combat.hp,damaged:elapsed-lastHurtAt<.05});
      if(result.heal){FPSRules.healPlayer(combat,result.heal);audio.pickup();ui.toast('固定医疗点 · 恢复 35 生命','health');}
      if(result.advanced){wave=mission.snapshot().stage+1;audio.pickup();ui.toast(mission.snapshot().title,'info');updateHUD(true);}
      if(result.completed){syncCareer();releaseInput();screen='extracted';ui.setScreen(screen);career.finish('extracted');if(document.pointerLockElement)document.exitPointerLock();audio.upgrade();updateHUD(true);}
    }
  }
  function makeTarget(){const r=new THREE.WebGLRenderTarget(1,1,{type:ctx.hdrType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});r.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);return r;}
  function resize(){
    renderedDPR=devicePixelRatio||1;
    renderDimensions=FPSDisplay.dimensions({width:innerWidth,height:innerHeight,devicePixelRatio:renderedDPR,renderScale:display.renderScale,maxDimension:maxRenderDimension});
    const {width:w,height:h}=renderDimensions;renderer.setPixelRatio(1);renderer.setSize(w,h,false);camera.aspect=innerWidth/Math.max(innerHeight,1);camera.updateProjectionMatrix();
    sceneRT.setSize(w,h);post.resize(w,h);viewModel.resize(w,h);resizePending=false;
    updateDisplayStatus();
  }
  function updateDisplayStatus(){ui.updateDisplayStatus({...renderDimensions,effectiveQuality:display.effectiveQuality});}
  function saveDisplaySettings(){
    const {quality,renderScale,adaptive}=display.snapshot();ui.setDisplaySettings({quality,renderScale,adaptive});
    try{localStorage.setItem(displayKey,JSON.stringify({quality,renderScale,adaptive}));}catch{}
  }
  function applyEffectsQuality(){
    const q=display.effectiveQuality;
    if(post){post.setQuality(q);post.setEnabled(q!=='low');}
    if(renderer&&sun){renderer.shadowMap.enabled=q!=='low';const sz=q==='high'?1024:512;if(sun.shadow.mapSize.x!==sz){sun.shadow.mapSize.set(sz,sz);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}renderer.shadowMap.needsUpdate=true;}
    updateDisplayStatus();
  }
  function setQuality(value){const result=display.setQuality(value);applyEffectsQuality();saveDisplaySettings();return result;}
  function setRenderScale(value){const result=display.setRenderScale(value);resizePending=true;saveDisplaySettings();return result;}
  function setAdaptive(value){const result=display.setAdaptive(value);applyEffectsQuality();saveDisplaySettings();return result;}
  function updateHUD(force=false){
    if(!force&&elapsed-lastHUD<.1&&screen==='playing')return;lastHUD=elapsed;
    const ms=mission.snapshot();Object.assign(hudState,combat,runStats,{mission:ms,accuracy:FPSRules.accuracy(combat),hitRate:runStats.shots?runStats.hits/runStats.shots:0,wave,enemies:enemies?enemies.stats().alive:0,ads,elapsed,locked,map:mapId});
    if(tactical&&player){hudState.mission.medDistance=Math.hypot(player.position.x-mission.medic().x,player.position.z-mission.medic().z);for(let i=0;i<missionActors.length;i++)missionActors[i].visible=screen==='playing'&&ms.stage===i;medicActor.visible=screen==='playing'&&ms.medAvailable;}
    metrics.fps=fps;metrics.quality=display.quality;metrics.effectiveQuality=display.effectiveQuality;metrics.renderScale=display.renderScale;metrics.drawCalls=drawCalls;metrics.triangles=triangles;ui.update(hudState,metrics);
    if(minimap&&player)minimap.update({tactical,objectives:mission.markers().concat(ms.medAvailable?[{...mission.medic(),label:'+',kind:'medical',active:true}]:[]),player:{x:player.position.x,z:player.position.z,yaw:player.yaw},targets:observedTargets(),time,extraction:ms.stage===2?mission.objective():null});
  }
  function observedTargets(){
    if(screen!=='playing')return Array.from(observed.values()).map(t=>({...t,visible:elapsed-t.seenAt<.12,age:elapsed-t.seenAt,opacity:Math.max(.15,1-(elapsed-t.seenAt)/4)}));
    const result=[];
    for(const target of enemies.getTargets()){
      if(!target.alive){observed.delete(target.id);continue;}
      shotEnd.fromArray(target.head);const distance=shotEnd.distanceTo(camera.position);shotStart.copy(shotEnd).project(camera);
      let visible=false;
      if(distance<75&&shotStart.z>-1&&shotStart.z<1&&Math.abs(shotStart.x)<=1&&Math.abs(shotStart.y)<=1){shotDir.copy(shotEnd).sub(camera.position).normalize();visible=!trace(camera.position,shotDir,Math.max(0,distance-.15));}
      if(visible)observed.set(target.id,{id:target.id,type:target.type,alive:true,position:target.position.slice(),seenAt:elapsed});
      const known=observed.get(target.id);if(known){const age=elapsed-known.seenAt;if(age>4)observed.delete(target.id);else result.push({...known,visible,age,opacity:visible?1:Math.max(.15,1-age/4)});}
    }
    return result;
  }
  let shadowTimer=0;
  const moveInput={forward:0,right:0,sprint:false,walk:false,tactical,ads:false};
  function updatePlayerFootsteps(dt){
    // Actual travel drives footfalls. Input held against cover, airborne travel,
    // quiet walking and pause never send an AI sound or a deferred loud step.
    if(!tactical||!player.grounded||player.walking){footstepDistance=0;return;}
    // Keep partial stride through an ordinary stop: repeated short runs must
    // not cross the whole yard silently by resetting before every footfall.
    if(player.speed<=.6)return;
    footstepDistance+=player.speed*dt;
    if(footstepDistance>=1.65){footstepDistance%=1.65;playerFootsteps++;footstepListeners+=enemies.hearPlayerFootstep(camera.position);audio.cue(null,'playerStep');}
  }
  function loop(now){
    requestAnimationFrame(loop);if(lost||failed||document.hidden){last=now;return;}
    try{
      const rawFrameMs=now-last,wall=Math.max(0,Math.min(.25,rawFrameMs*.001));last=now;const dt=Math.min(.04,wall),gameDt=screen==='playing'?dt:0,ambientDt=screen==='menu'?dt*.35:gameDt;
      frameMs=frameMs*.94+wall*1000*.06;fps=1000/Math.max(.1,frameMs);time+=ambientDt;if(resizePending||renderedDPR!==(devicePixelRatio||1))resize();
      if(screen==='playing'){
        career.frame(rawFrameMs);
        elapsed+=gameDt;FPSRules.tick(combat,gameDt,{firing:tactical&&firing});moveInput.forward=(keys.KeyW?1:0)-(keys.KeyS?1:0);moveInput.right=(keys.KeyD?1:0)-(keys.KeyA?1:0);moveInput.walk=tactical&&!!(keys.ShiftLeft||keys.ShiftRight);moveInput.sprint=false;moveInput.ads=ads;moveInput.speedMultiplier=combat.weapon.moveMultiplier||1;player.update(gameDt,moveInput);
        if(tactical){FPSRules.tickHandling(combat,gameDt,{ads,speed:player.precisionSpeed,grounded:player.grounded,sprinting:player.sprinting});const recovery=combat.handling.recovery;player.pitch=clamp(player.pitch+recovery.pitch,-1.42,1.42);player.yaw+=recovery.yaw;}
        updateEye(gameDt);camera.getWorldDirection(shotDir);audio.listener(camera.position,shotDir);updatePlayerFootsteps(gameDt);
        // Mouse down/up can both happen between frames. Preserve the press once,
        // independently of whether the button is still held when this frame runs.
        updateMelee(gameDt);
        if(attackQueued||firing){const mode=attackQueued||'light';attackQueued=null;shoot(mode);if(!combat.weapon.automatic)firing=false;}playerInfo.position=camera.position;playerInfo.alive=!combat.dead;playerInfo.velocity=player.velocity;enemies.update(gameDt,playerInfo);
        effects.update(gameDt,time,camera.position,n=>FPSRules.addAmmo(combat,n),n=>{audio.pickup();ui.toast('补充弹药 +'+n,'ammo');},n=>FPSRules.healPlayer(combat,n),n=>{audio.pickup();ui.toast('恢复生命 +'+n,'health');});
        if(!combat.dead)updateObjectives(gameDt);
        if(elapsed-lastCareerSync>=1)syncCareer();
        if(elapsed>=nextCareerCheckpoint){nextCareerCheckpoint=elapsed+15;queueCareerSave();}
      }
      ctx.uniforms.time.value=time;atmosphere.update(ambientDt*.15,time);arena.update(ambientDt,time,camera);
      const elev=Math.max(0,ctx.uniforms.sunDir.value.y);sun.position.copy(ctx.uniforms.sunDir.value).multiplyScalar(400);sun.color.copy(ctx.uniforms.sunColor.value);sun.intensity=.22+elev*2.25;hemi.intensity=.65+elev*.9;hemi.color.copy(ctx.uniforms.skyTop.value).lerp(daylight,.5);scene.fog.color.copy(ctx.uniforms.skyBottom.value);
      shadowTimer+=gameDt;if(shadowTimer>.4){renderer.shadowMap.needsUpdate=true;shadowTimer=0;}
      renderer.info.reset();renderer.setRenderTarget(sceneRT);renderer.clear();renderer.render(scene,camera);
      post.render(sceneRT);
      if(screen!=='menu'){
        ui.updateAim({tactical,melee:combat.weapon.kind==='knife',ads,accuracy:FPSRules.accuracy(combat)});
        viewState.ads=ads;viewState.adsBlend=FPSRules.accuracy(combat).adsBlend;viewState.moving=player.moving;viewState.sprinting=player.sprinting;viewState.reloadProgress=combat.reloadLeft>0?1-combat.reloadLeft/(combat.reloadDuration||combat.weapon.reloadTime):0;viewState.level=combat.level;viewState.activeSlot=combat.activeSlot;viewState.weaponKind=combat.weapon.kind;viewModel.update(gameDt,viewState);viewModel.render(renderer);
      }
      drawCalls=renderer.info.render.calls;triangles=renderer.info.render.triangles;frame++;if(frame%6===0)updateHUD();
      const previousQuality=display.effectiveQuality;
      display.sample(wall,fps,screen==='playing'&&locked&&frame>100);
      if(previousQuality!==display.effectiveQuality)applyEffectsQuality();
      if(!ready){ready=true;ui.setReady(true);updateHUD(true);}
    }catch(e){fail(e);}
  }
  function bind(){
    document.addEventListener('pointerlockchange',()=>{
      const wasLocked=locked,ownsLock=document.pointerLockElement===canvas;
      locked=ownsLock&&screen==='playing';
      if(ownsLock){
        if(controlRequest&&!controlRequest.promiseBased)controlRequest=null;
        if(!locked)document.exitPointerLock();
      }else if(wasLocked&&screen==='playing')pauseGame();
    });
    document.addEventListener('pointerlockerror',()=>{
      // Promise implementations emit this event before rejecting. Let the rejection
      // distinguish unsupported raw input from denial before pausing the game.
      if(controlRequest?.promiseBased||document.pointerLockElement===canvas)return;
      controlRequest=null;
      if(screen==='playing'){pauseGame();ui.toast('点击继续以捕获鼠标','info');}
    });
    document.addEventListener('mousemove',e=>{if(screen==='playing'&&locked&&document.pointerLockElement===canvas&&!ui.isCareerOpen())player.look(e.movementX,e.movementY,ads);});
    document.addEventListener('mousedown',e=>{if(screen!=='playing'||!locked||ui.isCareerOpen())return;if(e.button===0){if(!attackQueued)attackQueued='light';firing=combat.weapon.automatic;}if(e.button===2){if(combat.weapon.kind==='knife'){if(!attackQueued)attackQueued='heavy';ads=false;}else ads=aimMode==='toggle'?!ads:true;e.preventDefault();}});
    document.addEventListener('mouseup',e=>{if(e.button===0)firing=false;if(e.button===2&&aimMode==='hold')ads=false;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('keydown',e=>{if(!e.repeat&&tactical&&(screen==='dead'||screen==='extracted')&&['KeyR','Enter'].includes(e.code)){e.preventDefault();startGame();}});
    document.addEventListener('keydown',e=>{if(screen!=='playing'||ui.isCareerOpen())return;if(['KeyW','KeyA','KeyS','KeyD','Space','KeyR','KeyE','Digit1','Digit2','Digit3','Numpad1','Numpad2','Numpad3'].includes(e.code))e.preventDefault();keys[e.code]=true;if(!e.repeat){if(e.code==='Space'&&player.jump())audio.jump();if(e.code==='KeyR')reload();if(e.code==='Escape')pauseGame();const slot={Digit1:'primary',Digit2:'secondary',Digit3:'knife',Numpad1:'primary',Numpad2:'secondary',Numpad3:'knife'}[e.code];if(slot)equip(slot);}});
    document.addEventListener('keyup',e=>keys[e.code]=false);window.addEventListener('blur',pauseGame);document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseGame();});window.addEventListener('resize',()=>resizePending=true);
    window.addEventListener('pagehide',saveCareerNow);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;pauseGame();ui.toast('图形上下文已暂停，等待恢复','info');});
    canvas.addEventListener('webglcontextrestored',()=>{lost=false;resizePending=true;last=performance.now();renderer.shadowMap.needsUpdate=true;ui.toast('画面已恢复，点击继续战斗','info');});
  }
  try{
    const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});if(!gl)throw new Error('需要支持 WebGL 2 的桌面浏览器。');
    renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias:false});renderer.autoClear=false;renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;renderer.info.autoReset=false;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
    maxRenderDimension=Math.min(renderer.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
    renderer.debug.onShaderError=(g,p,vs,fs)=>{throw new Error('Shader: '+g.getShaderInfoLog(vs)+' '+g.getShaderInfoLog(fs));};
    scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xb4c3bd,.001);camera=new THREE.PerspectiveCamera(57,innerWidth/Math.max(innerHeight,1),.09,1800);world=makeArenaWorld({tactical});camera.position.set(98,66,102);camera.lookAt(0,0,0);
    ctx={THREE,scene,camera,renderer,world,rng:seededRandom,hdrType:gl.getExtension('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,uniforms:{time:{value:0},sunDir:{value:new THREE.Vector3(.5,.65,-.5).normalize()},sunColor:{value:new THREE.Color(1,.85,.65)},skyTop:{value:new THREE.Color(.2,.4,.65)},skyBottom:{value:new THREE.Color(.7,.75,.75)}}};
    hemi=new THREE.HemisphereLight(0xc5dcf3,0x42532b,1.3);scene.add(hemi);sun=new THREE.DirectionalLight(0xffd7a3,2);sun.castShadow=true;sun.shadow.mapSize.set(512,512);sun.shadow.camera.left=-210;sun.shadow.camera.right=210;sun.shadow.camera.top=210;sun.shadow.camera.bottom=-210;sun.shadow.camera.near=10;sun.shadow.camera.far=750;sun.shadow.normalBias=.7;sun.shadow.bias=-.00012;scene.add(sun);
    arena=createArena(ctx);
    sun.shadow.camera.left=-105;sun.shadow.camera.right=105;sun.shadow.camera.top=105;sun.shadow.camera.bottom=-105;
    atmosphere=createAtmosphere(ctx);scene.add(atmosphere.group);atmosphere.setDay(.36);post=createPost(ctx);viewModel=createViewModel(THREE);player=new FPSPlayer(world,arena.colliders);effects=createCombatEffects(ctx);createObjectiveMarkers();
    setSensitivity(sensitivity);
    enemies=createEnemies({THREE,scene,world,tactical,colliders:arena.colliders,rng:seededRandom,trace,getDifficulty:()=>difficulty,canStand:(x,z,r)=>player.canStand(x,z,r),onPlayerHit:(amount,origin)=>{if(enemyFire)takeDamage(amount,origin);},onEnemyCue:(position,kind)=>{if(position.distanceTo(camera.position)<(kind==='step'?30:65))audio.cue(position,kind);},onEnemyShot:(a,b,type)=>{effects.tracer(a,b,true);if(a.distanceTo(camera.position)<95)audio.shot(true,type,a);},onKill:killed,onHit:()=>{}});
    minimap=createMinimap(document.getElementById('minimapCanvas'),world);
    if(enemies.group.parent!==scene)scene.add(enemies.group);
    sceneRT=makeTarget();bind();
    createFullscreenControls({onChange:()=>{resizePending=true;},onExit:pauseGame});
    applyEffectsQuality();
    const combatSnapshot=()=>Object.assign({},combat,{weapon:Object.assign({},combat.weapon),loadout:Object.fromEntries(Object.entries(combat.loadout).map(([slot,item])=>[slot,Object.assign({},item,{weapon:Object.assign({},item.weapon)})]))});
    const getState=()=>({map:mapId,tactical,mission:Object.assign(mission.snapshot(),{layout:mission.layout()}),runStats:{...runStats},accuracy:FPSRules.accuracy(combat),difficulty,ready,screen,locked,ads,time,elapsed,wave,minimap:minimap.getState(),deathCount,settings:{sensitivity,aimMode,crosshairStyle,quality:display.quality,renderScale:display.renderScale,adaptive:display.adaptive},spawn:lastSpawn?Object.assign({},lastSpawn):null,combat:combatSnapshot(),player:{position:camera.position.toArray(),feetY:player.position.y,grounded:player.grounded,yaw:player.yaw,pitch:player.pitch,vy:player.vy,velocity:{...player.velocity},speed:player.speed,precisionSpeed:player.precisionSpeed,walking:player.walking,sprinting:player.sprinting,footsteps:playerFootsteps,footstepListeners},enemies:enemies.stats(),targets:enemies.getTargets(),effects:effects.stats(),metrics:{fps,frameMs,drawCalls,triangles,...display.snapshot(),resolution:[renderer.domElement.width,renderer.domElement.height],resolutionLimited:renderDimensions.limited},errors:errors.slice()});
    window.CopperYardFPS={getState:()=>Object.assign(getState(),{feedback:ui.getFeedbackState(),melee:Object.assign({},meleeAttack,{damage:FPSRules.knifeAttack(meleeAttack.mode).damage,hitDelay:FPSRules.knifeAttack(meleeAttack.mode).hitDelay}),viewModel:viewModel.getState()}),getCareer:()=>{syncCareer();return career.snapshot();},openCareer,exportCareer,start:startGame,restart:startGame,pause:pauseGame,resume:resumeGame,setQuality,setSensitivity,setCrosshairStyle,setRenderScale,setAdaptive,sampleTerrain:(x,z)=>world.height(x,z),debug:{
      setPlayer(o={}){const x=finite(o.x,player.position.x),z=finite(o.z,player.position.z),yaw=finite(o.yaw,player.yaw),pitch=finite(o.pitch,player.pitch);if(Number.isFinite(o.x)||Number.isFinite(o.z)){player.reset(x,z,yaw);footstepDistance=0;}player.yaw=yaw;player.pitch=clamp(pitch,-1.42,1.42);player.recoil=0;updateEye(0);},
      damagePlayer:amount=>takeDamage(amount),setEnemyFire:v=>enemyFire=!!v,getTargets:()=>enemies.getTargets(),getColliderSample:()=>arena.colliders.filter(c=>c.kind==='tree').slice(0,40),traceShot:trace,fire:shoot,
      aimAtEnemy(id,zone='head'){const t=enemies.getTargets().find(e=>e.id===id&&e.alive);if(!t)return false;shotEnd.fromArray(zone==='head'?t.head:t.position);if(zone!=='head')shotEnd.y+=zone==='legs'?.55:1.25;shotDir.copy(shotEnd).sub(camera.position);player.yaw=Math.atan2(-shotDir.x,-shotDir.z);player.pitch=Math.atan2(shotDir.y,Math.hypot(shotDir.x,shotDir.z));player.recoil=0;updateEye(0);return true;},
      grantKills(n){for(let i=0;i<clamp(Math.floor(finite(n,0)),0,500);i++)FPSRules.registerKill(combat,'scout','upper');updateHUD(true);},
      setAmmo(a,r){combat.ammo=clamp(Math.floor(finite(a,0)),0,combat.weapon.magSize);combat.reserve=clamp(Math.floor(finite(r,0)),0,combat.reserveMax);combat.reloadLeft=0;combat.fireCooldown=0;updateHUD(true);},
      pickupAtPlayer(n){effects.drop({x:player.position.x,y:player.position.y,z:player.position.z},Math.max(0,finite(n,0)));},healthAtPlayer(n=30){effects.dropHealth(player.position,n);},getDrops:()=>effects.getDrops(),
      getColliders:()=>arena.colliders.map(c=>Object.assign({},c)),getWorldInfo:()=>({water:world.water,size:world.size,spawnCandidates:world.spawnPoints.length,zones:world.zones||[],extractPoints:world.extractPoints||[],nav:world.navStats?world.navStats():null})
    }};
    requestAnimationFrame(loop);
  }catch(e){fail(e);}
})();

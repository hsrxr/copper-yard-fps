/* Trusted mouse/keyboard acceptance on the standalone file in an isolated profile.
 * Debug placement isolates encounters; this is not an unassisted playthrough. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const entry=path.resolve(__dirname,'../index.html'),bytes=fs.readFileSync(entry),out=path.resolve(__dirname,process.env.COPPER_EVIDENCE||'artifacts');
const report={testedAt:new Date().toISOString(),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),checks:[],errors:[],external:[],limitations:['Isolated headless installed Chrome, actual offline file and trusted mouse/keyboard.','Debug placement/aim/HP/ammo used for deterministic encounter fixtures. Not a human unassisted playthrough.','Enemy fire enabled for lethal-burst validation; disabled only for isolated gun/interaction checks.']};
let browser,page,phase='setup';
const state=()=>page.evaluate(()=>CopperYardFPS.getState());
async function check(name,fn){phase=name;const detail=await fn();report.checks.push({name,status:'PASS',detail});console.log('PASS '+name);}
async function waitGame(seconds){const start=(await state()).elapsed;await page.waitForFunction(end=>CopperYardFPS.getState().elapsed>=end,start+seconds,{timeout:Math.max(12000,seconds*7000),polling:'raf'});}
async function screen(name){await page.screenshot({path:path.join(out,name+'.png')});}
async function playing(){await page.waitForFunction(()=>CopperYardFPS.getState().screen==='playing'&&document.pointerLockElement?.id==='scene',null,{timeout:8000});}
async function isolated(){await page.evaluate(()=>{CopperYardFPS.debug.setEnemyFire(false);CopperYardFPS.setQuality('low');CopperYardFPS.setAdaptive(false);});}
async function aim(id,zone='head'){await page.evaluate(([id,zone])=>CopperYardFPS.debug.aimAtEnemy(id,zone),[id,zone]);}
async function near(id){return page.evaluate(id=>{const d=CopperYardFPS.debug,t=d.getTargets().find(t=>t.id===id);for(const r of [7,5,9])for(const offset of [0,.3,-.3,.6,-.6]){const yaw=t.yaw+offset,x=t.position[0]+Math.sin(yaw)*r,z=t.position[2]+Math.cos(yaw)*r;d.setPlayer({x,z,pitch:0});const p=CopperYardFPS.getState().player.position;if(Math.hypot(p[0]-x,p[2]-z)>.2)continue;const dx=t.head[0]-p[0],dy=t.head[1]-p[1],dz=t.head[2]-p[2],dist=Math.hypot(dx,dy,dz);if(!d.traceShot({x:p[0],y:p[1],z:p[2]},{x:dx/dist,y:dy/dist,z:dz/dist},dist-.2)){d.aimAtEnemy(id);return{player:p,target:t};}}throw Error('No clear legal encounter location');},id);}
async function fire(){await page.mouse.down();await page.mouse.up();await waitGame(.16);}
async function retry(){const s=await state();if(s.screen==='playing'){await page.keyboard.press('Escape');await page.waitForFunction(()=>CopperYardFPS.getState().screen==='paused');}if(s.screen==='dead'||s.screen==='extracted')await page.keyboard.press('KeyR');else await page.locator('#pauseRestartButton').click();await playing();}
async function launchBrowser(){
 const options={headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']};
 if(process.env.COPPER_BROWSER)return chromium.launch({...options,executablePath:process.env.COPPER_BROWSER});
 if(process.env.COPPER_BROWSER_CHANNEL)return chromium.launch({...options,channel:process.env.COPPER_BROWSER_CHANNEL});
 try{return await chromium.launch({...options,channel:'chrome'});}catch(error){
  console.log('Installed Chrome unavailable; trying Playwright Chromium.');
  return chromium.launch(options);
 }
}
async function main(){
 fs.mkdirSync(out,{recursive:true});browser=await launchBrowser();
 page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push({phase,message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({phase,message:m.text()});});page.on('request',r=>{if(/^https?:/.test(r.url()))report.external.push(r.url());});await page.route(/^https?:/,r=>r.abort());
 await page.addInitScript(()=>{
  const old={
   'valley-fps.sensitivity':'0.41',
   'valley-fps.crosshairStyle':'gap',
   'valley-fps.aimMode':'toggle',
   'valley-fps.displaySettings':JSON.stringify({quality:'low',renderScale:.5,adaptive:false}),
   'valley-fps.career.v1':JSON.stringify({version:1,records:[],totals:{runs:7,kills:42}})
  };
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
  for(const [key,value] of Object.entries(old))set.call(localStorage,key,value);
  window.__storageAudit={reads:[],writes:[],old};
  Storage.prototype.getItem=function(key){window.__storageAudit.reads.push(String(key));return get.call(this,key);};
  Storage.prototype.setItem=function(key,value){window.__storageAudit.writes.push(String(key));return set.call(this,key,value);};
  window.__checkOldStorage=()=>Object.entries(old).every(([key,value])=>get.call(localStorage,key)===value);
 });
 await page.goto(pathToFileURL(entry).href+'?map=valley');await page.waitForFunction(()=>window.CopperYardFPS?.getState().ready,null,{timeout:45000});await screen('01-menu');
 await check('standalone map ignores legacy URL and settings without offering the valley mode',async()=>{
  const s=await state();assert.equal(s.map,'depot');assert.equal(s.tactical,true);
  assert.equal(await page.evaluate(()=>typeof window.ValleyFPS),'undefined');
  assert.ok(!(await page.locator('body').innerText()).includes('雾谷'));
  assert.equal(await page.locator('option[value=valley]').count(),0);
  assert.equal(s.settings.sensitivity,1);assert.equal(s.settings.crosshairStyle,'classic');assert.equal(s.settings.aimMode,'hold');
  const audit=await page.evaluate(()=>window.__storageAudit);
  assert.ok(audit.reads.length>0);assert.ok(audit.reads.every(key=>key.startsWith('copper-yard-fps.')),JSON.stringify(audit.reads));
  assert.equal((await page.evaluate(()=>CopperYardFPS.getCareer())).totals.runs,0);
  return{map:s.map,tactical:s.tactical,settings:s.settings,storageReads:audit.reads};
 });
 await page.locator('#startButton').click();await playing();
 await check('offline default mission, authored defenders, no initial wallhack',async()=>{const s=await state();assert.equal(s.tactical,true);assert.equal(s.enemies.alive,10);assert.equal(s.combat.hp,100);assert.equal(s.combat.ammo,20);assert.ok(s.minimap.enemies.length<10);await isolated();const before=s.player.position;await page.keyboard.down('KeyW');await waitGame(.8);await page.keyboard.up('KeyW');const after=await state();assert.ok(Math.hypot(after.player.position[0]-before[0],after.player.position[2]-before[2])>2);await screen('02-entry');return{spawn:s.spawn,enemyCount:s.enemies.alive,radar:s.minimap.enemies,movement:after.player.position};});
 await check('real headshot kills once with fixed weapon and no loot or heal',async()=>{assert.equal(await page.locator('#huntStatus').innerText(),'突破检查点');await near(1);await page.mouse.down({button:'right'});await waitGame(.3);await aim(1);const before=await state();assert.ok(before.accuracy.adsBlend>.99);await fire();const s=await state();assert.equal(s.targets.find(t=>t.id===1).alive,false);assert.equal(s.combat.kills,1);assert.equal(s.combat.level,1);assert.equal(s.combat.hp,100);assert.equal(s.combat.ammo,before.combat.ammo-1);assert.equal((await page.evaluate(()=>CopperYardFPS.debug.getDrops())).length,0);assert.ok(s.enemies.corpses>=1);await screen('03-headshot');await page.mouse.up({button:'right'});return{feedback:s.feedback,combat:s.combat,corpses:s.enemies.corpses};});
 await check('heavy helmet breaks visibly before a second headshot kills',async()=>{const id=(await state()).targets.find(t=>t.alive&&t.type==='heavy').id;await near(id);await page.mouse.down({button:'right'});await waitGame(.3);await aim(id);await fire();const first=await state(),t=first.targets.find(t=>t.id===id);assert.equal(t.alive,true);assert.equal(t.helmet,false);await screen('04-armor-break');await waitGame(.2);await aim(id);await fire();const second=await state();assert.equal(second.targets.find(t=>t.id===id).alive,false);await page.mouse.up({button:'right'});return{first:t,feedback:first.feedback,killed:second.combat.kills};});
 await check('body shots, independent magazine, empty reload cancellation and semiautomatic pistol',async()=>{await near(2);await page.mouse.down({button:'right'});await waitGame(.3);let used=0;while(used<3&&(await state()).targets.find(t=>t.id===2).alive){await aim(2,'upper');await fire();used++;}assert.equal((await state()).targets.find(t=>t.id===2).alive,false);assert.ok(used>=2&&used<=3);await page.mouse.up({button:'right'});await page.evaluate(()=>{CopperYardFPS.debug.setPlayer({x:6,z:84});CopperYardFPS.debug.setAmmo(0,40);});await page.keyboard.press('KeyR');await waitGame(.1);assert.ok((await state()).combat.reloadLeft>1.7);await page.keyboard.press('Digit2');await waitGame(.3);let s=await state();assert.equal(s.combat.reloadLeft,0);assert.equal(s.combat.ammo,8);await page.mouse.down();await waitGame(.8);await page.mouse.up();s=await state();assert.equal(s.combat.ammo,7);assert.equal(s.combat.loadout.primary.ammo,0);await page.keyboard.press('Digit1');await waitGame(.4);await page.keyboard.press('KeyR');await waitGame(2.1);s=await state();assert.equal(s.combat.ammo,20);assert.equal(s.combat.reserve,20);return{bodyShots:used,loadout:s.combat.loadout};});
 await check('actual enemy tell and three-hit lethality, one death settlement, rapid same-layout retry',async()=>{await retry();await page.evaluate(()=>{CopperYardFPS.setQuality('low');CopperYardFPS.setAdaptive(false);});const initial=await state();await near(1);await page.waitForFunction(()=>CopperYardFPS.getState().targets.some(t=>t.attackPhase==='tell'),null,{timeout:9000});const tell=await state();assert.equal(tell.combat.hp,100);assert.ok(tell.enemies.attackers<=2);await screen('05-enemy-tell');await page.waitForFunction(()=>CopperYardFPS.getState().screen==='dead',null,{timeout:25000,polling:'raf'});const dead=await state(),career=await page.evaluate(()=>CopperYardFPS.getCareer());assert.equal(dead.deathCount,1);assert.equal(dead.combat.hp,0);assert.ok(dead.runStats.damageTaken>=100);assert.equal(career.records[0].ruleset,'tactical-v2');assert.equal(career.records[0].outcome,'death');await screen('06-death');await retry();await isolated();const reset=await state();assert.equal(reset.mission.variant,initial.mission.variant);assert.equal(reset.combat.hp,100);assert.equal(reset.enemies.alive,10);assert.deepEqual(reset.mission.layout,initial.mission.layout);return{tell: tell.targets.filter(t=>t.attackPhase==='tell'),deathTime:dead.elapsed,damage:dead.runStats.damageTaken,record:career.records[0]};});
 await check('fixed medical point interrupted by release, then heals once',async()=>{const m=(await state()).mission.layout.medic;await page.evaluate(p=>{CopperYardFPS.debug.damagePlayer(70);CopperYardFPS.debug.setPlayer(p);},m);await waitGame(.1);await page.keyboard.down('KeyE');await waitGame(.6);assert.ok((await state()).mission.medProgress>.3);await page.keyboard.up('KeyE');await waitGame(.1);assert.equal((await state()).mission.medProgress,0);await page.keyboard.down('KeyE');await waitGame(1.6);await page.keyboard.up('KeyE');let s=await state();assert.equal(s.combat.hp,65);assert.equal(s.mission.medAvailable,false);await page.keyboard.down('KeyE');await waitGame(1.6);await page.keyboard.up('KeyE');assert.equal((await state()).combat.hp,65);await screen('07-medical');return{health:s.combat.hp,available:s.mission.medAvailable};});
 await check('pause freezes time and clears interaction, three objectives can finish with surviving enemies',async()=>{const goals=(await state()).mission.layout.objectives;await page.evaluate(p=>CopperYardFPS.debug.setPlayer(p),goals[0]);await page.keyboard.down('KeyE');await waitGame(.3);assert.ok((await state()).mission.progress>0);await page.keyboard.press('Escape');await page.keyboard.up('KeyE');let s=await state();assert.equal(s.screen,'paused');assert.equal(s.mission.progress,0);const elapsed=s.elapsed;await page.waitForTimeout(250);assert.equal((await state()).elapsed,elapsed);await page.locator('#resumeButton').click();await playing();await isolated();for(const p of goals){await page.evaluate(p=>CopperYardFPS.debug.setPlayer(p),p);await page.keyboard.down('KeyE');if(p.phase==='extract')await page.waitForFunction(()=>CopperYardFPS.getState().screen==='extracted',null,{timeout:18000});else await waitGame(p.required+.15);await page.keyboard.up('KeyE');}s=await state();assert.equal(s.mission.completed,true);assert.equal(s.enemies.alive,10);const c=await page.evaluate(()=>CopperYardFPS.getCareer());assert.equal(c.records[0].outcome,'extracted');assert.equal(c.records[0].ruleset,'tactical-v2');await screen('08-success');return{mission:s.mission,alive:s.enemies.alive,record:c.records[0]};});
 await check('new layout and toggle aim work; runtime remains offline and clean',async()=>{const v=(await state()).mission.variant;await page.locator('#newMissionButton').click();await playing();await isolated();assert.equal((await state()).mission.variant,(v+1)%3);await page.keyboard.press('Escape');await page.locator('#pauseAimMode').selectOption('toggle');await page.locator('#resumeButton').click();await playing();await page.mouse.click(700,400,{button:'right'});await waitGame(.3);assert.equal((await state()).ads,true);await page.mouse.click(700,400,{button:'right'});await waitGame(.2);assert.equal((await state()).ads,false);assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex'),report.sha256);const audit=await page.evaluate(()=>({writes:window.__storageAudit.writes,oldUntouched:window.__checkOldStorage()}));
 assert.ok(audit.writes.length>0);assert.ok(audit.writes.every(key=>key.startsWith('copper-yard-fps.')),JSON.stringify(audit.writes));assert.equal(audit.oldUntouched,true);
 return{variant:(await state()).mission.variant,settings:(await state()).settings,errors:report.errors,storage:audit};});
 await check('all four crosshairs stay selected while aiming and render scale is independent of effects',async()=>{
  for(const style of ['classic','dot','cross','gap']){
   await page.evaluate(style=>CopperYardFPS.setCrosshairStyle(style),style);
   assert.equal(await page.locator('#crosshair').getAttribute('data-style'),style);
   await page.mouse.click(700,400,{button:'right'});await waitGame(.3);
   assert.equal((await state()).ads,true);assert.equal(await page.locator('#crosshair').getAttribute('data-style'),style);
   assert.ok((await page.locator('#crosshair').getAttribute('class')).includes('ads'));
   await page.mouse.click(700,400,{button:'right'});await waitGame(.2);
  }
  await page.evaluate(()=>{CopperYardFPS.setRenderScale(.75);CopperYardFPS.setQuality('high');});await waitGame(.1);
  let s=await state();assert.equal(s.settings.renderScale,.75);assert.equal(s.settings.quality,'high');
  await page.evaluate(()=>{CopperYardFPS.setQuality('low');CopperYardFPS.setSensitivity(1.3);CopperYardFPS.setCrosshairStyle('dot');});
  s=await state();assert.equal(s.settings.renderScale,.75);
  return s.settings;
 });
 await check('standalone preferences persist after reload and leave original game storage untouched',async()=>{
  await page.reload();await page.waitForFunction(()=>window.CopperYardFPS?.getState().ready,null,{timeout:45000});
  const s=await state();assert.equal(s.screen,'menu');assert.equal(s.map,'depot');assert.equal(s.tactical,true);
  assert.equal(s.settings.sensitivity,1.3);assert.equal(s.settings.crosshairStyle,'dot');assert.equal(s.settings.aimMode,'toggle');
  assert.equal(s.settings.renderScale,.75);assert.equal(s.settings.quality,'low');
  const audit=await page.evaluate(()=>({reads:window.__storageAudit.reads,oldUntouched:window.__checkOldStorage()}));
  assert.ok(audit.reads.every(key=>key.startsWith('copper-yard-fps.')));assert.equal(audit.oldUntouched,true);
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
  return{settings:s.settings,storage:audit};
 });

}
(async()=>{try{await main();report.status='PASS';}catch(e){report.status='FAIL';report.checks.push({name:phase,status:'FAIL',error:e.stack});console.error(e.stack);if(page)try{await screen('failure');report.failureState=await state();}catch{}process.exitCode=1;}finally{if(browser)await browser.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));console.log(report.status+' '+report.checks.filter(c=>c.status==='PASS').length+'/'+report.checks.length);}})();

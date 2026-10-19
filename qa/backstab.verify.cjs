/* Real Chromium knife acceptance. Only the existing debug placement/aim/fire
 * toggles isolate encounters; enemy movement, facing, collision and hit timing
 * continue normally. No production attack or enemy-damage method is replaced. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const {isolateDesktopMouse}=require('./helpers/browser-input.cjs');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'index.html'),out=path.join(__dirname,'artifacts');
const meleeStyle=process.env.COPPER_MELEE_STYLE==='butterfly'?'butterfly':'classic';
const bytes=fs.readFileSync(entry),url=process.env.COPPER_URL||pathToFileURL(entry).href,tag=(process.env.COPPER_URL?'remote':'local')+(meleeStyle==='butterfly'?'-butterfly':'');
const report={testedAt:new Date().toISOString(),url,expectedSha256:crypto.createHash('sha256').update(bytes).digest('hex'),checks:[],errors:[],external:[],screenshots:[],limitations:['Trusted right/left mouse input in real headless Chrome. Existing debug placement/aim and enemy-fire toggle isolate encounters.','Enemy AI movement and facing remain active. Contact geometry is observed each rendered frame, without freezing or replacing the damage logic.','Unusual numerical damage inputs and exact angular boundaries are covered by separate unit tests.']};
let browser,page,phase='setup';
const state=()=>page.evaluate(()=>CopperYardFPS.getState());
async function check(name,fn){phase=name;const detail=await fn();report.checks.push({name,status:'PASS',detail});console.log('PASS '+name);}
async function waitGame(seconds){const s=await state();await page.waitForFunction(t=>CopperYardFPS.getState().elapsed>=t,s.elapsed+seconds,{timeout:20000});}
async function launch(){const options={headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']};if(process.env.COPPER_BROWSER)return chromium.launch({...options,executablePath:process.env.COPPER_BROWSER});try{return await chromium.launch({...options,channel:process.env.COPPER_BROWSER_CHANNEL||'chrome'});}catch{return chromium.launch(options);}}
async function setup(){
 await page.goto(url);await page.waitForFunction(()=>window.CopperYardFPS?.getState().ready,null,{timeout:45000});
 await page.locator('#meleeStyleSelect').selectOption(meleeStyle);
 await page.locator('#qualitySelect').selectOption('low');await page.locator('#menuAdaptiveEffects').uncheck();await page.locator('#startButton').click();
 await page.waitForFunction(()=>CopperYardFPS.getState().screen==='playing'&&document.pointerLockElement?.id==='scene');
 await page.evaluate(()=>CopperYardFPS.debug.setEnemyFire(false));await page.keyboard.press('Digit3');await waitGame(.55);
 assert.equal((await state()).combat.activeSlot,'knife');
}
async function place(side,zone='head',distance=1.8){
 return page.evaluate(({side,zone,distance})=>{
  const d=CopperYardFPS.debug;
  for(const target of d.getTargets().filter(t=>t.type==='heavy'&&t.alive&&t.helmet)){
   for(const offset of [0,.1,-.1,.2,-.2]){
    const direction=target.yaw+(side==='rear'?Math.PI:0)+offset;
    const x=target.position[0]+Math.sin(direction)*distance,z=target.position[2]+Math.cos(direction)*distance;
    d.setPlayer({x,z,pitch:0});const p=CopperYardFPS.getState().player.position;
    if(Math.hypot(p[0]-x,p[2]-z)>.1)continue;
    const aim=zone==='head'?target.head:[target.position[0],target.position[1]+1.25,target.position[2]],dx=aim[0]-p[0],dy=aim[1]-p[1],dz=aim[2]-p[2],r=Math.hypot(dx,dy,dz);
    if(d.traceShot({x:p[0],y:p[1],z:p[2]},{x:dx/r,y:dy/r,z:dz/r},r-.35))continue;
    d.aimAtEnemy(target.id,zone);return{id:target.id,side,zone,distance,position:p,target};
   }
  }
  throw Error('No unobstructed, legal heavy encounter');
 },{side,zone,distance});
}
async function attack(encounter,mode='heavy'){
 const before=await state(),careerBefore=await page.evaluate(()=>CopperYardFPS.getCareer().active);
 await page.evaluate(id=>{
  window.__backstabFrames=[];window.__backstabRecord=true;
  const read=()=>{if(!window.__backstabRecord)return;const s=CopperYardFPS.getState(),e=s.targets.find(t=>t.id===id),p=s.player.position,dx=p[0]-e.position[0],dz=p[2]-e.position[2],r=Math.hypot(dx,dz);window.__backstabFrames.push({elapsed:s.elapsed,melee:s.melee,target:e,player:p,facing:r>0?(dx*Math.sin(e.yaw)+dz*Math.cos(e.yaw))/r:0});requestAnimationFrame(read);};read();
 },encounter.id);
 await page.mouse.down({button:mode==='heavy'?'right':'left'});await page.waitForFunction(()=>CopperYardFPS.getState().melee.active);const windup=await state();await page.mouse.up({button:mode==='heavy'?'right':'left'});
 assert.equal(windup.melee.mode,mode);assert.equal(windup.targets.find(t=>t.id===encounter.id).hp,before.targets.find(t=>t.id===encounter.id).hp,'windup does not deal instant damage');
 await page.waitForFunction(()=>!CopperYardFPS.getState().melee.active);await waitGame(.08);
 const after=await state(),careerAfter=await page.evaluate(()=>CopperYardFPS.getCareer().active),frames=await page.evaluate(()=>{window.__backstabRecord=false;return window.__backstabFrames;});
 const contact=frames.findIndex((f,i)=>i>0&&(f.target.hp!==frames[i-1].target.hp||f.target.helmet!==frames[i-1].target.helmet||f.target.alive!==frames[i-1].target.alive));
 const preContact=contact>0?frames[contact-1]:frames.at(-1),postContact=contact>=0?frames[contact]:null;
 return{encounter,before,windup,after,careerBefore,careerAfter,preContact,postContact};
}
function unchangedGunStats(r){assert.equal(r.after.runStats.shots,r.before.runStats.shots);assert.equal(r.after.runStats.hits,r.before.runStats.hits);for(const k of ['shots','hits','headHits'])assert.equal(r.careerAfter[k],r.careerBefore[k]);for(const slot of ['primary','secondary']){assert.equal(r.after.combat.loadout[slot].ammo,r.before.combat.loadout[slot].ammo);assert.equal(r.after.combat.loadout[slot].reserve,r.before.combat.loadout[slot].reserve);}}
function detail(r){const id=r.encounter.id;return{encounter:r.encounter,before:r.before.targets.find(t=>t.id===id),after:r.after.targets.find(t=>t.id===id),preContact:r.preContact,postContact:r.postContact,feedback:r.after.feedback,stats:{before:r.before.combat,after:r.after.combat,careerBefore:r.careerBefore,careerAfter:r.careerAfter}};}
async function main(){
 fs.mkdirSync(out,{recursive:true});browser=await launch();page=await browser.newPage({viewport:{width:1440,height:900}});
 await isolateDesktopMouse(page,report);
 page.on('pageerror',e=>report.errors.push({phase,message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({phase,message:m.text()});});
 page.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)report.external.push(r.url());});if(!process.env.COPPER_URL)await page.route(/^https?:/,r=>r.abort());
 if(process.env.COPPER_URL){const res=await page.request.get(url);assert.ok(res.ok());report.sha256=crypto.createHash('sha256').update(await res.body()).digest('hex');assert.equal(report.sha256,report.expectedSha256,'served build equals local artifact');}else report.sha256=report.expectedSha256;
 await check('rear right-click executes a helmeted heavy once without gun statistics',async()=>{
  await setup();const r=await attack(await place('rear'));report.lastAttempt=detail(r);
  assert.ok(r.preContact.facing<-.5,'attacker remains inside rear cone at contact');const enemy=r.after.targets.find(t=>t.id===r.encounter.id);
  assert.equal(enemy.alive,false,'rear heavy knife must execute even when the first head impact would otherwise be absorbed by a helmet');assert.equal(enemy.hp,0);assert.equal(r.after.combat.kills-r.before.combat.kills,1);assert.equal(r.after.enemies.kills-r.before.enemies.kills,1);assert.equal(r.after.combat.score-r.before.combat.score,390);assert.equal(r.careerAfter.knifeKills-r.careerBefore.knifeKills,1);assert.equal(r.careerAfter.heavyKills-r.careerBefore.heavyKills,1);assert.equal(r.after.feedback.feed.length-r.before.feedback.feed.length,1);unchangedGunStats(r);
  assert.ok(r.postContact.elapsed-r.windup.elapsed>=.18,'heavy knife retains its windup');assert.equal(r.windup.melee.hitDelay,.28);assert.ok(r.windup.combat.fireCooldown>.8);
  assert.equal(r.after.feedback.backstab,true);assert.equal(r.after.feedback.kind,'headshotKill','chosen headshot-kill sound route is preserved');assert.equal(r.after.feedback.feed[0].backstab,true);assert.match(await page.locator('#combatLabel').textContent(),/背刺击杀/);assert.match(await page.locator('#killFeed0').textContent(),/背刺击杀/);
  const screenshot='backstab-'+tag+'-heavy.png';await page.screenshot({path:path.join(out,screenshot)});report.screenshots.push(screenshot);await waitGame(1.15);const later=await state();assert.equal(later.combat.kills,r.after.combat.kills);assert.equal((await page.evaluate(()=>CopperYardFPS.getCareer().active)).knifeKills,r.careerAfter.knifeKills);delete report.lastAttempt;return detail(r);
 });
 await check('frontal heavy head strike breaks the helmet without execution',async()=>{
  await setup();const r=await attack(await place('front'));assert.ok(r.preContact.facing>.5,'contact is frontal');const enemy=r.after.targets.find(t=>t.id===r.encounter.id),prior=r.before.targets.find(t=>t.id===r.encounter.id);assert.equal(enemy.alive,true);assert.equal(enemy.hp,prior.hp);assert.equal(enemy.helmet,false);assert.equal(r.after.feedback.kind,'armorBreak');assert.equal(r.after.combat.kills,r.before.combat.kills);assert.equal(r.careerAfter.knifeKills,r.careerBefore.knifeKills);unchangedGunStats(r);return detail(r);
 });
 await check('rear light knife does not receive the heavy execution privilege',async()=>{
  await setup();const r=await attack(await place('rear'),'light');assert.ok(r.preContact.facing<-.5);const enemy=r.after.targets.find(t=>t.id===r.encounter.id);assert.equal(enemy.alive,true);assert.equal(enemy.hp,enemy.maxHp);assert.equal(enemy.helmet,false);assert.equal(r.after.feedback.kind,'armorBreak');assert.equal(r.after.combat.kills,r.before.combat.kills);assert.equal(r.careerAfter.knifeKills,r.careerBefore.knifeKills);unchangedGunStats(r);return detail(r);
 });
 await check('rear heavy knife beyond melee range cannot execute or damage',async()=>{
  await setup();const r=await attack(await place('rear','head',4));const enemy=r.after.targets.find(t=>t.id===r.encounter.id);assert.equal(enemy.alive,true);assert.equal(enemy.hp,enemy.maxHp);assert.equal(enemy.helmet,true);assert.equal(r.postContact,null);assert.equal(r.after.combat.kills,r.before.combat.kills);assert.equal(r.careerAfter.knifeKills,r.careerBefore.knifeKills);unchangedGunStats(r);return detail(r);
 });
 await check('offline artifact and browser runtime stay clean',async()=>{assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);assert.deepEqual((await state()).errors,[]);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex'),report.expectedSha256,'artifact unchanged during acceptance');return{errors:report.errors,external:report.external};});
}
main().then(()=>report.status='PASS').catch(error=>{report.status='FAIL';report.phase=phase;report.failure=error.stack;console.error(error.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'backstab-'+tag+'.json'),JSON.stringify(report,null,2));console.log(report.status+' '+report.checks.length+' checks');});

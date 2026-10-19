/* Real Chromium input acceptance for the authored inspection gesture.
 * Existing debug hooks only isolate the scene and supply one controlled hit.
 * No production state mutation or test-only inspection trigger is used. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'index.html'),out=path.join(__dirname,'artifacts');
const bytes=fs.readFileSync(entry),url=process.env.COPPER_URL||pathToFileURL(entry).href,tag=process.env.COPPER_URL?'remote':'local';
const report={testedAt:new Date().toISOString(),url,expectedSha256:crypto.createHash('sha256').update(bytes).digest('hex'),checks:[],errors:[],external:[],screenshots:[],limitations:['Real headless Chrome keyboard and mouse input; existing debug placement and enemy fire toggle isolate the encounter.','Controlled damage and empty ammunition use existing debug hooks. Screenshots supplement numerical pose and lifecycle assertions.']};
let browser,page,phase='setup';
const state=()=>page.evaluate(()=>CopperYardFPS.getState());
async function check(name,fn){phase=name;const detail=await fn();report.checks.push({name,status:'PASS',detail});console.log('PASS '+name);}
async function waitGame(seconds){const s=await state();await page.waitForFunction(t=>CopperYardFPS.getState().elapsed>=t,s.elapsed+seconds,{timeout:20000});}
async function playing(){await page.waitForFunction(()=>CopperYardFPS.getState().screen==='playing'&&document.pointerLockElement?.id==='scene');}
async function inspect(){await page.keyboard.press('KeyY');const s=await state();assert.ok(s.viewModel.inspection?.active,'Y starts inspection');return s;}
async function idle(){await page.waitForFunction(()=>!CopperYardFPS.getState().viewModel.inspection?.active);await waitGame(.15);}
async function equip(key,slot){await page.keyboard.press(key);await waitGame(.55);assert.equal((await state()).viewModel.activeSlot,slot);}
async function snapshot(name){const file='inspect-'+tag+'-'+name+'.png';await page.screenshot({path:path.join(out,file)});report.screenshots.push(file);}
function near(a,b,epsilon=1e-7){assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<=epsilon,`${i}: ${v} differs from ${b[i]}`));}
function stableFacts(s){return {position:s.player.position,yaw:s.player.yaw,pitch:s.player.pitch,ammo:s.combat.ammo,reserve:s.combat.reserve,fireCooldown:s.combat.fireCooldown,switchCooldown:s.combat.switchCooldown,spread:s.accuracy.spread};}
async function launch(){const options={headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']};if(process.env.COPPER_BROWSER)return chromium.launch({...options,executablePath:process.env.COPPER_BROWSER});try{return await chromium.launch({...options,channel:process.env.COPPER_BROWSER_CHANNEL||'chrome'});}catch{return chromium.launch(options);}}
async function main(){
 fs.mkdirSync(out,{recursive:true});browser=await launch();page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push({phase,message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({phase,message:m.text()});});
 page.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)report.external.push(r.url());});
 if(!process.env.COPPER_URL)await page.route(/^https?:/,r=>r.abort());
 if(process.env.COPPER_URL){const res=await page.request.get(url);assert.ok(res.ok());report.sha256=crypto.createHash('sha256').update(await res.body()).digest('hex');assert.equal(report.sha256,report.expectedSha256,'served build equals local artifact');}else report.sha256=report.expectedSha256;
 await page.goto(url);await page.waitForFunction(()=>window.CopperYardFPS?.getState().ready,null,{timeout:45000});
 await page.locator('#qualitySelect').selectOption('low');await page.locator('#menuAdaptiveEffects').uncheck();await page.locator('#startButton').click();await playing();
 await page.evaluate(()=>{CopperYardFPS.debug.setEnemyFire(false);CopperYardFPS.debug.setPlayer({x:6,z:84,yaw:0,pitch:0});});await waitGame(.6);
 for(const [key,slot]of [['Digit1','primary'],['Digit2','secondary'],['Digit3','knife']])await check(slot+' inspection animates then returns to ready without gameplay changes',async()=>{
  await equip(key,slot);const before=await state(),started=await inspect();assert.equal(started.viewModel.inspection.slot,slot);assert.ok(started.viewModel.inspection.duration>=1.5&&started.viewModel.inspection.duration<=3.5);
  await waitGame(.85);const middle=await state();assert.ok(middle.viewModel.inspection.active);assert.notDeepEqual(middle.viewModel.pose,before.viewModel.pose,'gesture moves the viewmodel');assert.deepEqual(stableFacts(middle),stableFacts(before),'inspection is cosmetic');await snapshot(slot+'inspect');
  await idle();const after=await state();near(after.viewModel.pose.position,before.viewModel.pose.position);near(after.viewModel.pose.rotation,before.viewModel.pose.rotation);assert.deepEqual(stableFacts(after),stableFacts(before));await snapshot(slot+'ready');return {duration:started.viewModel.inspection.duration,before:before.viewModel.pose,middle:middle.viewModel.pose,after:after.viewModel.pose};
 });
 await check('Y key repeat does not restart and a fresh Y cancels',async()=>{
  await page.keyboard.down('KeyY');await waitGame(.3);const a=await state();assert.ok(a.viewModel.inspection.active);await page.keyboard.down('KeyY');await waitGame(.15);const b=await state();assert.ok(b.viewModel.inspection.active);assert.ok(b.viewModel.inspection.elapsed>a.viewModel.inspection.elapsed);await page.keyboard.up('KeyY');await page.keyboard.press('KeyY');assert.equal((await state()).viewModel.inspection.active,false);return{beforeRepeat:a.viewModel.inspection,afterRepeat:b.viewModel.inspection};
 });
 await check('movement and turning remain available without interrupting inspection',async()=>{
  await equip('Digit1','primary');const before=await inspect();await page.keyboard.down('KeyD');await page.mouse.move(740,452);await waitGame(.3);await page.keyboard.up('KeyD');const during=await state();assert.ok(during.viewModel.inspection.active);assert.ok(Math.hypot(during.player.position[0]-before.player.position[0],during.player.position[2]-before.player.position[2])>.2);assert.notEqual(during.player.yaw,before.player.yaw);await page.keyboard.press('KeyY');await waitGame(.8);return{before:before.player,during:during.player};
 });
 for(const [key,slot]of [['Digit1','primary'],['Digit2','secondary'],['Digit3','knife']])await check(slot+' inspection continues through takeoff and landing without restarting',async()=>{
  await equip(key,slot);const started=await inspect();await waitGame(.25);const beforeJump=await state();await page.keyboard.press('Space');await waitGame(.12);const airborne=await state();
  assert.equal(airborne.player.grounded,false,'Space actually makes the player airborne');assert.ok(airborne.viewModel.inspection.active,'jump preserves inspection');assert.equal(airborne.viewModel.inspection.slot,slot);assert.ok(airborne.viewModel.inspection.elapsed>beforeJump.viewModel.inspection.elapsed,'inspection keeps its progress');
  assert.ok(Math.abs((airborne.viewModel.inspection.elapsed-beforeJump.viewModel.inspection.elapsed)-(airborne.elapsed-beforeJump.elapsed))<.08,'inspection advances with game time instead of restarting');
  await page.waitForFunction(()=>CopperYardFPS.getState().player.grounded);const landed=await state();assert.ok(landed.viewModel.inspection.active,'landing preserves inspection');assert.ok(landed.viewModel.inspection.elapsed>airborne.viewModel.inspection.elapsed);
  await idle();const finished=await state();assert.equal(finished.viewModel.inspection.active,false);assert.ok(finished.elapsed-started.elapsed>=started.viewModel.inspection.duration-.03,'inspection reaches its natural end');return{beforeJump:beforeJump.viewModel.inspection,airborne:airborne.viewModel.inspection,landed:landed.viewModel.inspection,finished:finished.viewModel.inspection};
 });
 await check('holding Space while airborne allows Y to start and cancel inspection',async()=>{
  await equip('Digit1','primary');await page.keyboard.down('Space');let started,canceled;try{await waitGame(.12);assert.equal((await state()).player.grounded,false);started=await inspect();await waitGame(.1);const progressing=await state();assert.equal(progressing.player.grounded,false);assert.ok(progressing.viewModel.inspection.active);assert.ok(progressing.viewModel.inspection.elapsed>started.viewModel.inspection.elapsed);await page.keyboard.press('KeyY');canceled=await state();assert.equal(canceled.viewModel.inspection.active,false,'fresh Y cancels while jump is held');}finally{await page.keyboard.up('Space');}
  await page.waitForFunction(()=>CopperYardFPS.getState().player.grounded);await waitGame(.2);return{started:started.viewModel.inspection,canceled:canceled.viewModel.inspection};
 });
 await check('R even with a full magazine, E and same-slot selection interrupt immediately',async()=>{
  const events=[];for(const key of ['KeyR','KeyE','Digit1']){const before=await inspect();await page.keyboard.press(key);const after=await state();assert.equal(after.viewModel.inspection.active,false,key+' cancels');if(key==='KeyR'){assert.equal(before.combat.ammo,before.combat.weapon.magSize);assert.equal(after.combat.reloadLeft,0);}events.push({key,inspection:after.viewModel.inspection});await waitGame(.2);}return events;
 });
 await check('left click interrupts inspection and fires without an inspection delay',async()=>{
  await equip('Digit2','secondary');const before=await inspect();await page.mouse.down();await page.waitForFunction(ammo=>CopperYardFPS.getState().combat.ammo<ammo,before.combat.ammo);const fired=await state();await page.mouse.up();assert.equal(fired.viewModel.inspection.active,false);assert.equal(fired.combat.ammo,before.combat.ammo-1);assert.ok(fired.elapsed-before.elapsed<.2,'fire is consumed on the next simulation step');assert.ok(fired.combat.fireCooldown>0);await page.keyboard.press('KeyY');assert.equal((await state()).viewModel.inspection.active,false,'shot cooldown blocks a new inspection');await waitGame(.5);return{beforeAmmo:before.combat.ammo,afterAmmo:fired.combat.ammo,gameTimeToFire:fired.elapsed-before.elapsed,fireCooldown:fired.combat.fireCooldown};
 });
 await check('right click takes priority and ADS prevents a new inspection',async()=>{
  await inspect();await page.mouse.down({button:'right'});await waitGame(.1);let s=await state();assert.equal(s.viewModel.inspection.active,false);assert.equal(s.ads,true);await page.keyboard.press('KeyY');s=await state();assert.equal(s.viewModel.inspection.active,false);await page.mouse.up({button:'right'});await waitGame(.5);return{ads:s.ads,inspection:s.viewModel.inspection};
 });
 await check('reload and weapon switch keep priority over inspection',async()=>{
  await inspect();await page.keyboard.press('KeyR');let s=await state();assert.ok(s.combat.reloadLeft>0);assert.equal(s.viewModel.inspection.active,false);await page.keyboard.press('KeyY');assert.equal((await state()).viewModel.inspection.active,false);await page.waitForFunction(()=>CopperYardFPS.getState().combat.reloadLeft===0);await waitGame(.2);
  await inspect();await page.keyboard.press('Digit3');s=await state();assert.ok(s.combat.switchCooldown>0);assert.equal(s.viewModel.inspection.active,false);await page.keyboard.press('KeyY');assert.equal((await state()).viewModel.inspection.active,false);await waitGame(.6);return{switchCooldown:s.combat.switchCooldown};
 });
 await check('knife attack windup and recovery block inspection, and inspection never delays a strike',async()=>{
  await inspect();await page.mouse.down({button:'right'});await page.waitForFunction(()=>CopperYardFPS.getState().melee.active);await page.mouse.up({button:'right'});let s=await state();assert.equal(s.viewModel.inspection.active,false);await page.keyboard.press('KeyY');assert.equal((await state()).viewModel.inspection.active,false);
  await page.waitForFunction(()=>CopperYardFPS.getState().viewModel.melee.phase==='recover');await page.keyboard.press('KeyY');s=await state();assert.equal(s.viewModel.inspection.active,false);assert.equal(s.viewModel.melee.active,true);await waitGame(1.1);await inspect();await page.keyboard.press('KeyY');return{recovery:s.viewModel.melee};
 });
 await check('a held semiautomatic fire button blocks inspection even after cooldown expires',async()=>{
  await equip('Digit2','secondary');await page.mouse.down();await waitGame(.5);let s=await state();assert.equal(s.combat.fireCooldown,0);await page.keyboard.press('KeyY');assert.equal((await state()).viewModel.inspection.active,false);await page.mouse.up();await inspect();await page.keyboard.press('KeyY');return{fireCooldown:s.combat.fireCooldown};
 });
 await check('taking damage cancels inspection',async()=>{
  const before=await inspect();await page.evaluate(()=>CopperYardFPS.debug.damagePlayer(1));const after=await state();assert.equal(after.viewModel.inspection.active,false);assert.ok(after.runStats.damageTaken>before.runStats.damageTaken);return{damageTaken:after.runStats.damageTaken-before.runStats.damageTaken};
 });
 await check('empty fire still cancels inspection even when no shot or reload is possible',async()=>{
  await page.evaluate(()=>CopperYardFPS.debug.setAmmo(0,0));await inspect();await page.mouse.down();await waitGame(.1);await page.mouse.up();const s=await state();assert.equal(s.viewModel.inspection.active,false);assert.equal(s.combat.ammo,0);assert.equal(s.combat.reloadLeft,0);return{ammo:s.combat.ammo,reserve:s.combat.reserve};
 });
 await check('pause, lost pointer lock and restart clear inspection with no residue on resume',async()=>{
  await waitGame(.4);await inspect();await waitGame(.4);await page.keyboard.press('Escape');await page.waitForFunction(()=>CopperYardFPS.getState().screen==='paused');assert.equal((await state()).viewModel.inspection.active,false);await page.locator('#resumeButton').click();await playing();await waitGame(.3);let s=await state();assert.equal(s.viewModel.inspection.active,false);await snapshot('resumed');
  await inspect();await page.evaluate(()=>document.exitPointerLock());await page.waitForFunction(()=>CopperYardFPS.getState().screen==='paused');assert.equal((await state()).viewModel.inspection.active,false);await page.locator('#resumeButton').click();await playing();await waitGame(.3);assert.equal((await state()).viewModel.inspection.active,false);
  await inspect();await page.keyboard.press('Escape');await page.waitForFunction(()=>CopperYardFPS.getState().screen==='paused');await page.locator('#pauseRestartButton').click();await playing();await page.evaluate(()=>CopperYardFPS.debug.setEnemyFire(false));await waitGame(.3);s=await state();assert.equal(s.viewModel.inspection.active,false);assert.equal(s.viewModel.activeSlot,'primary');near(s.viewModel.pose.position,[.245,-.235,-.38]);near(s.viewModel.pose.rotation,[0,0,0]);return{afterRestart:s.viewModel};
 });
 await check('offline artifact remains self-contained and runtime stays clean',async()=>{assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);const s=await state();assert.deepEqual(s.errors,[]);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex'),report.expectedSha256,'artifact unchanged during acceptance');return{errors:report.errors,external:report.external};});
}
main().then(()=>report.status='PASS').catch(error=>{report.status='FAIL';report.phase=phase;report.failure=error.stack;console.error(error.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'inspect-'+tag+'.json'),JSON.stringify(report,null,2));console.log(report.status+' '+report.checks.length+' checks');});

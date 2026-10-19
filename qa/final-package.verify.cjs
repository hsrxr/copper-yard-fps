/* Final generated artifact smoke check; the longer mission acceptance is separate. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'index.html'),bytes=fs.readFileSync(entry);
const report={testedAt:new Date().toISOString(),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),checks:[],errors:[],external:[],limitations:['Final artifact smoke test. See verification.json for the earlier 11-check mission acceptance and its own SHA256.','Empty-ammunition state is set through the debug fixture; firing and weapon switch use trusted input.']};
const out=path.join(__dirname,'artifacts');
(async()=>{
 let browser;
 try{
  const html=bytes.toString('utf8'),sources=[...html.matchAll(/<script>\n\/\* Embedded source: ([^\n]+) \*\/\n([\s\S]*?)\n<\/script>/g)];
  assert.equal(sources.length,17);
  for(const [,name,source]of sources)assert.equal(source,fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n').replace(/<\/script/g,'<\\/script'),name);
  assert.ok(html.includes(fs.readFileSync(path.join(root,'vendor/THREE-LICENSE.txt'),'utf8').replace(/\r\n/g,'\n')));
  report.checks.push({name:'17 embedded scripts match final source and inline Three license is present',status:'PASS'});
  const options={headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']};
  if(process.env.COPPER_BROWSER)browser=await chromium.launch({...options,executablePath:process.env.COPPER_BROWSER});
  else if(process.env.COPPER_BROWSER_CHANNEL)browser=await chromium.launch({...options,channel:process.env.COPPER_BROWSER_CHANNEL});
  else try{browser=await chromium.launch({...options,channel:'chrome'});}catch{browser=await chromium.launch(options);}
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url()))report.external.push(r.url());});await page.route(/^https?:/,route=>route.abort());
  await page.goto(pathToFileURL(entry).href+'?map=valley');
  await page.waitForFunction(()=>window.CopperYardFPS?.getState().ready,null,{timeout:45000});
  await page.locator('#startButton').click();
  await page.waitForFunction(()=>CopperYardFPS.getState().screen==='playing'&&document.pointerLockElement?.id==='scene');
  const initial=await page.evaluate(()=>CopperYardFPS.getState());assert.equal(initial.map,'depot');assert.equal(initial.tactical,true);assert.equal(initial.enemies.alive,10);
  report.checks.push({name:'final standalone file starts the Copper Yard tactical mission offline',status:'PASS'});
  await page.evaluate(()=>{CopperYardFPS.debug.setEnemyFire(false);CopperYardFPS.setQuality('low');CopperYardFPS.setAdaptive(false);CopperYardFPS.debug.setAmmo(0,0);});
  await page.mouse.down();await page.mouse.up();
  await page.waitForFunction(()=>document.getElementById('upgradeToast').textContent==='当前武器弹药耗尽 · 切换其他武器或战术刀');
  assert.ok((await page.locator('#upgradeToast').getAttribute('class')).includes('on'));
  const empty=await page.evaluate(()=>CopperYardFPS.getState());assert.equal(empty.combat.ammo,0);assert.equal(empty.combat.reserve,0);assert.equal(empty.combat.reloadLeft,0);
  const toast=await page.locator('#upgradeToast').innerText();assert.ok(!toast.includes('弹药箱'));
  await page.keyboard.press('Digit2');
  await page.waitForFunction(()=>CopperYardFPS.getState().combat.activeSlot==='secondary');
  const secondary=await page.evaluate(()=>CopperYardFPS.getState());assert.equal(secondary.combat.ammo,8);
  report.checks.push({name:'empty ammo gives actionable weapon-switch advice and secondary remains available',status:'PASS',detail:{toast,ammo:empty.combat.ammo,reserve:empty.combat.reserve,secondaryAmmo:secondary.combat.ammo}});
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex'),report.sha256);
  report.status='PASS';console.log('PASS final artifact smoke 3/3');
 }catch(error){report.status='FAIL';report.failure=error.stack;process.exitCode=1;console.error(error.stack);}
 finally{if(browser)await browser.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'final-package.verify.json'),JSON.stringify(report,null,2));}
})();

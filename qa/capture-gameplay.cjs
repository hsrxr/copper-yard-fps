const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 let browser;
 try{
  const options={headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']};
  if(process.env.COPPER_BROWSER)browser=await chromium.launch({...options,executablePath:process.env.COPPER_BROWSER});
  else if(process.env.COPPER_BROWSER_CHANNEL)browser=await chromium.launch({...options,channel:process.env.COPPER_BROWSER_CHANNEL});
  else try{browser=await chromium.launch({...options,channel:'chrome'});}catch{browser=await chromium.launch(options);}
  const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route(/^https?:/,route=>route.abort());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForFunction(()=>window.CopperYardFPS?.getState().ready,null,{timeout:45000});
  await page.locator('#startButton').click();
  await page.waitForFunction(()=>CopperYardFPS.getState().screen==='playing'&&document.pointerLockElement?.id==='scene');
  await page.evaluate(()=>{
   CopperYardFPS.debug.setEnemyFire(false);
   CopperYardFPS.setAdaptive(false);CopperYardFPS.setQuality('high');CopperYardFPS.setRenderScale(1);
   CopperYardFPS.debug.setPlayer({x:0,z:62,yaw:.28,pitch:-.035});
  });
  await page.waitForTimeout(1500);
  const out=path.join(__dirname,'artifacts');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'gameplay.png')});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('Captured QA fixture view: high effects, 100% scale, authored Copper Yard scene; placement and enemy fire controlled only for the image.');
 }finally{if(browser)await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

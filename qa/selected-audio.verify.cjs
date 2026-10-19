/* Render the real production Web Audio graph in Chrome and compare it against
 * the independently decoded selected WAV assets. Then exercise real game input.
 * Catches wrong candidate/event routes, delayed first shot, mute leaks, clipping,
 * unbounded voice lifetime, and a build that silently omits embedded samples. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'index.html'),localBytes=fs.readFileSync(entry),out=path.join(__dirname,'artifacts');
const tag=process.env.COPPER_URL?'remote':'local',url=process.env.COPPER_URL||pathToFileURL(entry).href;
const report={testedAt:new Date().toISOString(),url,expectedSha256:crypto.createHash('sha256').update(localBytes).digest('hex'),checks:[],errors:[],external:[],limitations:['Actual Chrome OfflineAudioContext waveform rendering and native AudioBufferSourceNode observation. No speaker or subjective listening measurement.','Trusted browser mouse/keyboard; debug placement isolates encounters and enemy damage is disabled.']};
let browser,page,phase='setup';
async function check(name,fn){phase=name;const detail=await fn();report.checks.push({name,status:'PASS',detail});console.log('PASS '+name);}
function wav(name){const b=fs.readFileSync(path.join(root,'assets/audio',name));assert.equal(b.toString('ascii',0,4),'RIFF');let fmt,pcm;for(let i=12;i+8<=b.length;){const n=b.readUInt32LE(i+4),id=b.toString('ascii',i,i+4);if(id==='fmt ')fmt=b.subarray(i+8,i+8+n);if(id==='data')pcm=b.subarray(i+8,i+8+n);i+=8+n+(n%2);}assert.ok(fmt&&pcm);assert.equal(fmt.readUInt16LE(0),1);assert.equal(fmt.readUInt16LE(2),1);assert.equal(fmt.readUInt16LE(14),16);return{sampleRate:fmt.readUInt32LE(4),pcm16:pcm.toString('base64')};}
const reference=Object.fromEntries(Object.entries({shot:'c-shot.wav',hit:'a-hit.wav',headshot:'a-headshot.wav',kill:'a-kill.wav',headshotKill:'a-headshot-kill.wav'}).map(([k,v])=>[k,wav(v)]));
async function launch(){const options={headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']};if(process.env.COPPER_BROWSER)return chromium.launch({...options,executablePath:process.env.COPPER_BROWSER});try{return await chromium.launch({...options,channel:process.env.COPPER_BROWSER_CHANNEL||'chrome'});}catch{return chromium.launch(options);}}
async function render(spec){return page.evaluate(async({reference,spec})=>{
 const rate=reference.shot.sampleRate,ctx=new OfflineAudioContext(1,Math.ceil(rate*(spec.duration||1)),rate),original=window.AudioContext;
 window.AudioContext=function(){return ctx;};
 const started=[],disconnected=new Set(),oldStart=AudioBufferSourceNode.prototype.start,oldDisconnect=AudioBufferSourceNode.prototype.disconnect;
 AudioBufferSourceNode.prototype.start=function(...args){started.push({node:this,t:args[0]??ctx.currentTime});return oldStart.apply(this,args);};
 AudioBufferSourceNode.prototype.disconnect=function(...args){disconnected.add(this);return oldDisconnect.apply(this,args);};
 try{
  const a=createGameAudio();if(spec.mutedBeforeInit)a.mute();a.init();
  const decoded={};for(const[k,v]of Object.entries(reference)){const raw=atob(v.pcm16),d=new Float32Array(raw.length/2);for(let i=0;i<d.length;i++){const n=raw.charCodeAt(2*i)|(raw.charCodeAt(2*i+1)<<8);d[i]=(n>=32768?n-65536:n)/32768;}decoded[k]=d;}
  function play(event){if(event==='shot'||event==='pistol')a.shot(false,event==='pistol'?'secondary':'primary');else if(event==='enemy')a.shot(true,'rifle',{x:5,y:0,z:0});else if(event==='aliasHit')a.hit(false);else if(event==='aliasHead')a.hit(true);else a.feedback(event==='default'?undefined:event);}
  const events=spec.events||[spec.event];for(const event of events)play(event);
  if(spec.restore){a.mute();play(spec.event);}
  const scheduled=[];for(const t of spec.schedule||[])scheduled.push(ctx.suspend(t).then(()=>{a.shot(false,'primary');a.feedback('headshotKill');return ctx.resume();}));
  const result=await ctx.startRendering();await Promise.all(scheduled);await new Promise(r=>setTimeout(r,20));
  const data=result.getChannelData(0),expected=new Float32Array(data.length);
  function add(key,t=0){const d=decoded[key],gain=key==='shot'?.55*.55:.75*.55,start=Math.round(t*rate);for(let i=0;i<d.length&&i+start<expected.length;i++)expected[i+start]+=d[i]*gain;}
  if(!spec.mutedBeforeInit||spec.restore){for(const event of events){const key=event==='pistol'?'shot':event==='aliasHit'||event==='body'||event==='default'?'hit':event==='aliasHead'?'headshot':event;if(decoded[key])add(key);}}
  let peak=0,maxError=0,energy=0;for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));maxError=Math.max(maxError,Math.abs(data[i]-expected[i]));energy+=data[i]*data[i];}
  return{rate,frames:data.length,peak,maxError,energy,started:started.length,released:started.filter(v=>disconnected.has(v.node)).length,times:started.map(v=>v.t)};
 }finally{window.AudioContext=original;AudioBufferSourceNode.prototype.start=oldStart;AudioBufferSourceNode.prototype.disconnect=oldDisconnect;}
 },{reference,spec});}
async function playing(){await page.waitForFunction(()=>CopperYardFPS.getState().screen==='playing'&&document.pointerLockElement?.id==='scene');}
async function waitGame(dt){const t=await page.evaluate(()=>CopperYardFPS.getState().elapsed);await page.waitForFunction(end=>CopperYardFPS.getState().elapsed>=end,t+dt,{timeout:15000});}
async function near(id,zone='head'){return page.evaluate(([id,zone])=>{const d=CopperYardFPS.debug,t=d.getTargets().find(t=>t.id===id);for(const r of [5,7,9])for(const offset of [0,.3,-.3,.6,-.6]){const yaw=t.yaw+offset,x=t.position[0]+Math.sin(yaw)*r,z=t.position[2]+Math.cos(yaw)*r;d.setPlayer({x,z,pitch:0});const p=CopperYardFPS.getState().player.position;if(Math.hypot(p[0]-x,p[2]-z)>.2)continue;const dx=t.head[0]-p[0],dy=t.head[1]-p[1],dz=t.head[2]-p[2],dist=Math.hypot(dx,dy,dz);if(!d.traceShot({x:p[0],y:p[1],z:p[2]},{x:dx/dist,y:dy/dist,z:dz/dist},dist-.2)){d.aimAtEnemy(id,zone);return;}}throw Error('No legal encounter');},[id,zone]);}
async function clearAudit(){await page.evaluate(()=>{window.__audioAudit.started.length=0;});}
async function shotKinds(){return page.evaluate(()=>window.__audioAudit.started.map(s=>s.kind));}
async function fire(){await page.mouse.down();await page.mouse.up();await waitGame(.18);}
async function main(){
 fs.mkdirSync(out,{recursive:true});browser=await launch();page=await browser.newPage({viewport:{width:1200,height:800}});
 page.on('pageerror',e=>report.errors.push({phase,message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({phase,message:m.text()});});
 const html=process.env.COPPER_URL?await page.request.get(url).then(async r=>{assert.ok(r.ok());const b=await r.body();report.sha256=crypto.createHash('sha256').update(b).digest('hex');return b.toString('utf8');}):localBytes.toString('utf8');
 report.sha256??=report.expectedSha256;assert.equal(report.sha256,report.expectedSha256,'served artifact must equal the local build');
 const effects=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('Embedded source: src/effects.js'));
 assert.ok(effects,'built effects script');
 const payload=html.match(/<script\b[^>]*\bid="combat-audio-samples"[^>]*>([\s\S]*?)<\/script>/);
 await page.setContent(payload?'<script id="combat-audio-samples" type="application/json">'+payload[1]+'</script>':'');await page.addScriptTag({content:effects});
 for(const event of ['shot','pistol','hit','body','default','aliasHit','headshot','aliasHead','kill','headshotKill'])await check('render selected '+event+' immediately after init',async()=>{const r=await render({event});assert.ok(r.energy>0,'event is audible');assert.ok(r.maxError<1e-6,`waveform differs from chosen PCM and gain: ${JSON.stringify(r)}`);assert.equal(r.started,1,'one authored result per event');assert.equal(r.released,1,'sample voice disconnected on completion');return r;});
 await check('selected overlapping shot and headshot kill preserve both timbres without clipping',async()=>{const r=await render({events:['shot','headshotKill']});assert.ok(r.maxError<1e-6);assert.ok(r.peak<1);assert.equal(r.released,2);return r;});
 await check('pre-init mute suppresses samples and procedural audio, unmute restores selected PCM',async()=>{const muted=await render({events:['shot','headshotKill','enemy','armorBreak'],mutedBeforeInit:true});assert.equal(muted.energy,0);const restored=await render({event:'shot',mutedBeforeInit:true,restore:true});assert.ok(restored.energy>0);assert.ok(restored.maxError<1e-6);return{muted,restored};});
 await check('sustained automatic fire and confirmations avoid clipping and release all voices',async()=>{const schedule=Array.from({length:39},(_,i)=>(i+1)*.1),r=await render({events:['shot','headshotKill'],duration:5,schedule});assert.equal(r.started,80);assert.equal(r.released,80);assert.ok(r.peak<1,`overlap peak ${r.peak}`);return r;});
 await check('non-selected enemy and armor sounds remain audible',async()=>{const enemy=await render({event:'enemy'}),armor=await render({event:'armorBreak'});assert.ok(enemy.energy>0);assert.ok(armor.energy>0);return{enemy,armor};});
 await page.close();page=await browser.newPage({viewport:{width:1200,height:800}});page.on('pageerror',e=>report.errors.push({phase,message:e.message}));page.on('console',m=>{if(m.type()==='error')report.errors.push({phase,message:m.text()});});page.on('request',r=>{if(/^https?:/.test(r.url())&&r.url()!==url)report.external.push(r.url());});
 if(!process.env.COPPER_URL)await page.route(/^https?:/,r=>r.abort());
 await page.addInitScript(({reference})=>{
  function signature(data){let h=2166136261;for(let i=0;i<data.length;i++)h=Math.imul(h^(Math.round(data[i]*32768)&65535),16777619);return data.length+':'+(h>>>0);}
  const known={};for(const[k,v]of Object.entries(reference)){const raw=atob(v.pcm16),d=new Float32Array(raw.length/2);for(let i=0;i<d.length;i++){const n=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);d[i]=(n>=32768?n-65536:n)/32768;}known[signature(d)]=k;}
  window.__audioAudit={started:[],decoded:0,fetches:0};const oldStart=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.__audioAudit.started.push({kind:this.buffer?known[signature(this.buffer.getChannelData(0))]||'procedural':'empty',time:this.context.currentTime});return oldStart.apply(this,args);};
  const decode=BaseAudioContext.prototype.decodeAudioData;BaseAudioContext.prototype.decodeAudioData=function(...args){window.__audioAudit.decoded++;return decode.apply(this,args);};const fetch=window.fetch;window.fetch=function(...args){window.__audioAudit.fetches++;return fetch.apply(this,args);};
 },{reference});
 await page.goto(url);await page.waitForFunction(()=>window.CopperYardFPS?.getState().ready,null,{timeout:45000});
 await page.locator('#qualitySelect').selectOption('low');await page.locator('#menuAdaptiveEffects').uncheck();await page.locator('#startButton').click();await playing();await page.evaluate(()=>{CopperYardFPS.debug.setEnemyFire(false);CopperYardFPS.debug.setPlayer({x:6,z:84,pitch:1});});
 await check('actual first rifle shot and pistol shot use C candidate buffer',async()=>{await clearAudit();await fire();let kinds=await shotKinds();assert.equal(kinds.filter(k=>k==='shot').length,1);const first=kinds;await page.keyboard.press('Digit2');await waitGame(.35);await clearAudit();await fire();kinds=await shotKinds();assert.equal(kinds.filter(k=>k==='shot').length,1);return{rifle:first,pistol:kinds};});
 await check('actual head and body impacts select A confirmations exactly once',async()=>{
  const details=[];await near(1);await page.mouse.down({button:'right'});await waitGame(.35);await page.evaluate(()=>CopperYardFPS.debug.aimAtEnemy(1,'head'));await clearAudit();await fire();let kinds=await shotKinds();assert.equal(kinds.filter(k=>k==='headshotKill').length,1,JSON.stringify(kinds));assert.equal(kinds.filter(k=>['hit','headshot','kill'].includes(k)).length,0);assert.equal(kinds.filter(k=>k==='shot').length,1);details.push({event:'headshotKill',kinds});await page.mouse.up({button:'right'});
  await page.keyboard.press('Digit1');await waitGame(.35);await near(2,'upper');await page.mouse.down({button:'right'});await waitGame(.35);
  let killed=false;for(let i=0;i<4;i++){await page.evaluate(()=>CopperYardFPS.debug.aimAtEnemy(2,'upper'));await clearAudit();await fire();kinds=await shotKinds();const feedback=kinds.filter(k=>['hit','kill','headshot','headshotKill'].includes(k));assert.equal(feedback.length,1,JSON.stringify(kinds));assert.ok(['hit','kill'].includes(feedback[0]));details.push({event:feedback[0],kinds});if(feedback[0]==='kill'){killed=true;break;}await waitGame(.25);}assert.ok(killed);assert.ok(details.some(d=>d.event==='hit'));await page.mouse.up({button:'right'});return details;
 });
 await check('standalone selected sounds require no fetch or asynchronous decoder and runtime is clean',async()=>{const audit=await page.evaluate(()=>window.__audioAudit);assert.equal(audit.decoded,0);assert.equal(audit.fetches,0);assert.deepEqual(report.external,[]);assert.deepEqual(report.errors,[]);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(entry)).digest('hex'),report.expectedSha256,'build unchanged during acceptance');return{decoded:audit.decoded,fetches:audit.fetches,errors:report.errors,external:report.external};});
}
main().then(()=>{report.status='PASS';}).catch(error=>{report.status='FAIL';report.phase=phase;report.failure=error.stack;console.error(error.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'selected-audio-'+tag+'.json'),JSON.stringify(report,null,2));console.log(report.status+' '+report.checks.length+' checks');});

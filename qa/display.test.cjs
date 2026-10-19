const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=path.join(__dirname,'../src/display.js');
if(fs.existsSync(source))require(source);
function api(){assert.ok(globalThis.FPSDisplay,'independent display settings must be available');return FPSDisplay;}
function advance(display,seconds,fps,active=true){for(let i=0;i<Math.round(seconds*20);i++)display.sample(.05,fps,active);}

test('native resolution includes device pixel ratio and does not depend on effects quality',()=>{
 const p=api();for(const quality of ['low','medium','high']){
  const d=p.create({quality});assert.equal(d.renderScale,1);
  const r=p.dimensions({width:1280,height:720,devicePixelRatio:2,renderScale:d.renderScale,maxDimension:16384});
  assert.equal(r.width,2560);assert.equal(r.height,1440);assert.equal(r.limited,false);
 }
});
test('all selectable resolution scales affect both axes, including supersampling',()=>{
 const p=api();for(const scale of [.5,.75,1,1.25,1.5]){
  const d=p.create({quality:'low',renderScale:scale});
  const r=p.dimensions({width:1440,height:900,devicePixelRatio:1,renderScale:d.renderScale,maxDimension:16384});
  assert.equal(r.width,1440*scale);assert.equal(r.height,900*scale);assert.equal(d.quality,'low');
 }
});
test('quality and auto-effects changes never overwrite selected resolution',()=>{
 const d=api().create({renderScale:.75});d.setQuality('high');d.setAdaptive(false);
 assert.equal(d.renderScale,.75);assert.equal(d.effectiveQuality,'high');
 d.setRenderScale(1.5);assert.equal(d.quality,'high');assert.equal(d.adaptive,false);
});
test('sustained slow frames step effects down while retaining the requested quality and resolution',()=>{
 const d=api().create({quality:'high',renderScale:1.25});advance(d,2.4,25);assert.equal(d.effectiveQuality,'high');
 advance(d,.2,25);assert.equal(d.effectiveQuality,'medium');advance(d,3,25);assert.equal(d.effectiveQuality,'low');
 advance(d,20,20);assert.equal(d.effectiveQuality,'low');assert.equal(d.quality,'high');assert.equal(d.renderScale,1.25);
});
test('recovery requires stable fast frames and never exceeds the chosen effects quality',()=>{
 const d=api().create({quality:'medium'});advance(d,3,25);assert.equal(d.effectiveQuality,'low');
 advance(d,14,60);assert.equal(d.effectiveQuality,'low');advance(d,2,60);assert.equal(d.effectiveQuality,'medium');
 advance(d,40,120);assert.equal(d.effectiveQuality,'medium');assert.equal(d.renderScale,1);
});
test('pause clears performance debt and invalid samples cannot change quality',()=>{
 const d=api().create({quality:'high'});advance(d,2.4,25);advance(d,30,10,false);advance(d,.3,25);
 assert.equal(d.effectiveQuality,'high');for(const [dt,fps] of [[NaN,1],[Infinity,1],[-1,1],[1,NaN],[1,Infinity],[1,0]])d.sample(dt,fps,true);
 assert.equal(d.effectiveQuality,'high');
});
test('disabling automation restores requested effects without changing resolution',()=>{
 const d=api().create({quality:'high',renderScale:.5});advance(d,6,25);assert.equal(d.effectiveQuality,'low');
 d.setAdaptive(false);assert.equal(d.effectiveQuality,'high');advance(d,30,15);assert.equal(d.effectiveQuality,'high');assert.equal(d.renderScale,.5);
});
test('changing resolution preserves an automatically lowered effects level',()=>{
 const d=api().create({quality:'high'});advance(d,3,25);d.setRenderScale(.75);
 assert.equal(d.effectiveQuality,'medium');assert.equal(d.quality,'high');assert.equal(d.renderScale,.75);
});
test('invalid saved settings fall back and snapshots cannot mutate live settings',()=>{
 for(const value of [null,[],false,'bad',{quality:'ultra',renderScale:0,adaptive:'false'}]){
  const d=api().create(value);assert.deepEqual(d.snapshot(),{quality:'medium',effectiveQuality:'medium',renderScale:1,adaptive:true});
  const snapshot=d.snapshot();snapshot.renderScale=.5;assert.equal(d.renderScale,1);
 }
});
test('GPU dimension limits preserve aspect and report the actual limited size',()=>{
 const r=api().dimensions({width:3840,height:2160,devicePixelRatio:2,renderScale:1.5,maxDimension:4096});
 assert.equal(r.width,4096);assert.equal(r.height,2304);assert.equal(r.limited,true);
 assert.ok(Math.abs(r.ratio-4096/3840)<1e-9);
});

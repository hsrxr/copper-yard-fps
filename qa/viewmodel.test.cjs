/* Knife pose timing uses the vendored Three implementation without a renderer. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const context=vm.createContext({console});context.window=context;
vm.runInContext(fs.readFileSync(path.join(root,'vendor/three-r160.min.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'src/viewmodel.js'),'utf8'),context);
function fixture(){const view=context.createViewModel(context.THREE);view.shoot('knife');view.cancelMelee();view.update(0,{activeSlot:'knife'});return view;}
function start(view,mode){view.shoot('knife',mode);view.update(.016,{activeSlot:'knife'});assert.equal(view.getState().melee.elapsed,0,'attack starts after the input frame simulation step');}
function advance(view,seconds,step=1/120){while(seconds>1e-9){const dt=Math.min(step,seconds);view.update(dt,{activeSlot:'knife'});seconds-=dt;}}
function near(a,b,tolerance=1e-7){assert.ok(Math.abs(a-b)<tolerance,`${a} ≈ ${b}`);}

test('light and heavy knife attacks have distinct anticipation and recovery timing',()=>{
  const light=fixture();start(light,'light');advance(light,.10);
  assert.equal(light.getState().melee.phase,'windup');
  advance(light,.03);assert.equal(light.getState().melee.phase,'strike');
  advance(light,.40);assert.equal(light.getState().melee.active,false);
  const heavy=fixture();start(heavy,'heavy');advance(heavy,.20);
  assert.equal(heavy.getState().melee.phase,'windup');
  assert.ok(heavy.getState().pose.position[1]>-.20,'heavy draw-back raises the hand');
  advance(heavy,.09);assert.equal(heavy.getState().melee.phase,'strike');
  advance(heavy,.35);assert.equal(heavy.getState().melee.phase,'recover');
  advance(heavy,.32);assert.equal(heavy.getState().melee.active,false);
});

test('each knife animation is continuous, finite, and returns exactly to its resting pose',()=>{
  for(const mode of ['light','heavy']){
    const view=fixture(),rest=view.getState().pose;start(view,mode);
    let previous=view.getState().pose,travel=0;
    for(let i=0;i<125;i++){
      view.update(.008,{activeSlot:'knife'});const pose=view.getState().pose;
      for(let axis=0;axis<3;axis++){
        assert.ok(Number.isFinite(pose.position[axis])&&Number.isFinite(pose.rotation[axis]));
        assert.ok(Math.abs(pose.position[axis]-previous.position[axis])<.055,'no positional teleport');
        assert.ok(Math.abs(pose.rotation[axis]-previous.rotation[axis])<.28,'no angular snap');
        travel+=Math.abs(pose.position[axis]-previous.position[axis]);
      }
      previous=pose;
    }
    assert.ok(travel>.5,'the gesture has visible reach and follow-through');
    for(let axis=0;axis<3;axis++){near(previous.position[axis],rest.position[axis]);near(previous.rotation[axis],rest.rotation[axis]);}
  }
});

test('pause freezes knife motion and cancellation prevents a stale strike after resume',()=>{
  const view=fixture();start(view,'heavy');advance(view,.22);const paused=view.getState();
  view.update(0,{activeSlot:'knife'});view.update(0,{activeSlot:'knife'});
  assert.equal(JSON.stringify(view.getState()),JSON.stringify(paused));
  view.cancelMelee();view.update(0,{activeSlot:'knife'});
  assert.equal(view.getState().melee.active,false);near(view.getState().pose.position[0],.29);
  start(view,'heavy');advance(view,.10);view.update(.02,{activeSlot:'primary'});
  assert.equal(view.getState().melee.active,false,'switching immediately cancels knife animation');
  view.reset();assert.equal(view.getState().activeSlot,'primary');assert.equal(view.getState().melee.active,false);
});

test('knife inspection snapshots cannot mutate animation and firearm recoil remains available',()=>{
  const view=fixture();start(view,'light');advance(view,.13);
  const snapshot=view.getState();snapshot.pose.position[0]=999;snapshot.melee.elapsed=999;
  assert.notEqual(view.getState().pose.position[0],999);assert.notEqual(view.getState().melee.elapsed,999);
  view.reset();const rest=view.getState().pose.position[2];view.shoot('primary');view.update(.016,{activeSlot:'primary'});
  assert.ok(view.getState().pose.position[2]>rest,'rifle kick still moves the weapon toward the eye');
  assert.equal(view.getState().melee.active,false);
});

function advanceState(view,seconds,state,step=1/120){while(seconds>1e-9){const dt=Math.min(step,seconds);view.update(dt,state);seconds-=dt;}}
function poseValues(view){const pose=view.getState().pose;return [...pose.position,...pose.rotation];}

test('negligible residual movement cannot start idle weapon sway in hip fire or ADS',()=>{
  for(const adsBlend of [0,1]){
    const view=context.createViewModel(context.THREE);view.reset();
    view.update(0,{adsBlend,moving:0});const idle=poseValues(view);
    for(let frame=0;frame<240;frame++){
      view.update(1/120,{adsBlend,moving:1e-8});
      assert.deepEqual(poseValues(view),idle,'numerical movement residue must not animate a stationary weapon');
    }
  }
});

test('stopping from a run settles exactly within 100 ms and stays still through ADS',()=>{
  for(const adsBlend of [0,1]){
    const view=context.createViewModel(context.THREE);view.reset();
    advanceState(view,.8,{moving:1,sprinting:true,adsBlend});
    const running=poseValues(view);advanceState(view,.04,{moving:1,sprinting:true,adsBlend});
    assert.notDeepEqual(poseValues(view),running,'running retains visible movement');
    advanceState(view,.1,{moving:0,sprinting:false,adsBlend});
    const stopped=poseValues(view);
    const reference=context.createViewModel(context.THREE);reference.reset();reference.update(0,{moving:0,adsBlend});
    assert.deepEqual(stopped,poseValues(reference),'after braking, return fully to the ready pose');
    for(let frame=0;frame<240;frame++){
      view.update(1/120,{moving:0,sprinting:false,adsBlend});
      assert.deepEqual(poseValues(view),stopped,'idle pose must not continue an exponentially shrinking oscillation');
    }
  }
});

test('slow movement bob uses actual speed instead of the full-speed animation',()=>{
  const slow=context.createViewModel(context.THREE),fast=context.createViewModel(context.THREE);
  slow.reset();fast.reset();
  advanceState(slow,.6,{moving:.25,adsBlend:1});advanceState(fast,.6,{moving:1,adsBlend:1});
  const slowPose=poseValues(slow),fastPose=poseValues(fast);
  assert.ok(Math.abs(fastPose[0])>.0001,'moving ADS retains a small visible bob');
  near(slowPose[0],fastPose[0]*.25);
  near(slowPose[4],fastPose[4]*.25);
});

test('pausing a moving weapon freezes the pose and stationary reload still animates',()=>{
  const view=context.createViewModel(context.THREE);view.reset();
  advanceState(view,.4,{moving:1,sprinting:true});const paused=poseValues(view);
  view.update(0,{moving:0,sprinting:false});assert.deepEqual(poseValues(view),paused);
  advanceState(view,.1,{moving:0,sprinting:false});const rest=poseValues(view);
  view.update(.016,{moving:0,reloadProgress:.5});
  assert.notDeepEqual(poseValues(view),rest,'reload is an intentional action, not idle sway');
});

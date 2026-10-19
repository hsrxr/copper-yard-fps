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

// Catch missing inspection, frozen endings and accidental changes to idle sway.
test('every weapon inspection is visible, continuous and returns exactly to ready',()=>{
  for(const slot of ['primary','secondary','knife'])for(const step of [1/30,1/144]){
    const view=context.createViewModel(context.THREE);view.reset();
    advanceState(view,.4,{activeSlot:slot});const rest=poseValues(view);
    assert.equal(typeof view.inspect,'function','weapons support inspection');
    assert.equal(view.inspect(slot),true);let previous=rest,travel=0;
    for(let seconds=0;seconds<3.5;seconds+=step){
      view.update(step,{activeSlot:slot});const pose=poseValues(view);
      for(let axis=0;axis<6;axis++){
        assert.ok(Number.isFinite(pose[axis]));
        assert.ok(Math.abs(pose[axis]-previous[axis])<(axis<3?.09:.3),'no pose teleport');
        travel+=Math.abs(pose[axis]-previous[axis]);
      }
      previous=pose;
    }
    assert.ok(travel>1,'inspection visibly turns and presents the weapon');
    assert.equal(view.getState().inspection.active,false);assert.deepEqual(poseValues(view),rest);
    advanceState(view,.5,{activeSlot:slot});assert.deepEqual(poseValues(view),rest);
  }
});

test('inspection never blocks firearm recoil or replaces a knife strike',()=>{
  for(const slot of ['primary','secondary','knife']){
    const view=context.createViewModel(context.THREE),reference=context.createViewModel(context.THREE);
    view.reset();reference.reset();advanceState(view,.4,{activeSlot:slot});advanceState(reference,.4,{activeSlot:slot});
    assert.equal(view.inspect(slot),true);advanceState(view,.7,{activeSlot:slot});
    view.shoot(slot,'heavy');reference.shoot(slot,'heavy');
    view.update(.016,{activeSlot:slot});reference.update(.016,{activeSlot:slot});
    assert.equal(view.getState().inspection.active,false);
    // Recoil roll is intentionally random; position/pitch/yaw must match.
    const actual=poseValues(view),expected=poseValues(reference);
    for(let axis=0;axis<5;axis++)near(actual[axis],expected[axis]);
    assert.equal(view.getState().melee.active,slot==='knife');
    if(slot==='knife')assert.equal(view.inspect(slot),false,'inspection cannot cancel a paid-for knife attack');
  }
});

test('inspection yields to ADS, reload, weapon switch, explicit cancellation and reset',()=>{
  for(const action of ['ads','reload','switch','cancel','reset']){
    const view=context.createViewModel(context.THREE);view.reset();assert.equal(view.inspect('primary'),true);
    advanceState(view,.7,{});
    if(action==='cancel')view.cancelInspect();if(action==='reset')view.reset();
    const state=action==='ads'?{ads:true,adsBlend:1}:action==='reload'?{reloadProgress:.3}:action==='switch'?{activeSlot:'secondary'}:{};
    view.update(.016,state);assert.equal(view.getState().inspection.active,false,action);
    if(['ads','reload','switch'].includes(action))assert.equal(view.inspect('primary'),false,'cannot restart over '+action);
  }
});

test('movement preserves inspection and a second press cancels without restarting it',()=>{
  const view=context.createViewModel(context.THREE);view.reset();assert.equal(view.inspect('primary'),true);
  advanceState(view,.6,{moving:1});assert.equal(view.getState().inspection.active,true);
  view.inspect('primary');view.update(.016,{});assert.equal(view.getState().inspection.active,false);
  advanceState(view,.5,{});assert.deepEqual(poseValues(view),[.245,-.235,-.38,0,0,0]);
});

function renderedScene(view){let scene;view.render({autoClear:true,clearDepth(){},render(value){scene=value;}});assert.ok(scene,'the real view model render exposes a scene');scene.updateMatrixWorld(true);return scene;}
function butterflyFixture(){const view=context.createViewModel(context.THREE);view.reset();advanceState(view,.4,{activeSlot:'knife',meleeStyle:'butterfly'});return view;}
function butterflyParts(view){const scene=renderedScene(view),parts={};for(const name of ['butterfly-weapon','butterfly-blade-carrier','butterfly-free-handle','butterfly-safe-handle','butterfly-grip']){parts[name]=scene.getObjectByName(name);assert.ok(parts[name],name+' exists in the rendered assembly');}return parts;}
function jointAngles(view){const parts=butterflyParts(view);return [parts['butterfly-blade-carrier'].rotation.z,parts['butterfly-free-handle'].rotation.z];}

test('butterfly is an optional knife style while classic remains the default',()=>{
  const classic=fixture(),butterfly=butterflyFixture();
  assert.equal(classic.getState().meleeStyle,'classic');
  assert.equal(butterfly.getState().meleeStyle,'butterfly');
  const classicScene=renderedScene(classic),butterflyScene=renderedScene(butterfly);
  assert.equal(classicScene.getObjectByName('knife-weapon').visible,true);
  assert.equal(classicScene.getObjectByName('butterfly-weapon').visible,false);
  assert.equal(butterflyScene.getObjectByName('knife-weapon').visible,false);
  assert.equal(butterflyScene.getObjectByName('butterfly-weapon').visible,true);
  assert.equal(classic.inspect('knife'),true);assert.equal(classic.getState().inspection.duration,1.95);
  assert.equal(butterfly.inspect('knife'),true);assert.equal(butterfly.getState().inspection.duration,2.8);
  butterfly.update(.02,{activeSlot:'knife'});assert.equal(butterfly.getState().meleeStyle,'butterfly','style survives ordinary frames that omit the preference');
  butterfly.cancelInspect();advanceState(butterfly,.4,{activeSlot:'primary'});
  assert.equal(renderedScene(butterfly).getObjectByName('butterfly-weapon').visible,false,'switching to a gun hides both knife choices');
});

test('butterfly inspection articulates attached parts continuously and returns exactly open',()=>{
  for(const step of [1/30,1/144]){
    const view=butterflyFixture(),parts=butterflyParts(view),rest=poseValues(view),safe=parts['butterfly-safe-handle'];
    assert.equal(parts['butterfly-free-handle'].parent,parts['butterfly-blade-carrier'],'free handle follows the blade hinge');
    const safeRest=[...safe.position.toArray(),...safe.rotation.toArray().slice(0,3)];
    const maxima=[0,0],minima=[0,0];let previous=jointAngles(view);
    assert.deepEqual(previous,[0,0]);assert.equal(view.inspect('knife'),true);
    for(let seconds=0;seconds<3.2;seconds+=step){
      view.update(step,{activeSlot:'knife'});const angles=jointAngles(view);
      for(let i=0;i<2;i++){assert.ok(Number.isFinite(angles[i]));assert.ok(Math.abs(angles[i]-previous[i])<.7,'articulated joints must not snap between frames');maxima[i]=Math.max(maxima[i],angles[i]);minima[i]=Math.min(minima[i],angles[i]);}
      parts['butterfly-weapon'].traverse(node=>{for(const value of node.matrixWorld.elements)assert.ok(Number.isFinite(value),'rendered assembly stays finite');});
      assert.deepEqual([...safe.position.toArray(),...safe.rotation.toArray().slice(0,3)],safeRest,'safe handle stays anchored in the grip');
      previous=angles;
    }
    assert.ok(maxima[0]-minima[0]>=2,'blade visibly folds around its hinge');
    assert.ok(maxima[1]-minima[1]>=2,'free handle visibly swings around its hinge');
    assert.deepEqual(jointAngles(view),[0,0]);assert.deepEqual(poseValues(view),rest);
    assert.equal(view.getState().inspection.active,false);
    advanceState(view,.3,{activeSlot:'knife'});assert.deepEqual(jointAngles(view),[0,0]);assert.deepEqual(poseValues(view),rest);
  }
});

test('butterfly pause freezes hinges and interruptions restore an open combat-ready knife',()=>{
  for(const action of ['cancel','light','heavy','switch','reset']){
    const view=butterflyFixture();assert.equal(view.inspect('knife'),true);
    let folded=false;for(let frame=0;frame<280&&!folded;frame++){view.update(.01,{activeSlot:'knife'});folded=jointAngles(view).some(angle=>Math.abs(angle)>.5);}
    const paused=jointAngles(view),pose=poseValues(view);assert.ok(folded,'interruption starts during a folded pose');
    view.update(0,{activeSlot:'knife'});view.update(0,{activeSlot:'knife'});
    assert.deepEqual(jointAngles(view),paused);assert.deepEqual(poseValues(view),pose);
    if(action==='cancel')view.cancelInspect();
    else if(action==='reset')view.reset();
    else if(action==='switch')view.update(.016,{activeSlot:'primary'});
    else view.shoot('knife',action);
    assert.equal(view.getState().inspection.active,false,action);
    assert.deepEqual(jointAngles(view),[0,0],action+' restores both hinges immediately');
    if(action==='light'||action==='heavy'){
      const expectedHit=action==='light'?.12:.28;
      view.update(.016,{activeSlot:'knife'});assert.equal(view.getState().melee.hitTime,expectedHit);
      advanceState(view,expectedHit-.001,{activeSlot:'knife'});assert.equal(view.getState().melee.phase,'windup');
      advanceState(view,.002,{activeSlot:'knife'});assert.equal(view.getState().melee.phase,'strike');
      assert.deepEqual(jointAngles(view),[0,0],'blade remains open through contact');
    }
  }
});

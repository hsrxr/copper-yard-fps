/* Real player displacement and combat precision across counter-strafe inputs. */
const test=require('node:test'),assert=require('node:assert/strict');
require('../src/player.js');require('../src/combat.js');
const flat={size:640,water:-10,height:()=>0,slope:()=>0};
const rates=[30,60,120,240];
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
function player(yaw=0,colliders=[]){const p=new FPSPlayer(flat,colliders);p.reset(0,0,yaw);return p;}
function advance(p,seconds,input={},hz=120,visit=()=>{}){
  for(let left=seconds;left>1e-9;){const dt=Math.min(left,1/hz);p.update(dt,{tactical:true,...input});visit(p,dt);left-=dt;}
}
function prime(p,input={right:-1},hz=120){advance(p,.3,input,hz);return p;}

test('tactical movement defaults to a fireable run, Shift walk retains low speed while aiming',()=>{
  const p=player();prime(p,{forward:1,sprint:true});near(p.speed,5.8);near(p.moving,1);assert.equal(p.sprinting,false);assert.equal(p.walking,false);
  advance(p,.3,{forward:1,walk:true,sprint:true});near(p.speed,2.6);assert.equal(p.walking,true);assert.equal(p.sprinting,false);
  advance(p,.3,{forward:1,walk:true,ads:true});near(p.speed,2.6);
  advance(p,.3,{forward:1,ads:true});near(p.speed,3);
});

test('releasing A or overlapping A+D coasts for 160ms over .464m without infinite drift at every render rate',()=>{
  for(const hz of rates)for(const yaw of [0,Math.PI/2,2.3]){
    const p=prime(player(yaw),{right:-1},hz),start={...p.position};
    advance(p,.08,{right:0},hz);near(p.precisionSpeed,2.9);
    advance(p,.079,{right:0},hz);assert.ok(p.precisionSpeed>0,'natural release must retain its final millisecond of momentum');
    advance(p,.001,{right:0},hz);assert.equal(p.precisionSpeed,0,`${hz}Hz release must reach exact zero`);
    const stopped={...p.position},distance=Math.hypot(stopped.x-start.x,stopped.z-start.z);near(distance,.464);
    advance(p,.5,{},hz);assert.deepEqual(p.position,stopped,'released keys must not coast indefinitely');assert.equal(p.moving,0);
  }
});

test('run acceleration reaches the faster cap in 100ms at every render rate',()=>{
  for(const hz of rates){
    const p=player();advance(p,.05,{right:1},hz);near(p.precisionSpeed,2.9);near(p.position.x,.0725);
    advance(p,.05,{right:1},hz);near(p.precisionSpeed,5.8);near(p.position.x,.29);
  }
});

test('a 50ms opposite tap brakes without reversing displacement, then release stays stopped',()=>{
  for(const hz of rates)for(const yaw of [0,Math.PI/2,2.3]){
    const p=prime(player(yaw),{right:-1},hz),right={x:Math.cos(yaw),z:-Math.sin(yaw)};let previous=p.position.x*right.x+p.position.z*right.z;
    advance(p,.05,{right:1},hz,q=>{const projection=q.position.x*right.x+q.position.z*right.z;assert.ok(projection<=previous+1e-9,'counter tap must not step backwards');previous=projection;});
    assert.equal(p.precisionSpeed,0);const stopped={...p.position};advance(p,.2,{},hz);assert.deepEqual(p.position,stopped);
  }
});

test('held reverse exposes an immediately accurate deadzone then resumes naturally without a long lock',()=>{
  for(const hz of rates){
    const p=prime(player(),{right:-1},hz),state=FPSRules.createState('standard','tactical');
    FPSRules.tickHandling(state,.2,{ads:true,speed:p.precisionSpeed});
    assert.equal(FPSRules.accuracy(state).stable,false);
    advance(p,.05,{right:1},hz,(q,dt)=>FPSRules.tickHandling(state,dt,{ads:true,speed:q.precisionSpeed,grounded:q.grounded,sprinting:q.sprinting}));
    assert.equal(p.precisionSpeed,0);assert.equal(FPSRules.accuracy(state).stable,true,'zero crossing is usable in the same shot tick');
    near(FPSRules.accuracy(state).spread,state.weapon.adsSpread);assert.equal(FPSRules.tryFire(state),true);
    const stopped=p.position.x;advance(p,.08,{right:1},hz);assert.ok(p.position.x>stopped+.03);assert.ok(p.precisionSpeed>2,'held D must become movement promptly');
    advance(p,.1,{right:1},hz);near(p.precisionSpeed,5.8);
  }
});

test('counter-stop takes 40ms over .116m and preserves the 30ms accurate window across 30–240Hz',()=>{
  const samples=rates.map(hz=>{
    const p=prime(player(),{right:-1},hz),start=p.position.x;
    advance(p,.039,{right:1},hz);assert.ok(p.precisionSpeed>0);
    advance(p,.001,{right:1},hz);near(p.precisionSpeed,0);const stop=p.position.x-start;
    advance(p,.03,{right:1},hz);near(p.precisionSpeed,0);near(p.position.x-start,stop);
    advance(p,.14,{right:1},hz);return {stop,end:p.position.x-start,speed:p.precisionSpeed};
  });
  for(const sample of samples){near(sample.stop,-.116);near(sample.end,samples[0].end);near(sample.speed,5.8);}
});

test('turning the camera preserves world-space braking and diagonal key release remains bounded',()=>{
  const p=prime(player(),{right:-1});p.yaw=Math.PI/2;const before={...p.position};advance(p,.16,{});assert.ok(p.position.x<before.x);near(p.position.z,before.z);assert.equal(p.precisionSpeed,0);
  prime(p,{forward:1,right:1});advance(p,.2,{forward:1});assert.ok(p.speed<=5.8+1e-8);near(p.precisionSpeed,5.8);
});

test('knife speed scaling retains gradual release, quick counter braking and safe collision substeps',()=>{
  for(const hz of rates){
    const multiplier=FPSRules.createState('standard','tactical').loadout.knife.weapon.moveMultiplier;
    const p=prime(player(),{right:-1,speedMultiplier:multiplier},hz);near(p.precisionSpeed,7.54);
    const start=p.position.x;advance(p,.208,{speedMultiplier:multiplier},hz);near(p.precisionSpeed,0);near(start-p.position.x,.78416);
    prime(p,{right:-1,speedMultiplier:multiplier},hz);const reverseStart=p.position.x;
    advance(p,.052,{right:1,speedMultiplier:multiplier},hz);near(p.precisionSpeed,0);near(reverseStart-p.position.x,.19604);
    const wall={shape:'box',kind:'wall',x:0,z:-2,y:0,hx:6,hz:.05,height:8},against=player(0,[wall]);
    advance(against,1,{forward:1,speedMultiplier:multiplier},hz);assert.ok(against.position.z>=-1.6-1e-8);near(against.speed,0);near(against.precisionSpeed,0);
  }
});

test('running into a wall does not leave aim or weapon motion penalized; sliding and air control remain physical',()=>{
  const wall={shape:'box',kind:'wall',x:0,z:-2,y:0,hx:6,hz:.5,height:8};
  const p=player(0,[wall]);advance(p,1,{forward:1});const pinned={...p.position};advance(p,.2,{forward:1});assert.deepEqual(p.position,pinned);assert.equal(p.speed,0);assert.equal(p.precisionSpeed,0);assert.equal(p.moving,0);
  advance(p,.2,{forward:1,right:1});assert.ok(p.position.x>pinned.x);assert.ok(p.position.z>=-1.15-1e-8);assert.ok(p.speed>0);
  const air=prime(player());air.jump();advance(air,.08,{});assert.equal(air.grounded,false);assert.ok(air.precisionSpeed>1,'no instant air brake');
  const s=FPSRules.createState('standard','tactical');FPSRules.tickHandling(s,.1,{speed:0,ads:true,grounded:false});assert.equal(FPSRules.accuracy(s).stable,false);
});

test('reset clears a pending counter-stop',()=>{
  const p=prime(player());advance(p,.05,{right:1});p.reset(0,0);advance(p,.1,{right:1});assert.ok(p.position.x>.2,'new life does not inherit deadzone hold');
});

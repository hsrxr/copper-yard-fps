/* Collision regressions use actual map boxes and the real player integrator. */
const test=require('node:test'),assert=require('node:assert/strict');
require('../src/player.js');require('../src/arena.js');
const rates=[25,30,60,120,240];
const flat={size:640,water:-10,height:()=>0,slope:()=>0};
const box=(extra={})=>({shape:'box',kind:'crate',x:0,z:0,y:0,hx:2,hz:2,height:.9,...extra});
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<=tol,`${a} differs from ${b}`);
function advance(p,seconds,input={},hz=120,visit=()=>{}){
  for(let left=seconds;left>1e-9;){const dt=Math.min(left,1/hz),before={...p.position};p.update(dt,{tactical:true,...input});visit(p,before,dt);left-=dt;}
}

test('jumping onto the real low crate never falls through its top or embeds at its rim',()=>{
  const world=makeArenaWorld({tactical:true}),crate=world.colliders.find(c=>c.height===.9);
  for(const hz of rates){
    const p=new FPSPlayer(world,world.colliders);p.reset(crate.x,crate.z+1.4,0);p.jump();let landed=false;
    advance(p,.58,{forward:1,ads:true},hz,q=>{
      assert.equal(q.blocked(q.position.x,q.position.z,q.position.y),false,`${hz}Hz embedded on low crate`);
      if(q.grounded&&Math.abs(q.position.y-.9)<1e-8)landed=true;
      close(q.yaw,0);close(q.pitch,0);
    });
    assert.equal(landed,true,`${hz}Hz should catch the 0.9m top including capsule-edge overlap`);
  }
});

test('landing supports the highest crossed box top and stays still until walking off',()=>{
  const p=new FPSPlayer(flat,[box(),box({height:.45})]);p.reset(4,0);p.position.x=0;p.position.y=1.1;p.vy=-2;p.grounded=false;
  advance(p,.5,{},120);close(p.position.y,.9);assert.equal(p.grounded,true);assert.equal(p.blocked(0,0,p.position.y),false);
  const rested={...p.position};advance(p,.5,{},120);assert.deepEqual(p.position,rested);
  advance(p,.7,{right:1},120);assert.ok(p.position.x>2.35);assert.ok(p.position.y<.9,'leaving the top begins a fall instead of hanging at its height');
  advance(p,.6,{},120);close(p.position.y,0);assert.equal(p.grounded,true);
});

test('standing beside a box cannot climb its side or snap upward to its top',()=>{
  for(const hz of rates){
    const p=new FPSPlayer(flat,[box()]);p.reset(0,3);const yaw=p.yaw;
    advance(p,1,{forward:1},hz,q=>{close(q.position.y,0);close(q.yaw,yaw);assert.equal(q.blocked(q.position.x,q.position.z,q.position.y),false);});
    assert.ok(p.position.z>=2.35-1e-8);close(p.precisionSpeed,0);
    const before={...p.position};advance(p,.4,{forward:1,right:1},hz);assert.ok(p.position.x>before.x);assert.ok(p.position.z>=2.35-1e-8);close(p.position.y,0);
  }
});

test('upward movement cannot pass through an overhead collider or put the camera inside it',()=>{
  for(const hz of rates){
    const ceiling=box({kind:'wall',y:2.15,height:.4}),p=new FPSPlayer(flat,[ceiling]);p.reset(0,0);p.jump();let top=0;
    advance(p,1,{},hz,q=>{
      top=Math.max(top,q.position.y);
      assert.ok(q.position.y+q.eyeHeight<=ceiling.y-.08+1e-8,`${hz}Hz eye penetrated ceiling`);
      assert.equal(q.blocked(q.position.x,q.position.z,q.position.y),false);
    });
    assert.ok(top>.2,'jump still moves upward before ceiling contact');close(p.position.y,0);assert.equal(p.grounded,true);
  }
});

test('large frame input is bounded and landing cannot skip a thin support',()=>{
  const p=new FPSPlayer(flat,[box({y:.85,height:.05})]);p.reset(4,0);p.position.x=0;p.position.y=1;p.vy=-20;p.grounded=false;
  p.update(2,{tactical:true});close(p.position.y,.9);assert.equal(p.grounded,true);assert.equal(p.blocked(0,0,p.position.y),false);
  p.jump();assert.equal(p.grounded,false);assert.ok(p.vy>0);advance(p,.8,{},120);close(p.position.y,.9);assert.equal(p.grounded,true);
});

test('an exact landing on the top is grounded immediately instead of flickering airborne',()=>{
  const p=new FPSPlayer(flat,[box()]);p.reset(4,0);p.position.x=0;p.position.y=1;p.grounded=false;
  const dt=.01;p.vy=(.9-p.position.y)/dt+19*dt;
  p.update(dt,{tactical:true});close(p.position.y,.9);assert.equal(p.grounded,true);close(p.vy,0);
});

test('box support does not change groundAt or enemy standability',()=>{
  const p=new FPSPlayer(flat,[box()]);close(p.groundAt(0,0),0);assert.equal(p.canStand(0,0),false);
});

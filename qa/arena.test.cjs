/* Shared urban map contract: walkability, connected routes and bounded cache. */
const test=require('node:test'),assert=require('node:assert/strict');
require('../src/arena.js');require('../src/player.js');
test('urban boxes, landmark data and authored clearings are finite and safe',()=>{
  const w=makeArenaWorld(),p=new FPSPlayer(w,w.colliders);
  assert.equal(w.id,'depot');assert.equal(w.size,192);assert.equal(w.water,-10);assert.ok(w.isArena);
  assert.equal(w.buildings.length,4);assert.equal(w.spawnPoints.length,16);
  assert.ok(w.colliders.every(c=>c.shape==='box'&&[c.x,c.y,c.z,c.hx,c.hz,c.height].every(Number.isFinite)&&c.hx>0&&c.hz>0&&c.height>0));
  for(const s of [...w.spawnPoints,...w.extractPoints])assert.ok(p.canStand(s.x,s.z,1.05),JSON.stringify(s));
  for(const b of w.buildings){assert.equal(p.canStand(b.x,b.z),false);assert.equal(w.walkable(b.x,b.z),false);}
  assert.equal(w.height(Infinity,NaN),0);assert.equal(w.inBounds(Infinity,0),false);assert.equal(w.inBounds(93,0),false);
  assert.ok(w.zones.find(z=>z.name.startsWith('A')));assert.ok(w.zones.find(z=>z.name.startsWith('B')));
  assert.equal(w.minimapBlocks.length,w.colliders.filter(c=>c.y<2).length);
});

test('every authored spawn connects to every other spawn without cutting through walls',()=>{
  const w=makeArenaWorld();let paths=0,maxSteps=0;
  for(const start of w.spawnPoints)for(const target of w.spawnPoints){
    let x=start.x,z=start.z,steps=0;
    while(Math.hypot(x-target.x,z-target.z)>.05&&steps<500){
      const next=w.navigate(x,z,target.x,target.z);assert.ok(next,`no route ${JSON.stringify({start,target,x,z})}`);
      assert.ok(w.segmentClear(x,z,next.x,next.z,.68),`wall crossed ${JSON.stringify({x,z,next})}`);
      assert.ok(Math.hypot(next.x-x,next.z-z)>.00001,`stalled ${JSON.stringify({start,target,x,z,next})}`);
      x=next.x;z=next.z;steps++;
    }
    assert.ok(steps<500,`route failed ${JSON.stringify({start,target})}`);paths++;maxSteps=Math.max(maxSteps,steps);
  }
  assert.equal(paths,256);assert.ok(maxSteps>20,'long routes really go around warehouse masses');
  assert.ok(w.navStats().cachedFields<=8);console.log(JSON.stringify({arenaRoutes:paths,maxNavigationSteps:maxSteps,cache:w.navStats()}));
});

test('routing safely projects a target inside a building and rejects nonfinite source positions',()=>{
  const w=makeArenaWorld(),b=w.buildings[0];let x=-75,z=-80;
  for(let i=0;i<100;i++){
    const next=w.navigate(x,z,b.x,b.z);assert.ok(next);assert.ok(w.segmentClear(x,z,next.x,next.z));x=next.x;z=next.z;
  }
  assert.ok(w.walkable(x,z));assert.equal(w.navigate(NaN,0,0,0),null);assert.equal(w.navigate(0,0,Infinity,0),null);
  for(let z=-80;z<=80;z+=8)for(let x=-80;x<=80;x+=8)w.navigate(-75,-80,x,z);
  assert.ok(w.navStats().fieldBuilds>8);assert.equal(w.navStats().cachedFields,8);
});

test('three lane centres and cross streets remain accessible around distinct cover',()=>{
  const w=makeArenaWorld();
  for(const x of [-64,0,64])for(const z of [-78,-14,14,78])assert.ok(w.walkable(x,z),`lane ${x},${z}`);
  assert.equal(w.segmentClear(-75,-44,0,-44),false,'warehouse blocks a lateral shot/path');
  assert.equal(w.segmentClear(-60,-10,0,-10),true,'cross street connects west and middle');
  assert.equal(w.segmentClear(0,10,60,10),true,'cross street connects middle and east');
  assert.equal(w.segmentClear(0,-80,0,80),false,'staggered cargo interrupts end-to-end middle sightline');
  for(const z of [-43,42])for(const x of [-14,14])assert.ok(w.walkable(x,z,.76),'both sides of middle cargo retain a navigable passage');
});

test('warehouse and cargo solids obstruct gun rays while the overhead crane leaves walking clearance',()=>{
  require('../src/combat.js');const w=makeArenaWorld(),p=new FPSPlayer(w,w.colliders);
  const hit=FPSRules.traceWorld({x:-64,y:1.72,z:-44},{x:1,y:0,z:0},100,w,w.colliders);
  assert.ok(hit);assert.equal(hit.kind,'wall');assert.ok(Math.abs(hit.distance-6)<1e-8);assert.equal(hit.collider,w.buildings[0]);
  const cargo=FPSRules.traceWorld({x:-76,y:1.72,z:10},{x:0,y:0,z:-1},30,w,w.colliders);
  assert.ok(cargo);assert.equal(cargo.kind,'crate');assert.ok(Math.abs(cargo.distance-6.8)<1e-8);
  assert.ok(p.canStand(0,79),'overhead crane is above the player capsule');
  const gantry=FPSRules.traceWorld({x:0,y:22,z:70},{x:0,y:0,z:1},30,w,w.colliders);
  assert.ok(gantry);assert.equal(gantry.kind,'wall');assert.equal(gantry.distance,7);
  assert.equal(w.segmentClear(-59,-66,-57,-68,.68),false,'diagonal capsule cannot cut a warehouse corner');
  const middle=FPSRules.traceWorld({x:0,y:1.72,z:-80},{x:0,y:0,z:1},180,w,w.colliders);
  assert.ok(middle);assert.equal(middle.kind,'crate');assert.ok(Math.abs(middle.distance-34.5)<1e-8,'middle long shot meets staggered cargo');
});

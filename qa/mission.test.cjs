const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../src/mission.js');
require('../src/arena.js');
require('../src/career.js');
const at=(m,extra={})=>Object.assign({position:m.objective(),interact:true,health:100},extra);
test('objectives progress through interaction without requiring all kills; settle exactly once',()=>{
 const m=createTacticalMission();let complete=0;
 for(let stage=0;stage<3;stage++){const p=m.objective();for(let i=0;i<80;i++){const r=m.tick(.05,{position:p,interact:true,health:100});if(r.completed)complete++;} }
 assert.equal(m.snapshot().completed,true);assert.equal(complete,1);assert.equal(m.snapshot().stage,3);
});
test('damage, release and leaving radius interrupt the current interaction',()=>{
 const m=createTacticalMission();m.tick(.5,at(m));assert.ok(m.snapshot().progress>0);
 m.tick(.01,at(m,{damaged:true}));assert.equal(m.snapshot().progress,0);
 m.tick(.5,at(m));m.tick(.01,at(m,{interact:false}));assert.equal(m.snapshot().progress,0);
 m.tick(.5,at(m));m.tick(.01,at(m,{position:{x:90,z:90}}));assert.equal(m.snapshot().progress,0);
});
test('one fixed medic needs uninterrupted time, does not heal full health, and does not return on stage advance',()=>{
 const m=createTacticalMission();const input={position:m.medic(),interact:true,health:50};
 m.tick(1,input);m.tick(.01,{...input,damaged:true});assert.equal(m.snapshot().medProgress,0);
 let healed=0;for(let i=0;i<40;i++)healed+=m.tick(.05,input).heal;
 assert.equal(healed,35);assert.equal(m.snapshot().medAvailable,false);
 for(let i=0;i<60;i++)assert.equal(m.tick(.05,input).heal,0);
 const n=createTacticalMission();for(let i=0;i<40;i++)assert.equal(n.tick(.05,{...input,health:100}).heal,0);
 assert.equal(n.snapshot().medAvailable,true);
});
test('retry preserves layout; new mission cycles bounded variants',()=>{
 const m=createTacticalMission();const a=m.layout();m.tick(.4,at(m));m.reset();assert.deepEqual(m.layout(),a);assert.equal(m.snapshot().progress,0);
 m.reset(true);assert.equal(m.snapshot().variant,1);assert.notDeepEqual(m.layout().enemies,a.enemies);
 m.reset(true);m.reset(true);assert.deepEqual(m.layout(),a);
});
test('every authored actor and objective is walkable and route navigates around cover',()=>{
 const w=makeArenaWorld({tactical:true}),m=createTacticalMission();
 for(let v=0;v<3;v++){const layout=m.layout();for(const p of [layout.spawn,layout.medic,...layout.objectives,...layout.enemies])assert.ok(w.walkable(p.x,p.z,.76),JSON.stringify(p));m.reset(true);}
 let p=m.layout().spawn;
 for(const goal of m.layout().objectives){
  let steps=0;
  while(Math.hypot(p.x-goal.x,p.z-goal.z)>.15&&steps++<600){
   const next=w.navigate(p.x,p.z,goal.x,goal.z);assert.ok(next,'route exists');const distance=Math.hypot(next.x-p.x,next.z-p.z);assert.ok(distance>.001,'route does not stall');
   const ratio=Math.min(distance,.5)/distance,q={x:p.x+(next.x-p.x)*ratio,z:p.z+(next.z-p.z)*ratio};assert.ok(w.segmentClear(p.x,p.z,q.x,q.z,.68),'route never clips new cover');p=q;
  }
  assert.ok(steps<600,'each complete objective route is reachable');
 }
});
test('tactical records retain their map and ruleset across storage reload',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const c=createCareer({storage});c.begin({map:'depot',ruleset:'tactical-v2'});c.finish('extracted');c.checkpoint();
 const r=createCareer({storage}).snapshot().records[0];assert.equal(r.ruleset,'tactical-v2');assert.equal(r.map,'depot');assert.equal(r.outcome,'extracted');
});

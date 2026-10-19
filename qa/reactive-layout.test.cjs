/* Real physical sight lines and capsule routes for the three authored encounters. */
const test=require('node:test'),assert=require('node:assert/strict');
require('../src/arena.js');require('../src/mission.js');require('../src/combat.js');

function blocked(world,from,to){
 const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,distance=Math.hypot(dx,dy,dz);
 const hit=FPSRules.traceWorld(from,{x:dx/distance,y:dy/distance,z:dz/distance},distance,world,world.colliders);
 return !!hit&&hit.distance<distance-.6;
}
function follow(world,from,to,label,bounds){
 let p={x:from.x,z:from.z},steps=0;
 while(Math.hypot(p.x-to.x,p.z-to.z)>.12&&steps++<800){
  const next=world.navigate(p.x,p.z,to.x,to.z);
  assert.ok(next,`${label}: route exists at ${JSON.stringify(p)}`);
  const distance=Math.hypot(next.x-p.x,next.z-p.z);
  assert.ok(distance>.001,`${label}: route does not stall at ${JSON.stringify(p)}`);
  const ratio=Math.min(distance,.45)/distance;
  const q={x:p.x+(next.x-p.x)*ratio,z:p.z+(next.z-p.z)*ratio};
  assert.ok(world.segmentClear(p.x,p.z,q.x,q.z,.68),`${label}: swept capsule stays clear`);
  assert.ok(world.walkable(q.x,q.z,.68),`${label}: route never enters cargo or warehouse`);
  if(bounds)assert.ok(Math.hypot(q.x-bounds.anchor.x,q.z-bounds.anchor.z)<=bounds.leash,`${label}: route exceeds ${bounds.leash} m anchor leash at ${JSON.stringify(q)}`);
  p=q;
 }
 assert.ok(steps<800,`${label}: destination is reached`);
 return p;
}

test('every initial head, torso and shoulder is behind physical cover in all three variants',()=>{
 const world=makeArenaWorld({tactical:true}),mission=createTacticalMission();
 for(let variant=0;variant<3;variant++){
  const layout=mission.layout(),from={...layout.spawn,y:1.72};
  for(const [index,enemy] of layout.enemies.entries())for(const y of [.45,1.25,1.85,2.15])for(const dx of [-.6,0,.6])for(const dz of [-.35,.35]){
   assert.ok(blocked(world,from,{x:enemy.x+dx,y,z:enemy.z+dz}),`variant ${variant}, enemy ${index+1}: spawn sees silhouette at ${dx},${y},${dz}`);
  }
  mission.reset(true);
 }
});

test('entrance requires a real corner while all objectives and medic remain continuously reachable',()=>{
 const world=makeArenaWorld({tactical:true}),mission=createTacticalMission();
 const layout=mission.layout();
 assert.equal(world.segmentClear(layout.spawn.x,layout.spawn.z,6,68,.68),false,'the initial straight approach meets an entrance baffle');
 let p=layout.spawn;
 for(const [index,goal] of [...layout.objectives.slice(0,1),layout.medic,...layout.objectives.slice(1)].entries())p=follow(world,p,goal,`mission route ${index}`);
 assert.ok(world.segmentClear(12,78,12,68,.68),'the right side of the entrance remains a usable passage');
});

test('eight mobile defenders have local patrol loops and reachable physical cover in every variant',()=>{
 const world=makeArenaWorld({tactical:true}),mission=createTacticalMission();
 // Local southern approaches to each defended piece of cargo or tower.
 const approaches=[[10,70],[10,57],[10,35],[10,35],[0,-10],[0,12],[0,-27],[0,-33],[0,-50],[0,-50]];
 for(let variant=0;variant<3;variant++){
  const layout=mission.layout();assert.equal(layout.enemies.length,10);
  assert.ok(layout.enemies.filter(e=>['patrol','flank'].includes(e.role)).length>=8,'most defenders must be mobile');
  for(const [index,enemy] of layout.enemies.entries()){
   const label=`variant ${variant}, enemy ${index+1}`,leash=enemy.role==='flank'?26:enemy.role==='patrol'?18:12,bounds={anchor:enemy,leash};
   for(const kind of ['patrol','cover']){
    assert.ok(Array.isArray(enemy[kind])&&enemy[kind].length>=2&&enemy[kind].length<=4,`${label}: 2–4 authored ${kind} destinations`);
    for(const point of enemy[kind]){
     assert.ok(world.walkable(point.x,point.z,.76),`${label}: ${kind} stand is legal`);
     assert.ok(Math.hypot(point.x-enemy.x,point.z-enemy.z)<=leash,`${label}: ${kind} stays local`);
     follow(world,enemy,point,`${label} ${kind}`,bounds);
    }
   }
   let p=enemy;
   for(const point of [...enemy.patrol,enemy.patrol[0]])p=follow(world,p,point,`${label} closed patrol`,bounds);
   // A spotted patrol may switch to any cover destination. Test the whole
   // routed transition, since tower detours can cross the leash even when
   // both endpoints are legal and the navigation mesh is unobstructed.
   const destinations=[...enemy.patrol,...enemy.cover];
   for(const [startIndex,start] of destinations.entries())for(const [endIndex,end] of destinations.entries()){
    if(startIndex!==endIndex)follow(world,start,end,`${label} transition ${startIndex}->${endIndex}`,bounds);
   }
   const [x,z]=approaches[index],from={x,y:1.72,z};
   for(const point of enemy.cover){
    assert.ok(blocked(world,from,{...point,y:1.25}),`${label}: cover blocks incoming torso fire from its southern approach`);
    assert.ok(blocked(world,from,{...point,y:1.85}),`${label}: cover also protects a standing head`);
   }
  }
  mission.reset(true);
 }
});

test('layout arrays are independent snapshots and retries are deterministic',()=>{
 const mission=createTacticalMission(),first=mission.layout();
 assert.ok(Array.isArray(first.enemies[0].patrol),'authored patrol data is present');
 first.enemies[0].patrol[0].x=999;first.enemies[0].cover.length=0;
 assert.notEqual(mission.layout().enemies[0].patrol[0].x,999);
 assert.ok(mission.layout().enemies[0].cover.length>=2);
 for(let variant=0;variant<3;variant++){
  const before=mission.layout();mission.reset();assert.deepEqual(mission.layout(),before);mission.reset(true);
 }
});

/* Pure short-session mission state. Time advances only while the host is playing. */
(function(){
 'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value));
 const objectives=[
  {x:-10,z:31,title:'突破检查点',instruction:'沿货箱逐角推进，到黄色终端按住 E',phase:'entry',required:.8},
  {x:-9,z:-8,title:'读取中街终端',instruction:'先处理交叉火力，再按住 E 读取情报',phase:'terminal',required:2.4},
  {x:0,z:-83,title:'北门撤离',instruction:'抵达绿色撤离圈，按住 E；无需清空全图',phase:'extract',required:2}
 ];
 const arrangements=[
  [[-10,49,'scout','patrol'],[13,33,'scout','patrol'],[-14,18,'rifle','flank'],[1,8,'heavy','hold'],[-15,-12,'scout','patrol'],[16,-13,'rifle','flank'],[12,-33,'scout','flank'],[-12,-55,'scout','patrol'],[-12,-73,'rifle','flank'],[7,-77,'heavy','hold']],
  [[-12,51,'scout','patrol'],[13,35,'scout','patrol'],[-15,16,'rifle','flank'],[0,10,'heavy','hold'],[-15,-14,'scout','patrol'],[16,-16,'rifle','flank'],[12,-35,'scout','flank'],[-13,-54,'scout','patrol'],[-13,-74,'rifle','flank'],[5,-77,'heavy','hold']],
  [[-11,48,'scout','patrol'],[12,31,'scout','patrol'],[-15,13,'rifle','flank'],[0,7,'heavy','hold'],[-13,-15,'scout','patrol'],[16,-18,'rifle','flank'],[13,-36,'scout','flank'],[-13,-57,'scout','patrol'],[-11,-74,'rifle','flank'],[7,-78,'heavy','hold']]
 ];
 // Three preplaced encounters use short, closed patrols around the staggered
 // cargo. Cover lies on the northern side of a real solid from the local
 // southern approach; guards can leave their post briefly to peek and return.
 // Absolute waypoints keep retry behavior stable across all spawn variants.
 const routes=[
  {patrol:[[-14,55],[-4,55],[-10,49]],cover:[[-11,57],[-7,57]]},
  {patrol:[[14,37],[8,35],[13,29]],cover:[[2,37],[8,37]]},
  {patrol:[[-14,27],[-4,28],[-14,18]],cover:[[4,14],[10,14]]},
  {patrol:[[1,14],[6,14],[1,8]],cover:[[6,14],[9,14]]},
  {patrol:[[-15,-29],[-12,-29],[-15,-12]],cover:[[-12,-28],[-8,-28]]},
  // Keep room inside the flank leash for the navigator's tower-corner detour.
  {patrol:[[16,-5],[16,6],[16,-13]],cover:[[8,-6],[11,-6]]},
  {patrol:[[14,-48],[4,-49],[12,-33]],cover:[[-1,-49],[-5,-49]]},
  {patrol:[[-15,-49],[-15,-62],[-12,-55]],cover:[[-7,-49],[-2,-49]]},
  {patrol:[[-3,-77],[0,-69],[-12,-73]],cover:[[4,-69],[10,-69]]},
  {patrol:[[12,-75],[10,-69],[7,-77]],cover:[[6,-68],[10,-68]]}
 ];
 const points=route=>route.map(([x,z])=>({x,z}));
 function createTacticalMission(){
  let variant=0,stage=0,progress=0,medProgress=0,medAvailable=true,time=0,distance=0,completed=false;
  const medic={x:-13,z:8},spawn={x:6,y:0,z:84,yaw:0};
  function reset(next=false){if(next)variant=(variant+1)%arrangements.length;stage=0;progress=medProgress=time=distance=0;medAvailable=true;completed=false;}
  function objective(){return copy(objectives[Math.min(stage,2)]);}
  function layout(){return {variant,spawn:copy(spawn),medic:copy(medic),objectives:copy(objectives),enemies:arrangements[variant].map(([x,z,type,role],index)=>({x,z,type,role,yaw:0,patrol:points(routes[index].patrol),cover:points(routes[index].cover)}))};}
  function tick(dt,input={}){
   const result={advanced:false,completed:false,heal:0};if(completed)return result;
   dt=Math.max(0,Math.min(1,Number.isFinite(dt)?dt:0));time+=dt;
   const p=input.position||{x:Infinity,z:Infinity},goal=objectives[stage];distance=Math.hypot(p.x-goal.x,p.z-goal.z);
   const canUse=!!input.interact&&!input.damaged,atMedic=medAvailable&&input.health<100&&Math.hypot(p.x-medic.x,p.z-medic.z)<2.5;
   if(canUse&&atMedic){medProgress+=dt;if(medProgress>=1.5-1e-8){medAvailable=false;medProgress=0;result.heal=35;}}else medProgress=0;
   if(canUse&&!atMedic&&distance<2.7)progress+=dt;else progress=0;
   if(progress>=goal.required-1e-8){stage++;progress=0;result.advanced=true;if(stage===objectives.length){completed=true;result.completed=true;}}
   return result;
  }
  function snapshot(){const goal=objectives[Math.min(stage,2)];return {stage,phase:completed?'complete':goal.phase,title:completed?'情报已带回':goal.title,instruction:completed?'任务完成':goal.instruction,progress,required:goal.required,distance,medAvailable,medProgress,variant,completed,time};}
  return {reset,tick,snapshot,layout,objective,medic:()=>copy(medic),markers:()=>objectives.map((o,i)=>({...o,label:String(i+1),active:i===stage,completed:i<stage,kind:i===2?'extract':'terminal'}))};
 }
 globalThis.createTacticalMission=createTacticalMission;
})();

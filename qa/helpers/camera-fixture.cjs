/* Exercise actual app input/camera functions without altering production sources.
 * This is not a simulation of physical mouse hardware or a WebGL render test. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
function fixture(){
 const source=fs.readFileSync(path.join(root,'src/app.js'),'utf8').replace(/\r\n/g,'\n');
 function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a,start);return source.slice(a,b);}
 const events={},winEvents={};
 const document={hidden:false,pointerLockElement:null,addEventListener:(type,fn)=>(events[type]??=[]).push(fn),exitPointerLock(){this.pointerLockElement=null;}};
 const canvas={addEventListener(){},focus(){},requestPointerLock(){}};
 document.pointerLockElement=canvas;
 const ctx={console,Math,Number,screen:'playing',locked:true,controlRequest:null,tactical:true,lost:false,failed:false,ready:true,keys:{},ads:false,firing:false,attackQueued:null,footstepDistance:0,
  ui:{isCareerOpen:()=>false,toast(){},setScreen(){}},document,canvas,
  window:{addEventListener:(type,fn)=>(winEvents[type]??=[]).push(fn)},performance:{now:()=>0},
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),mission:{tick(){}},enemies:{interruptAttacks(){}},renderer:{shadowMap:{}},
  audio:{jump(){},reload(){}},startCount:0,reloadCount:0,cancelMelee(){},cancelInspect(){},saveCareerNow(){},updateHUD(){},requestControl(){},resizePending:false,last:0,
  camera:{position:{set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{set(x,y,z){this.x=x;this.y=y;this.z=z;}},fov:56,updateProjectionMatrix(){},updateMatrixWorld(){}}
 };
 ctx.releaseInput=()=>{ctx.firing=ctx.ads=false;for(const k in ctx.keys)ctx.keys[k]=false;};
 ctx.startGame=()=>{ctx.startCount++;ctx.screen='playing';ctx.player.reset(6,84,0);ctx.player.pitch=-.025;ctx.combat=ctx.FPSRules.createState('standard','tactical');};
 ctx.reload=()=>{ctx.reloadCount++;return ctx.FPSRules.startReload(ctx.combat);};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'src/player.js'),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'src/combat.js'),'utf8'),ctx);
 ctx.player=new ctx.FPSPlayer({height:()=>0,slope:()=>0,water:-10},[]);ctx.player.reset(0,0,.7);ctx.player.pitch=.2;ctx.combat=ctx.FPSRules.createState('standard','tactical');
 vm.runInContext(section('  function pauseGame(){','  function takeDamage(')+section('  function equip(slot){','  function applyPlayerHit(')+section('  function updateEye(dt){','  // Mission objectives')+section('  function bind(){','  try{\n    const gl='),ctx);
 ctx.bind();
 return {ctx,events,dispatch(type,e={}){for(const fn of events[type]||[])fn({type,preventDefault(){},repeat:false,...e});}};
}
module.exports={fixture};

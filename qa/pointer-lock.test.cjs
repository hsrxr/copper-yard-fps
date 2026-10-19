const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8').replace(/\r\n/g,'\n');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(request){
 const handlers={},calls=[],toasts=[],looks=[];
 const document={pointerLockElement:null,hidden:false,addEventListener(type,fn){(handlers[type]??=[]).push(fn);},exitPointerLock(){this.pointerLockElement=null;ctx.exits++;}};
 const canvas={focus(){},addEventListener(){},requestPointerLock(options){calls.push(options);return request?.(options,calls.length);}};
 const ctx={document,canvas,controlRequest:null,screen:'playing',locked:false,ads:false,paused:0,exits:0,keys:{},tactical:true,lost:false,failed:false,
  ui:{isCareerOpen:()=>false,toast:message=>toasts.push(message),setScreen(){}},audio:{init(){}},window:{addEventListener(){}},saveCareerNow(){},
  FPSRules:{interrupt(){}},combat:{},enemies:{interruptAttacks(){}},releaseInput(){},updateHUD(){},performance:{now:()=>0},last:0,
  player:{look:(...args)=>looks.push(args)}};
 vm.createContext(ctx);vm.runInContext(section('  function requestControl(){','  function selectSpawn(){')+section('  function pauseGame(){','  function takeDamage(')+section('  function bind(){','  try{\n    const gl='),ctx);
 const pause=ctx.pauseGame;ctx.pauseGame=()=>{if(ctx.screen==='playing')ctx.paused++;pause();};ctx.bind();
 const dispatch=(type,e={})=>{for(const fn of handlers[type]||[])fn(e);};
 const lock=()=>{document.pointerLockElement=canvas;dispatch('pointerlockchange');};
 return {ctx,document,canvas,calls,toasts,looks,dispatch,lock};
}

test('start requests raw mouse input and accepts the browser lock',async()=>{
 const d=deferred(),f=fixture(()=>d.promise);f.ctx.requestControl();
 assert.equal(f.calls[0]?.unadjustedMovement,true);
 f.lock();d.resolve();await tick();assert.equal(f.ctx.locked,true);assert.equal(f.ctx.screen,'playing');
});

test('NotSupportedError falls back once even when pointerlockerror fires before rejection',async()=>{
 const raw=deferred(),normal=deferred(),f=fixture((_,n)=>n===1?raw.promise:normal.promise);
 f.ctx.requestControl();f.dispatch('pointerlockerror');assert.equal(f.ctx.screen,'playing','the Promise owns the error reason');
 raw.reject({name:'NotSupportedError'});await tick();
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].unadjustedMovement,true);assert.equal(f.calls[1],undefined);
 f.lock();normal.resolve();await tick();assert.equal(f.ctx.locked,true);assert.equal(f.toasts.length,0);
});

test('permission denial pauses once without attempting a compatibility retry',async()=>{
 const d=deferred(),f=fixture(()=>d.promise);f.ctx.requestControl();f.dispatch('pointerlockerror');d.reject({name:'NotAllowedError'});await tick();
 assert.equal(f.calls.length,1);assert.equal(f.ctx.screen,'paused');assert.equal(f.ctx.paused,1);assert.equal(f.toasts.length,1);
});

test('an unsupported compatibility request terminates instead of retrying forever',async()=>{
 const f=fixture(()=>Promise.reject({name:'NotSupportedError'}));f.ctx.requestControl();await tick();
 assert.equal(f.calls.length,2);assert.equal(f.ctx.screen,'paused');assert.equal(f.ctx.paused,1);
});

test('old undefined-returning API waits for lock events and can be used again after Escape',()=>{
 const f=fixture();f.ctx.requestControl();assert.equal(f.ctx.screen,'playing');f.lock();assert.equal(f.ctx.locked,true);
 f.document.pointerLockElement=null;f.dispatch('pointerlockchange');assert.equal(f.ctx.screen,'paused');
 f.ctx.screen='playing';f.ctx.requestControl();assert.equal(f.calls.length,2);f.lock();assert.equal(f.ctx.locked,true);
});

test('old undefined-returning API reports an event-only error without an untyped retry',()=>{
 const f=fixture();f.ctx.requestControl();f.dispatch('pointerlockerror');assert.equal(f.ctx.screen,'paused');assert.equal(f.calls.length,1);
});

test('synchronous unsupported error falls back, other exceptions fail once',async()=>{
 const f=fixture((_,n)=>{if(n===1)throw {name:'NotSupportedError'};return Promise.resolve();});f.ctx.requestControl();f.lock();await tick();assert.equal(f.calls.length,2);assert.equal(f.ctx.screen,'playing');
 const g=fixture(()=>{throw new Error('unavailable');});g.ctx.requestControl();assert.equal(g.calls.length,1);assert.equal(g.ctx.screen,'paused');
});

test('a pending request is not duplicated by rapid start or resume',async()=>{
 const d=deferred(),f=fixture(()=>d.promise);f.ctx.requestControl();f.ctx.requestControl();f.ctx.pauseGame();f.ctx.screen='playing';f.ctx.requestControl();
 assert.equal(f.calls.length,1);f.lock();d.resolve();await tick();assert.equal(f.ctx.locked,true);assert.equal(f.ctx.screen,'playing');
});

test('late lock success after pause releases the cursor and never enables looking',async()=>{
 const d=deferred(),f=fixture(()=>d.promise);f.ctx.requestControl();f.ctx.pauseGame();f.lock();d.resolve();await tick();
 assert.equal(f.document.pointerLockElement,null);assert.equal(f.ctx.locked,false);assert.equal(f.ctx.screen,'paused');assert.equal(f.ctx.exits,1);
 f.dispatch('mousemove',{movementX:200,movementY:0});assert.equal(f.looks.length,0);
});

test('raw failure after pause does not reacquire the mouse',async()=>{
 const d=deferred(),f=fixture(()=>d.promise);f.ctx.requestControl();f.ctx.pauseGame();d.reject({name:'NotSupportedError'});await tick();
 assert.equal(f.calls.length,1);assert.equal(f.toasts.length,0);assert.equal(f.ctx.screen,'paused');
});

test('a stale unlock notification does not cancel a fresh pending request',async()=>{
 const d=deferred(),f=fixture(()=>d.promise);f.ctx.requestControl();f.dispatch('pointerlockchange');assert.equal(f.ctx.screen,'playing');
 f.lock();d.resolve();await tick();assert.equal(f.ctx.locked,true);
});

test('an established lock can pause and immediately resume before its old unlock event arrives',async()=>{
 const initial=deferred(),next=deferred(),f=fixture((_,n)=>n===1?initial.promise:next.promise);
 f.ctx.requestControl();f.lock();initial.resolve();await tick();assert.equal(f.ctx.locked,true);
 f.ctx.pauseGame();f.ctx.resumeGame();assert.equal(f.calls.length,2);
 f.dispatch('pointerlockchange');assert.equal(f.ctx.screen,'playing','old unlock must not pause the fresh request');
 f.lock();next.resolve();await tick();assert.equal(f.ctx.screen,'playing');assert.equal(f.ctx.locked,true);
});

test('mouse look requires current canvas ownership; valid flicks are delivered once unchanged',()=>{
 const f=fixture();f.ctx.locked=true;f.dispatch('mousemove',{movementX:350,movementY:-40});assert.equal(f.looks.length,0);
 f.document.pointerLockElement=f.canvas;f.dispatch('mousemove',{movementX:350,movementY:-40});assert.deepEqual(f.looks,[[350,-40,false]]);
 f.ctx.ads=true;f.dispatch('mousemove',{movementX:121,movementY:14});assert.deepEqual(f.looks[1],[121,14,true]);
 f.document.pointerLockElement={};f.dispatch('mousemove',{movementX:20,movementY:5});assert.equal(f.looks.length,2);
});

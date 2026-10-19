const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.join(__dirname,'../src/fullscreen.js');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture({supported=true,enabled=true}={}){
  const listeners={},buttons=[0,1].map(()=>({disabled:false,textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v;},addEventListener(type,fn){this[type]=fn;}}));
  const statuses=[{textContent:''},{textContent:''}],request=deferred(),exit=deferred(),calls={enter:0,exit:0,changed:0,left:0};
  const root={},document={documentElement:root,fullscreenElement:null,fullscreenEnabled:enabled,
    querySelectorAll:selector=>selector==='[data-fullscreen-button]'?buttons:statuses,
    addEventListener:(name,fn)=>listeners[name]=fn,
    exitFullscreen(){calls.exit++;return exit.promise;}
  };
  if(supported)root.requestFullscreen=function(){assert.equal(this,root,'fullscreen includes the whole game and HUD');calls.enter++;return request.promise;};
  const ctx=vm.createContext({document});if(fs.existsSync(source))vm.runInContext(fs.readFileSync(source,'utf8'),ctx);
  assert.equal(typeof ctx.createFullscreenControls,'function','fullscreen controller must be available');
  const control=ctx.createFullscreenControls({onChange:()=>calls.changed++,onExit:()=>calls.left++});
  function change(active){document.fullscreenElement=active?root:null;listeners.fullscreenchange();}
  return {document,root,buttons,statuses,calls,request,exit,control,change};
}

test('fullscreen request starts synchronously from the click and duplicate requests are ignored',async()=>{
  const f=fixture();assert.equal(f.buttons[0].textContent,'进入全屏');
  const pending=f.control.toggle();assert.equal(f.calls.enter,1);
  assert.ok(f.buttons.every(b=>b.disabled));assert.ok(f.buttons.every(b=>b.attributes['aria-pressed']==='false'));
  await f.control.toggle();assert.equal(f.calls.enter,1);
  f.change(true);assert.ok(f.buttons.every(b=>b.textContent==='退出全屏'&&b.attributes['aria-pressed']==='true'));
  f.request.resolve();await pending;assert.ok(f.buttons.every(b=>!b.disabled));assert.equal(f.calls.changed,1);assert.equal(f.calls.left,0);
});

test('external entry and exit synchronize both buttons and notify game pause once',()=>{
  const f=fixture();f.change(true);f.change(false);f.change(false);
  assert.ok(f.buttons.every(b=>b.textContent==='进入全屏'&&b.attributes['aria-pressed']==='false'));
  assert.equal(f.calls.left,1);assert.equal(f.calls.enter,0);assert.equal(f.calls.exit,0);
});

test('exit uses the actual browser state and waits for its event before changing labels',async()=>{
  const f=fixture();f.change(true);const pending=f.control.toggle();assert.equal(f.calls.exit,1);
  assert.ok(f.buttons.every(b=>b.textContent==='退出全屏'));
  f.change(false);f.exit.resolve();await pending;
  assert.ok(f.buttons.every(b=>!b.disabled&&b.textContent==='进入全屏'));assert.equal(f.calls.left,1);
});

test('denied entry recovers controls, reports a retryable error and never pretends to enter',async()=>{
  const f=fixture(),pending=f.control.toggle();f.request.reject(new Error('Permission denied'));await pending;
  assert.ok(f.buttons.every(b=>!b.disabled&&b.attributes['aria-pressed']==='false'));
  assert.ok(f.statuses.every(s=>s.textContent.includes('重试')));assert.equal(f.calls.left,0);
});

test('denied exit preserves active state without pausing the game',async()=>{
  const f=fixture();f.change(true);const pending=f.control.toggle();f.exit.reject(new Error('Denied'));await pending;
  assert.ok(f.buttons.every(b=>!b.disabled&&b.textContent==='退出全屏'&&b.attributes['aria-pressed']==='true'));
  assert.equal(f.calls.left,0);assert.ok(f.statuses[0].textContent.includes('重试'));
});

test('synchronous API failure is handled without leaving disabled controls',async()=>{
  const f=fixture();f.root.requestFullscreen=()=>{throw new Error('Denied');};await f.control.toggle();
  assert.ok(f.buttons.every(b=>!b.disabled));assert.ok(f.statuses[0].textContent.includes('重试'));
});

for(const options of [{supported:false},{enabled:false}])test('unsupported or policy-disabled fullscreen is explained without invoking APIs '+JSON.stringify(options),async()=>{
  const f=fixture(options);assert.ok(f.buttons.every(b=>b.disabled));
  assert.ok(f.statuses.every(s=>s.textContent.includes('不支持')||s.textContent.includes('不可用')));
  await f.control.toggle();assert.equal(f.calls.enter,0);assert.equal(f.calls.exit,0);
});

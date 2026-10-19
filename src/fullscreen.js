/* User-initiated document fullscreen keeps the canvas and all HUD layers together. */
(function(global){
  'use strict';
  global.createFullscreenControls=function({onChange=()=>{},onExit=()=>{}}={}){
    const root=document.documentElement;
    const buttons=Array.from(document.querySelectorAll('[data-fullscreen-button]'));
    const statuses=Array.from(document.querySelectorAll('[data-fullscreen-status]'));
    let pending=false,previous=!!document.fullscreenElement,message='';
    const active=()=>!!document.fullscreenElement;
    const available=()=>typeof document.exitFullscreen==='function'&&(active()||
      (typeof root.requestFullscreen==='function'&&document.fullscreenEnabled!==false));
    function sync(){
      const full=active(),supported=available();
      for(const button of buttons){
        button.textContent=supported?(full?'退出全屏':'进入全屏'):'全屏不可用';
        button.disabled=pending||!supported;
        button.setAttribute('aria-pressed',String(full));
        button.setAttribute('aria-busy',String(pending));
      }
      const hint=!supported?'当前浏览器全屏不可用，可使用桌面版 Chrome 或 Edge。':
        message||(full?'战斗中按 Esc 暂停，再用按钮退出全屏。':'全屏可减少浏览器边框干扰。');
      for(const status of statuses)status.textContent=hint;
    }
    async function toggle(){
      if(pending||!available())return;
      pending=true;message='';sync();
      try{
        // Invoke within the button's activation, before any asynchronous work.
        if(active())await document.exitFullscreen();
        else await root.requestFullscreen({navigationUI:'hide'});
      }catch{
        message='浏览器未允许切换全屏，请再次点击重试。';
      }finally{pending=false;sync();}
    }
    document.addEventListener('fullscreenchange',()=>{
      const full=active(),left=previous&&!full;previous=full;message='';sync();
      onChange(full);if(left)onExit();
    });
    for(const button of buttons)button.addEventListener('click',toggle);
    sync();
    return {toggle};
  };
})(globalThis);

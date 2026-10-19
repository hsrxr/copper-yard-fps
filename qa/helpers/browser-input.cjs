// Windows headless Chrome can deliver the desktop's raw mouse movement to a
// locked test page. Opt into ordinary pointer lock for deterministic scripted
// combat checks. App raw-input negotiation has separate pointer-lock tests.
async function isolateDesktopMouse(page,report){
  if(process.env.COPPER_ISOLATE_RAW_INPUT!=='1')return;
  report.limitations.push('Automated pointer lock requests ordinary input to isolate Windows desktop raw mouse motion; production raw-input settings are unchanged.');
  await page.addInitScript(()=>{
    const request=Element.prototype.requestPointerLock;
    Element.prototype.requestPointerLock=function(options){return request.call(this,{...options,unadjustedMovement:false});};
  });
}
module.exports={isolateDesktopMouse};

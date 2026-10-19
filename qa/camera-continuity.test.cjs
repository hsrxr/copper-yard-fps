const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/camera-fixture.cjs');

test('switching out of ADS preserves FOV until the regular camera update, then zooms out continuously',()=>{
 for(const slot of ['secondary','knife']){
  const {ctx}=fixture();ctx.FPSRules.tickHandling(ctx.combat,.2,{ads:true,speed:0,grounded:true});ctx.ads=true;ctx.updateEye(0);
  assert.equal(ctx.camera.fov,56);const before={...ctx.player.position,yaw:ctx.player.yaw,pitch:ctx.player.pitch};
  assert.equal(ctx.equip(slot),true);assert.equal(ctx.camera.fov,56,'a keydown must not snap the entire scene from 56 to 72 degrees');
  assert.equal(ctx.lastViewSlot,slot,'cosmetic draw is dispatched to the selected view model without changing the camera');
  assert.deepEqual({...ctx.player.position,yaw:ctx.player.yaw,pitch:ctx.player.pitch},before);
  ctx.updateEye(1/120);assert.ok(ctx.camera.fov>56&&ctx.camera.fov<59,'first rendered step advances only a small part of the zoom');
  for(let i=0;i<120;i++)ctx.updateEye(1/120);assert.ok(Math.abs(ctx.camera.fov-72)<.00001);
 }
});

test('explicit spawn camera synchronization can still initialize orientation and FOV immediately',()=>{
 const {ctx}=fixture();ctx.player.reset(6,84,.42);ctx.player.pitch=-.025;ctx.updateEye(0);
 assert.equal(ctx.camera.fov,72);assert.equal(ctx.camera.rotation.y,.42);assert.equal(ctx.camera.rotation.x,-.025);assert.equal(ctx.camera.position.x,6);assert.equal(ctx.camera.position.z,84);
});

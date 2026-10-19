/* Grounded player capsule approximation; metres/seconds, independent of rendering. */
(function(){
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),finite=(x,d)=>Number.isFinite(x)?x:d;
  const TACTICAL_RUN_SPEED=5.8,TACTICAL_WALK_SPEED=2.6,TACTICAL_ADS_SPEED=3;
  const GROUND_ACCELERATION=58,RELEASE_DECELERATION=36.25,COUNTER_DECELERATION=145,COUNTER_STOP_WINDOW=.03;
  class FPSPlayer{
    constructor(world,colliders){
      this.world=world;this.colliders=colliders;this.radius=.35;this.eyeHeight=1.72;this.bodyHeight=this.eyeHeight+.10;this.sensitivity=1;
      this.position={x:0,y:0,z:0};this.velocity={x:0,z:0};this.yaw=0;this.pitch=0;this.vy=0;this.grounded=true;this.recoil=0;this.moving=0;this.speed=0;this.precisionSpeed=0;this.sprinting=false;this.walking=false;this.counterStopLeft=0;
      this.cells=new Map();this.cellSize=16;this.visited=new Uint32Array(colliders.length);this.queryStamp=0;
      // Long warehouse walls occupy every intersected cell. A center-only index
      // can miss a 40 m wall even though its near face touches the player.
      for(let i=0;i<colliders.length;i++){
        const c=colliders[i],rx=c.shape==='box'?c.hx:c.r,rz=c.shape==='box'?c.hz:c.r;
        for(let z=Math.floor((c.z-rz)/16);z<=Math.floor((c.z+rz)/16);z++)for(let x=Math.floor((c.x-rx)/16);x<=Math.floor((c.x+rx)/16);x++){
          const key=x+65536*z;let bucket=this.cells.get(key);if(!bucket)this.cells.set(key,bucket=[]);bucket.push(i);
        }
      }
    }
    groundAt(x,z){const w=this.world,r=.24;return Math.max(w.height(x,z),w.height(x+r,z),w.height(x-r,z),w.height(x,z+r),w.height(x,z-r));}
    overlaps(c,x,z,r=this.radius){
      if(c.shape==='box'){
        const dx=Math.max(0,Math.abs(x-c.x)-c.hx),dz=Math.max(0,Math.abs(z-c.z)-c.hz);
        return dx*dx+dz*dz<r*r;
      }
      const dx=x-c.x,dz=z-c.z,rad=c.r+r;return dx*dx+dz*dz<rad*rad;
    }
    blocked(x,z,feet,r=this.radius){
      if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(feet))return true;
      const cx=Math.floor(x/16),cz=Math.floor(z/16),reach=Math.max(1,Math.ceil(r/16));
      this.queryStamp=(this.queryStamp+1)>>>0;if(!this.queryStamp){this.visited.fill(0);this.queryStamp=1;}
      for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++){
        const a=this.cells.get(cx+dx+65536*(cz+dz));if(!a)continue;
        for(let i=0;i<a.length;i++){
          const id=a[i];if(this.visited[id]===this.queryStamp)continue;this.visited[id]=this.queryStamp;
          const c=this.colliders[id];if(feet>=c.y+c.height||feet+this.bodyHeight<=c.y)continue;
          if(this.overlaps(c,x,z,r))return true;
        }
      }return false;
    }
    // Horizontal tests alone allow feet above a crate to cross over it. Sweep
    // the feet/head through the next vertical segment so descent lands on its
    // top instead of embedding in the side. Terrain/AI groundAt stays unchanged.
    verticalLimit(x,z,from,to){
      const down=to<=from,r=this.radius,cx=Math.floor(x/16),cz=Math.floor(z/16),reach=Math.max(1,Math.ceil(r/16));
      let result=to,hit=false;
      this.queryStamp=(this.queryStamp+1)>>>0;if(!this.queryStamp){this.visited.fill(0);this.queryStamp=1;}
      for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++){
        const a=this.cells.get(cx+dx+65536*(cz+dz));if(!a)continue;
        for(let i=0;i<a.length;i++){
          const id=a[i];if(this.visited[id]===this.queryStamp)continue;this.visited[id]=this.queryStamp;
          const c=this.colliders[id],surface=down?c.y+c.height:c.y-this.bodyHeight;
          if(down?(from<surface-1e-8||result>surface):(from>surface+1e-8||result<surface))continue;
          if(this.overlaps(c,x,z,r)){result=surface;hit=true;}
        }
      }
      return hit?result:null;
    }
    inBounds(x,z,r=this.radius){return Number.isFinite(x)&&Number.isFinite(z)&&(this.world.inBounds?this.world.inBounds(x,z,r):Math.abs(x)<300&&Math.abs(z)<300);}
    canStand(x,z,r=.5){return this.inBounds(x,z,r)&&this.world.height(x,z)>this.world.water+.15&&this.world.slope(x,z)<1.25&&!this.blocked(x,z,this.groundAt(x,z),r);}
    reset(x,z,yaw=0){
      const p=this.position,bound=this.world.isArena?this.world.size*.5-5:300;p.x=clamp(finite(x,0),-bound,bound);p.z=clamp(finite(z,0),-bound,bound);this.yaw=finite(yaw,0);this.pitch=0;
      for(let k=0;k<6;k++)for(let i=0;i<this.colliders.length;i++){
        if(this.colliders[i].shape==='box'){
          const c=this.colliders[i],feet=this.groundAt(p.x,p.z);if(feet>=c.y+c.height||feet+this.bodyHeight<=c.y)continue;
          const qx=clamp(p.x,c.x-c.hx,c.x+c.hx),qz=clamp(p.z,c.z-c.hz,c.z+c.hz),dx=p.x-qx,dz=p.z-qz,d=Math.hypot(dx,dz),r=this.radius+.035;
          if(d>=r)continue;
          if(d>.0001){p.x=qx+dx/d*r;p.z=qz+dz/d*r;}
          else{
            const lx=p.x-(c.x-c.hx),rx=c.x+c.hx-p.x,lz=p.z-(c.z-c.hz),rz=c.z+c.hz-p.z,m=Math.min(lx,rx,lz,rz);
            if(m===lx)p.x=c.x-c.hx-r;else if(m===rx)p.x=c.x+c.hx+r;else if(m===lz)p.z=c.z-c.hz-r;else p.z=c.z+c.hz+r;
          }
          p.x=clamp(p.x,-bound,bound);p.z=clamp(p.z,-bound,bound);continue;
        }
        const c=this.colliders[i],dx=p.x-c.x,dz=p.z-c.z,r=c.r+this.radius+.025,d=Math.hypot(dx,dz);
        if(d<r){p.x=clamp(c.x+(d>.0001?dx/d:1)*(r+.01),-300,300);p.z=clamp(c.z+(d>.0001?dz/d:0)*(r+.01),-300,300);}
      }
      if(this.world.spawnPoints&&!this.canStand(p.x,p.z)){
        const safe=this.world.spawnPoints.find(s=>this.canStand(s.x,s.z));if(safe){p.x=safe.x;p.z=safe.z;}
      }
      p.y=this.groundAt(p.x,p.z);this.velocity.x=this.velocity.z=0;this.vy=0;this.grounded=true;this.recoil=0;this.moving=0;this.speed=0;this.precisionSpeed=0;this.sprinting=false;this.walking=false;this.counterStopLeft=0;
    }
    setSensitivity(value){this.sensitivity=clamp(finite(value,1),.25,3);return this.sensitivity;}
    look(dx,dy,ads){const s=(ads?.00125:.00215)*this.sensitivity;this.yaw-=clamp(finite(dx,0),-400,400)*s;this.pitch=clamp(this.pitch-clamp(finite(dy,0),-400,400)*s,-1.42,1.42);}
    jump(){if(this.grounded){this.vy=6.8;this.grounded=false;return true;}return false;}
    // Integrate grounded acceleration in seconds, including the exact stop.
    // Release takes 160 ms at base run speed. Counter-strafe brakes four
    // times as hard, then leaves a 30 ms zero-speed window before held input turns
    // into reverse travel. A brief tap cannot overshoot zero in one frame.
    groundMotion(dt,tx,tz){
      const v=this.velocity,targetSpeed=Math.hypot(tx,tz);let left=dt,dx=0,dz=0;
      if(targetSpeed<1e-8){
        this.counterStopLeft=0;const speed=Math.hypot(v.x,v.z);
        if(speed>1e-8){
          const time=Math.min(left,speed/RELEASE_DECELERATION),distance=speed*time-.5*RELEASE_DECELERATION*time*time,remaining=Math.max(0,speed-RELEASE_DECELERATION*time);
          dx=v.x/speed*distance;dz=v.z/speed*distance;v.x=v.x/speed*remaining;v.z=v.z/speed*remaining;
          if(remaining<1e-8)v.x=v.z=0;
        }else v.x=v.z=0;
        return {x:dx,z:dz};
      }
      if(this.counterStopLeft>0){const hold=Math.min(left,this.counterStopLeft);left-=hold;this.counterStopLeft-=hold;}
      const speed=Math.hypot(v.x,v.z);
      if(left>1e-9&&speed>1e-8&&v.x*tx+v.z*tz< -1e-8){
        const time=Math.min(left,speed/COUNTER_DECELERATION),distance=speed*time-.5*COUNTER_DECELERATION*time*time,remaining=Math.max(0,speed-COUNTER_DECELERATION*time);
        dx+=v.x/speed*distance;dz+=v.z/speed*distance;v.x=v.x/speed*remaining;v.z=v.z/speed*remaining;left-=time;
        if(remaining<1e-8){
          v.x=v.z=0;this.counterStopLeft=COUNTER_STOP_WINDOW;
          const hold=Math.min(left,this.counterStopLeft);left-=hold;this.counterStopLeft-=hold;
        }
      }
      if(left>1e-9){
        const ax=tx-v.x,az=tz-v.z,difference=Math.hypot(ax,az),time=Math.min(left,difference/GROUND_ACCELERATION);
        if(difference>1e-8){
          const gain=GROUND_ACCELERATION*time/difference;
          dx+=v.x*time+.5*ax*gain*time;dz+=v.z*time+.5*az*gain*time;
          v.x+=ax*gain;v.z+=az*gain;left-=time;
        }else{v.x=tx;v.z=tz;}
        dx+=v.x*left;dz+=v.z*left;
      }
      return {x:dx,z:dz};
    }
    update(dt,input={}){
      dt=clamp(finite(dt,0),0,.05);if(!dt)return;const p=this.position,v=this.velocity,startX=p.x,startZ=p.z;
      let f=finite(input.forward,0),r=finite(input.right,0),norm=Math.max(1,Math.hypot(f,r));f/=norm;r/=norm;
      const tactical=input.tactical===true;
      this.walking=tactical&&!!input.walk;
      this.sprinting=!tactical&&!!input.sprint&&!input.ads&&(Math.abs(f)+Math.abs(r)>0);
      // A held knife supplies 1.3. Finite limits prevent malformed modifiers
      // from reversing movement or defeating collision substeps at huge speeds.
      const speedMultiplier=clamp(finite(input.speedMultiplier,1),.25,2);
      const travel=tactical?(this.walking?TACTICAL_WALK_SPEED:TACTICAL_RUN_SPEED):(this.sprinting?8:4.8);
      const speed=(input.ads?Math.min(travel,tactical?TACTICAL_ADS_SPEED:2.7):travel)*speedMultiplier;
      const tx=(-Math.sin(this.yaw)*f+Math.cos(this.yaw)*r)*speed,tz=(-Math.cos(this.yaw)*f-Math.sin(this.yaw)*r)*speed;
      let dx,dz;
      if(tactical&&this.grounded){const motion=this.groundMotion(dt,tx,tz);dx=motion.x;dz=motion.z;}
      else{
        this.counterStopLeft=0;
        const blend=1-Math.exp(-dt*(this.grounded?16:6));v.x+=(tx-v.x)*blend;v.z+=(tz-v.z)*blend;dx=v.x*dt;dz=v.z*dt;
      }
      const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.18));
      const wasGrounded=this.grounded;
      for(let i=0;i<steps;i++){
        const nx=clamp(p.x+dx/steps,-300,300),nz=clamp(p.z+dz/steps,-300,300);
        const test=(x,z)=>{const h=this.groundAt(x,z);return this.inBounds(x,z)&&this.world.height(x,z)>this.world.water-.1&&h<=p.y+.52&&!this.blocked(x,z,Math.max(p.y,h));};
        if(test(nx,nz)){p.x=nx;p.z=nz;}else if(test(nx,p.z)){p.x=nx;v.z=0;}else if(test(p.x,nz)){p.z=nz;v.x=0;}else{v.x=v.z=0;}
        const g=this.groundAt(p.x,p.z);if(wasGrounded&&this.vy<=0&&g>p.y-.36)p.y=Math.max(p.y,g);
      }
      const floor=this.groundAt(p.x,p.z);this.vy-=19*dt;
      const nextY=p.y+this.vy*dt,limitedY=this.verticalLimit(p.x,p.z,p.y,nextY);
      this.grounded=false;
      if(limitedY!==null){this.grounded=this.vy<=0;this.vy=0;}
      p.y=limitedY===null?nextY:limitedY;
      if(p.y<=floor){p.y=floor;this.vy=0;this.grounded=true;}
      // Actual displacement includes collision/sliding; intent and residual
      // velocity alone must not penalize aim while stationary against cover.
      this.speed=Math.hypot(p.x-startX,p.z-startZ)/dt;
      // Shots happen after simulation: use end-of-step velocity so a frame
      // containing the final braking distance can already fire accurately.
      this.precisionSpeed=Math.hypot(v.x,v.z);
      this.recoil*=Math.exp(-dt*8);this.moving=this.speed>.01?this.speed/(tactical?TACTICAL_RUN_SPEED:4.8):0;
    }
  }
  globalThis.FPSPlayer=FPSPlayer;
})();

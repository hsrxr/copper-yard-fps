/* Fixed pools for tracers, impact chips, ammunition and single-use health packs. */
function createCombatEffects(ctx){
  const {THREE,scene,world}=ctx,group=new THREE.Group();scene.add(group);
  const dummy=new THREE.Object3D(),direction=new THREE.Vector3(),center=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),color=new THREE.Color();
  const TC=64,IC=160,PC=40;
  const trails=new THREE.InstancedMesh(new THREE.CylinderGeometry(.014,.014,1,4),new THREE.MeshBasicMaterial({color:0xffffff}),TC);
  const impacts=new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.06),new THREE.MeshBasicMaterial({color:0xffffff}),IC);
  const crates=new THREE.InstancedMesh(new THREE.BoxGeometry(.65,.32,.44),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.7,metalness:.35}),PC);
  const strips=new THREE.InstancedMesh(new THREE.BoxGeometry(.32,.035,.46),new THREE.MeshBasicMaterial({color:0xdde9a2}),PC);
  const halos=new THREE.InstancedMesh(new THREE.TorusGeometry(.6,.025,4,24),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.65}),PC);
  // Two green bars on top and two on the front form clearly readable medical crosses.
  const medicalMarks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0x35db88}),PC*4);
  crates.name='Pickup crates';medicalMarks.name='Medical crosses';halos.name='Pickup halos';
  const meshes=[trails,impacts,crates,strips,halos,medicalMarks];
  meshes.forEach(m=>{m.frustumCulled=false;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(m);});
  const tl=new Float32Array(TC),ta=new Float32Array(TC*3),tb=new Float32Array(TC*3);
  const il=new Float32Array(IC),ip=new Float32Array(IC*3),iv=new Float32Array(IC*3);
  const drops=Array.from({length:PC},()=>({active:false,kind:'ammo',x:0,y:0,z:0,amount:0,age:0}));
  let ti=0,ii=0,di=0,totalPickups=0,totalHealth=0;
  const zero=new THREE.Matrix4().makeScale(0,0,0);
  function tracer(a,b,enemy=false){const i=ti++%TC,k=i*3;ta[k]=a.x;ta[k+1]=a.y;ta[k+2]=a.z;tb[k]=b.x;tb[k+1]=b.y;tb[k+2]=b.z;tl[i]=enemy?.095:.065;color.set(enemy?0xffa653:0xf6dfa4).multiplyScalar(2.2);trails.setColorAt(i,color);}
  function impact(p,hit=false,kind='hit'){
    const armor=kind==='armor'||kind==='armorBreak',head=kind==='headshot'||kind==='headshotKill',broken=kind==='armorBreak';
    const count=broken?10:armor?7:head?6:hit?5:4,tint=armor?0xa8dce7:head?0xffe3a7:hit?0xd4b497:0xadb79d;
    for(let j=0;j<count;j++){const i=ii++%IC,k=i*3,speed=armor?4:2.2;ip[k]=p.x;ip[k+1]=p.y;ip[k+2]=p.z;iv[k]=(Math.random()-.5)*speed;iv[k+1]=.7+Math.random()*(armor?2.4:1.5);iv[k+2]=(Math.random()-.5)*speed;il[i]=(armor?.18:.13)+Math.random()*.12;color.set(tint).multiplyScalar(armor?2:head?1.7:1);impacts.setColorAt(i,color);}
  }
  function spawnDrop(position,amount,kind){
    if(!Number.isFinite(amount)||amount<=0)return false;
    let index=drops.findIndex(d=>!d.active);if(index<0)index=di++%PC;
    const slot=drops[index];slot.active=true;slot.kind=kind;slot.x=position.x;slot.z=position.z;
    // A health pack floats above an ammo crate dropped at the same death position.
    slot.y=world.height(slot.x,slot.z)+(kind==='health'?.88:.45);slot.amount=amount;slot.age=0;
    crates.setColorAt(index,color.set(kind==='health'?0xe9f5ee:0x667649));
    halos.setColorAt(index,color.set(kind==='health'?0x42ef9a:0xb1cf7c));
    return true;
  }
  function drop(position,amount){return spawnDrop(position,amount,'ammo');}
  function dropHealth(position,amount=30){return spawnDrop(position,amount,'health');}
  function update(dt,time,player,addAmmo,onPickup,addHealth,onHeal){
    for(let i=0;i<TC;i++){tl[i]-=dt;if(tl[i]<=0){trails.setMatrixAt(i,zero);continue;}const k=i*3;center.set((ta[k]+tb[k])/2,(ta[k+1]+tb[k+1])/2,(ta[k+2]+tb[k+2])/2);direction.set(tb[k]-ta[k],tb[k+1]-ta[k+1],tb[k+2]-ta[k+2]);const len=direction.length();dummy.position.copy(center);dummy.quaternion.setFromUnitVectors(up,direction.normalize());dummy.scale.set(1,len,1);dummy.updateMatrix();trails.setMatrixAt(i,dummy.matrix);}
    for(let i=0;i<IC;i++){il[i]-=dt;if(il[i]<=0){impacts.setMatrixAt(i,zero);continue;}const k=i*3;iv[k+1]-=8*dt;ip[k]+=iv[k]*dt;ip[k+1]+=iv[k+1]*dt;ip[k+2]+=iv[k+2]*dt;dummy.position.set(ip[k],ip[k+1],ip[k+2]);dummy.rotation.set(time*7+i,i,time*4);dummy.scale.setScalar(Math.min(1,il[i]*8));dummy.updateMatrix();impacts.setMatrixAt(i,dummy.matrix);}
    for(let i=0;i<PC;i++){
      const d=drops[i];if(d.active){d.age+=dt;if(d.age>150)d.active=false;
        if(d.active&&player&&Math.hypot(d.x-player.x,d.z-player.z)<2.45&&Math.abs(d.y-player.y)<3){
          if(d.kind==='health'){
            const n=typeof addHealth==='function'?addHealth(d.amount):0;
            // Full health leaves the pack. Any positive recovery consumes it once.
            if(Number.isFinite(n)&&n>0){d.active=false;totalHealth+=n;if(onHeal)onHeal(n);}
          }else{
            const n=typeof addAmmo==='function'?addAmmo(d.amount):0;
            if(n>0){d.amount-=n;totalPickups+=n;if(onPickup)onPickup(n);if(d.amount<=0)d.active=false;}
          }
        }
      }
      if(!d.active){crates.setMatrixAt(i,zero);strips.setMatrixAt(i,zero);halos.setMatrixAt(i,zero);for(let j=0;j<4;j++)medicalMarks.setMatrixAt(i*4+j,zero);continue;}
      const health=d.kind==='health',y=d.y+Math.sin(time*2.2+i)*.08,angle=time*.3+i;
      dummy.position.set(d.x,y,d.z);dummy.rotation.set(0,angle,0);dummy.scale.set(1,health?1.05:1,1);dummy.updateMatrix();crates.setMatrixAt(i,dummy.matrix);
      if(health){
        strips.setMatrixAt(i,zero);
        dummy.position.y=y+.18;dummy.scale.set(.34,.028,.09);dummy.updateMatrix();medicalMarks.setMatrixAt(i*4,dummy.matrix);
        dummy.scale.set(.09,.028,.3);dummy.updateMatrix();medicalMarks.setMatrixAt(i*4+1,dummy.matrix);
        dummy.position.set(d.x+Math.sin(angle)*.228,y,d.z+Math.cos(angle)*.228);
        dummy.scale.set(.31,.075,.027);dummy.updateMatrix();medicalMarks.setMatrixAt(i*4+2,dummy.matrix);
        dummy.scale.set(.085,.25,.027);dummy.updateMatrix();medicalMarks.setMatrixAt(i*4+3,dummy.matrix);
      }else{
        dummy.position.y=y+.17;dummy.scale.setScalar(1);dummy.updateMatrix();strips.setMatrixAt(i,dummy.matrix);
        for(let j=0;j<4;j++)medicalMarks.setMatrixAt(i*4+j,zero);
      }
      dummy.position.set(d.x,d.y-(health?.78:.35),d.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(health?1.12:1);dummy.updateMatrix();halos.setMatrixAt(i,dummy.matrix);
    }
    meshes.forEach(m=>{m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;});
  }
  function reset(){tl.fill(0);il.fill(0);drops.forEach(d=>{d.active=false;d.kind='ammo';d.x=d.y=d.z=d.amount=d.age=0;});ti=ii=di=totalPickups=totalHealth=0;update(0,0,null,()=>0);}
  reset();return{group,tracer,impact,drop,dropHealth,update,reset,stats:()=>({drops:drops.filter(d=>d.active).length,healthDrops:drops.filter(d=>d.active&&d.kind==='health').length,pickedAmmo:totalPickups,pickedHealth:totalHealth,tracerCapacity:TC,impactCapacity:IC}),getDrops:()=>drops.filter(d=>d.active).map(d=>({kind:d.kind,x:d.x,y:d.y,z:d.z,amount:d.amount}))};
}

/* Procedural Web Audio: shared noise buffer, voices disconnected after playback. */
function createGameAudio(){
  let ac=null,master=null,noise=null,muted=false,voices=0;
  const ear={x:0,y:0,z:0,fx:0,fz:-1};
  const coordinate=(p,key,index)=>p&&Number.isFinite(p[key])?p[key]:p&&Number.isFinite(p[index])?p[index]:0;
  function listener(position,forward){ear.x=coordinate(position,'x',0);ear.y=coordinate(position,'y',1);ear.z=coordinate(position,'z',2);if(forward){const x=coordinate(forward,'x',0),z=coordinate(forward,'z',2),length=Math.hypot(x,z)||1;ear.fx=x/length;ear.fz=z/length;}}
  function init(){if(!ac){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;ac=new C();master=ac.createGain();master.gain.value=muted?0:.2;master.connect(ac.destination);noise=ac.createBuffer(1,Math.ceil(ac.sampleRate*.5),ac.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}if(ac.state==='suspended')ac.resume().catch(()=>{});}
  function output(position){
    if(!position)return{node:master,dispose(){}};
    const dx=coordinate(position,'x',0)-ear.x,dz=coordinate(position,'z',2)-ear.z,dy=coordinate(position,'y',1)-ear.y,distance=Math.hypot(dx,dy,dz),flat=Math.hypot(dx,dz)||1;
    const gain=ac.createGain();gain.gain.value=1/(1+distance/32);
    if(typeof ac.createStereoPanner==='function'){const pan=ac.createStereoPanner();pan.pan.value=Math.max(-.95,Math.min(.95,(-ear.fz*dx+ear.fx*dz)/flat));gain.connect(pan);pan.connect(master);return{node:gain,dispose(){gain.disconnect();pan.disconnect();}};}
    gain.connect(master);return{node:gain,dispose(){gain.disconnect();}};
  }
  function tone(freq,duration,vol,type='sine',end=0,position=null,delay=0){
    if(!ac||muted||voices>=72)return;voices++;const t=ac.currentTime+delay,o=ac.createOscillator(),g=ac.createGain(),route=output(position);o.type=type;o.frequency.setValueAtTime(freq,t);if(end)o.frequency.exponentialRampToValueAtTime(end,t+duration);g.gain.setValueAtTime(Math.max(.001,vol),t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(route.node);o.onended=()=>{o.disconnect();g.disconnect();route.dispose();voices=Math.max(0,voices-1);};o.start(t);o.stop(t+duration+.005);
  }
  function noiseVoice(duration,vol,frequency,type='lowpass',position=null,delay=0){
    if(!ac||muted||voices>=72)return;voices++;const t=ac.currentTime+delay,s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain(),route=output(position);s.buffer=noise;f.type=type;f.frequency.value=frequency;f.Q.value=.75;g.gain.setValueAtTime(Math.max(.001,vol),t);g.gain.exponentialRampToValueAtTime(.001,t+duration);s.connect(f);f.connect(g);g.connect(route.node);s.onended=()=>{s.disconnect();f.disconnect();g.disconnect();route.dispose();voices=Math.max(0,voices-1);};s.start(t);s.stop(t+duration+.005);
  }
  function shot(enemy=false,slot='primary',position=null){
    const pistol=slot==='secondary'||slot==='pistol',level=enemy?.58:1,source=enemy?position:null;
    // Attack crack, low receiver body, then a quiet mechanical return. The
    // pistol is short and sharp; the rifle has a lower, longer gas tail.
    noiseVoice(pistol?.043:.07,level*(pistol?.66:.72),enemy?1700:pistol?4400:2900,'highpass',source);
    noiseVoice(pistol?.105:.18,level*(pistol?.25:.4),pistol?1150:850,'lowpass',source,.008);
    tone(pistol?215:128,pistol?.08:.13,level*.43,'triangle',pistol?65:38,source);
    tone(pistol?1080:690,.027,level*.075,'square',330,source,pistol?.043:.068);
  }
  function cue(position,kind='tell'){
    if(kind==='playerStep'){noiseVoice(.075,.09,440,'lowpass');tone(82,.065,.07,'sine',42);return;}
    if(kind==='step'){noiseVoice(.065,.065,380,'lowpass',position);tone(72,.055,.055,'sine',42,position);return;}
    if(kind==='alert'){noiseVoice(.1,.14,1200,'bandpass',position);tone(310,.13,.18,'triangle',195,position);tone(190,.09,.13,'triangle',130,position,.12);return;}
    // Localized receiver handling precedes the burst without covering speech-
    // like enemy calls or sounding like a hit confirmation.
    const flank=kind==='flank';noiseVoice(.11,.18,950,'bandpass',position);
    tone(flank?180:245,.12,.2,'triangle',flank?125:175,position);
    tone(flank?130:190,.085,.14,'triangle',90,position,.14);
  }
  function feedback(kind){
    // One result chooses one authored pattern. A headshot kill does not also
    // trigger unrelated body/head/kill notifications.
    if(kind==='armor'||kind==='armorBreak'){noiseVoice(.055,.13,3200,'highpass');tone(kind==='armorBreak'?2450:1850,.085,.13,'triangle',780);if(kind==='armorBreak')noiseVoice(.15,.1,1700,'highpass',null,.035);}
    else if(kind==='headshotKill'){tone(1720,.075,.16,'sine',2250);tone(610,.19,.17,'triangle',175,null,.045);}
    else if(kind==='kill'){noiseVoice(.035,.07,1500,'bandpass');tone(460,.16,.19,'triangle',130);}
    else if(kind==='headshot'){tone(1650,.065,.14,'sine',2100);tone(900,.06,.045,'sine',750,null,.025);}
    else{noiseVoice(.033,.08,680,'lowpass');tone(570,.043,.075,'sine',390);}
  }
  return{init,shot,cue,listener,feedback,melee(mode='light'){const heavy=mode==='heavy';tone(heavy?240:340,heavy?.22:.14,heavy?.14:.10,'triangle',heavy?45:70);},hit(head){feedback(head?'headshot':'hit');},reload(){tone(420,.08,.14,'square',180);},pickup(){tone(700,.12,.2,'sine',1100);},upgrade(){tone(520,.2,.2,'triangle',1400);},hurt(){tone(90,.18,.3,'sine',40);},death(){tone(150,.7,.4,'triangle',25);},jump(){tone(130,.08,.08,'sine',80);},mute(){muted=!muted;if(master)master.gain.value=muted?0:.2;return muted;}};
}

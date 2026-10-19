(function(global){
  'use strict';
  global.createViewModel=function createViewModel(THREE){
    const viewScene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(57,1,.025,8);
    const rig=new THREE.Group();viewScene.add(rig);
    const gun=new THREE.Group();gun.name='primary-weapon';rig.add(gun);
    const boxGeo=new THREE.BoxGeometry(1,1,1);
    const cylinderGeo=new THREE.CylinderGeometry(1,1,1,10);
    const materials={
      body:new THREE.MeshStandardMaterial({color:0x505b56,roughness:.58,metalness:.35}),
      dark:new THREE.MeshStandardMaterial({color:0x28322f,roughness:.57,metalness:.38}),
      edge:new THREE.MeshStandardMaterial({color:0x788079,roughness:.43,metalness:.50}),
      blade:new THREE.MeshStandardMaterial({color:0xa8b2aa,roughness:.32,metalness:.55}),
      rubber:new THREE.MeshStandardMaterial({color:0x17201b,roughness:.95,metalness:0}),
      amber:new THREE.MeshStandardMaterial({color:0xc99d50,roughness:.5,metalness:.5}),
      glove:new THREE.MeshStandardMaterial({color:0x66715a,roughness:1,metalness:0}),
      grip:new THREE.MeshStandardMaterial({color:0x333e30,roughness:1,metalness:0}),
      sleeve:new THREE.MeshStandardMaterial({color:0x39483c,roughness:1,metalness:0}),
      led:new THREE.MeshBasicMaterial({color:0xf9bd56,toneMapped:false}),
      glass:new THREE.MeshBasicMaterial({color:0x81bcb4,transparent:true,opacity:.065,depthWrite:false,side:THREE.DoubleSide}),
      flash:new THREE.MeshBasicMaterial({color:0xffcf83,transparent:true,opacity:1,depthWrite:false,toneMapped:false}),
      flashCore:new THREE.MeshBasicMaterial({color:0xfff6d6,transparent:true,opacity:1,depthWrite:false,toneMapped:false})
    };
    function box(parent,material,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){const mesh=new THREE.Mesh(boxGeo,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.rotation.set(rx,ry,rz);parent.add(mesh);return mesh;}
    function cylinder(parent,material,x,y,z,radius,length,rx=Math.PI/2){const mesh=new THREE.Mesh(cylinderGeo,material);mesh.position.set(x,y,z);mesh.scale.set(radius,length,radius);mesh.rotation.x=rx;parent.add(mesh);return mesh;}
    // Receiver and handguard share a small set of reusable primitives.
    box(gun,materials.body,0,0,-.16,.115,.125,.38);
    box(gun,materials.dark,0,.066,-.31,.101,.026,.58);
    box(gun,materials.body,0,-.003,-.49,.091,.10,.28);
    box(gun,materials.dark,0,-.007,-.51,.099,.052,.23);
    box(gun,materials.edge,.061,.018,-.08,.014,.035,.10);
    box(gun,materials.dark,.069,.015,-.075,.004,.019,.063);
    box(gun,materials.amber,.059,-.023,-.21,.004,.013,.065);
    box(gun,materials.amber,-.059,-.023,-.21,.004,.013,.065);
    box(gun,materials.edge,0,.002,.074,.09,.095,.10);
    box(gun,materials.rubber,0,-.025,.177,.087,.145,.14,0,0,-.05);
    box(gun,materials.dark,0,-.034,.25,.097,.167,.028);
    cylinder(gun,materials.dark,0,.01,-.76,.021,.28);
    cylinder(gun,materials.edge,0,.01,-.65,.028,.045);
    cylinder(gun,materials.dark,0,.01,-.918,.033,.067);
    cylinder(gun,materials.rubber,0,.01,-.955,.022,.008);
    box(gun,materials.dark,0,-.108,.003,.06,.135,.073,-.3);
    box(gun,materials.rubber,0,-.105,.018,.064,.107,.068,-.3);
    box(gun,materials.dark,0,-.086,-.078,.021,.016,.085);
    box(gun,materials.dark,0,-.064,-.116,.021,.049,.013);
    // The repeated rail ridges are instanced to avoid extra draw calls.
    const rail=new THREE.InstancedMesh(boxGeo,materials.edge,12);
    const helper=new THREE.Object3D();
    for(let i=0;i<12;i++){helper.position.set(0,.086,-.60+i*.043);helper.scale.set(.115,.013,.014);helper.rotation.set(0,0,0);helper.updateMatrix();rail.setMatrixAt(i,helper.matrix);}gun.add(rail);
    const vents=new THREE.InstancedMesh(boxGeo,materials.rubber,8);
    for(let i=0;i<8;i++){helper.position.set(i<4?.050:-.050,.018,-.59+(i%4)*.045);helper.scale.set(.004,.021,.026);helper.updateMatrix();vents.setMatrixAt(i,helper.matrix);}gun.add(vents);
    // An open sight window keeps the target visible at the center during ADS.
    const sight=new THREE.Group();sight.position.set(0,.101,-.30);gun.add(sight);
    box(sight,materials.dark,0,.007,0,.127,.025,.10);
    box(sight,materials.body,-.054,.071,0,.020,.12,.058,0,0,-.04);
    box(sight,materials.body,.054,.071,0,.020,.12,.058,0,0,.04);
    box(sight,materials.body,0,.133,0,.12,.021,.058);
    box(sight,materials.edge,0,.133,.032,.103,.008,.007);
    box(sight,materials.glass,0,.079,0,.087,.091,.003);
    cylinder(sight,materials.dark,.078,.047,.006,.023,.034,0).rotation.z=Math.PI/2;
    box(sight,materials.led,-.072,.026,.026,.006,.006,.007);
    // The shared HUD draws the selected reticle in both hip fire and ADS.
    // Keep the optic housing clear so a fixed mark cannot cover a hollow choice.
    // Magazine articulates independently for the reload motion.
    const magazine=new THREE.Group();magazine.position.set(0,-.105,-.183);gun.add(magazine);
    box(magazine,materials.dark,0,-.061,-.012,.080,.177,.10,-.08);
    box(magazine,materials.body,0,-.151,-.018,.087,.025,.106,-.08);
    box(magazine,materials.amber,.041,-.115,-.012,.003,.022,.072);
    for(let i=0;i<3;i++)box(magazine,materials.edge,.041,-.026-i*.033,-.007,.003,.005,.073);
    // Gloved right hand and support hand, with sleeves fading below the frame.
    const rightHand=new THREE.Group();rightHand.position.set(.032,-.139,.043);gun.add(rightHand);
    box(rightHand,materials.glove,.01,0,0,.083,.096,.088,-.22,0,-.12);
    box(rightHand,materials.grip,.029,.012,-.039,.043,.075,.026,-.24);
    box(rightHand,materials.glove,-.032,.024,-.022,.025,.045,.066,-.25,0,.22);
    box(rightHand,materials.sleeve,.044,-.097,.10,.11,.17,.12,-.58,0,-.13);
    box(rightHand,materials.rubber,.024,-.05,.027,.086,.022,.085,-.22);
    const leftHand=new THREE.Group();leftHand.position.set(-.015,-.083,-.465);gun.add(leftHand);
    box(leftHand,materials.glove,-.019,-.025,.005,.105,.075,.123,0,.03,-.23);
    box(leftHand,materials.grip,-.049,.021,-.019,.038,.059,.095,0,0,-.30);
    box(leftHand,materials.glove,.045,.019,.008,.028,.064,.09,0,0,.32);
    box(leftHand,materials.sleeve,-.091,-.112,.12,.111,.20,.13,-.66,0,-.39);
    box(leftHand,materials.rubber,-.053,-.055,.050,.10,.028,.10,-.29,0,-.23);
    // Small visible hardware and a painted indexing mark.
    cylinder(gun,materials.edge,.061,.003,-.215,.009,.007,0).rotation.z=Math.PI/2;
    box(gun,materials.amber,.058,.041,-.33,.004,.016,.022);
    // The sidearm has its own slide, magazine, sights and two-handed grip.
    const pistol=new THREE.Group();pistol.name='secondary-weapon';pistol.visible=false;rig.add(pistol);
    const pistolSlide=new THREE.Group();pistol.add(pistolSlide);
    box(pistolSlide,materials.body,0,.032,-.18,.077,.062,.32);
    box(pistolSlide,materials.edge,0,.064,-.18,.067,.007,.28);
    box(pistolSlide,materials.dark,.040,.038,-.16,.003,.024,.065);
    box(pistol,materials.dark,0,-.014,-.15,.073,.032,.27);
    cylinder(pistol,materials.edge,0,.027,-.36,.017,.075);
    cylinder(pistol,materials.rubber,0,.027,-.401,.013,.007);
    box(pistol,materials.grip,0,-.091,-.031,.069,.145,.083,-.17);
    box(pistol,materials.dark,0,-.062,-.117,.026,.012,.077);
    box(pistol,materials.dark,0,-.038,-.150,.024,.058,.014);
    box(pistol,materials.amber,.037,-.005,-.232,.003,.009,.048);
    const serrations=new THREE.InstancedMesh(boxGeo,materials.dark,10);
    for(let i=0;i<10;i++){helper.position.set(i<5?.040:-.040,.031,-.065-(i%5)*.012);helper.scale.set(.003,.043,.004);helper.rotation.set(0,0,0);helper.updateMatrix();serrations.setMatrixAt(i,helper.matrix);}pistolSlide.add(serrations);
    box(pistolSlide,materials.dark,-.018,.080,-.043,.014,.024,.018);
    box(pistolSlide,materials.dark,.018,.080,-.043,.014,.024,.018);
    box(pistolSlide,materials.dark,0,.079,-.323,.009,.025,.019);
    const pistolMagazine=new THREE.Group();pistolMagazine.position.set(0,-.101,-.03);pistol.add(pistolMagazine);
    box(pistolMagazine,materials.dark,0,-.047,0,.058,.103,.069,-.17);
    box(pistolMagazine,materials.edge,0,-.100,.01,.075,.019,.084,-.17);
    const pistolRight=new THREE.Group();pistolRight.position.set(.027,-.115,-.002);pistol.add(pistolRight);
    box(pistolRight,materials.glove,.008,0,.005,.078,.081,.083,-.16,0,-.10);
    box(pistolRight,materials.grip,.027,.010,-.035,.036,.059,.024,-.15);
    box(pistolRight,materials.glove,-.031,.022,-.014,.025,.042,.059,-.15,0,.18);
    box(pistolRight,materials.sleeve,.028,-.079,.083,.097,.16,.12,-.53,0,-.15);
    const pistolLeft=new THREE.Group();pistolLeft.position.set(-.043,-.122,-.045);pistol.add(pistolLeft);
    box(pistolLeft,materials.glove,0,0,0,.071,.076,.102,0,0,-.15);
    box(pistolLeft,materials.grip,-.020,.025,-.023,.028,.059,.072,0,0,-.22);
    box(pistolLeft,materials.sleeve,-.047,-.073,.080,.098,.17,.117,-.55,0,-.34);
    // A bevelled, pointed blade reads as a knife rather than a scaled gun.
    const knife=new THREE.Group();knife.name='knife-weapon';knife.visible=false;knife.rotation.z=.32;knife.scale.setScalar(.9);rig.add(knife);
    const bladeShape=new THREE.Shape();bladeShape.moveTo(-.027,.065);bladeShape.lineTo(.035,.065);bladeShape.lineTo(.039,.285);bladeShape.lineTo(-.005,.445);bladeShape.lineTo(-.030,.326);bladeShape.closePath();
    const bladeGeometry=new THREE.ExtrudeGeometry(bladeShape,{depth:.012,steps:1,bevelEnabled:true,bevelSegments:1,bevelSize:.003,bevelThickness:.002});
    const blade=new THREE.Mesh(bladeGeometry,materials.blade);blade.position.z=-.112;knife.add(blade);
    box(knife,materials.dark,-.017,.160,-.096,.008,.12,.002);
    box(knife,materials.amber,.007,.100,-.096,.020,.010,.002);
    box(knife,materials.edge,0,.061,-.105,.117,.018,.042,0,0,-.05);
    cylinder(knife,materials.rubber,0,-.029,-.105,.029,.16,0);
    box(knife,materials.dark,0,-.112,-.105,.069,.019,.057);
    const knifeWraps=new THREE.InstancedMesh(boxGeo,materials.grip,4);
    for(let i=0;i<4;i++){helper.position.set(0,.025-i*.032,-.076);helper.scale.set(.046,.007,.006);helper.updateMatrix();knifeWraps.setMatrixAt(i,helper.matrix);}knife.add(knifeWraps);
    box(knife,materials.glove,.019,-.036,-.074,.085,.102,.083,.03,0,-.12);
    box(knife,materials.grip,.050,-.022,-.103,.033,.076,.049,.02,0,-.10);
    box(knife,materials.glove,-.030,.004,-.077,.025,.057,.064,.03,0,.24);
    box(knife,materials.rubber,.008,-.096,-.061,.078,.024,.076);
    box(knife,materials.sleeve,.035,-.177,.015,.108,.18,.126,-.48,0,-.16);
    const muzzle=new THREE.Group();muzzle.position.set(0,.01,-1.0);gun.add(muzzle);
    const flash=new THREE.Mesh(new THREE.ConeGeometry(.036,.13,5),materials.flash);flash.rotation.x=-Math.PI/2;muzzle.add(flash);
    const flashCore=new THREE.Mesh(new THREE.ConeGeometry(.019,.09,5),materials.flashCore);flashCore.rotation.x=-Math.PI/2;flashCore.position.z=.009;muzzle.add(flashCore);muzzle.visible=false;
    const flashLight=new THREE.PointLight(0xffb65f,0,1.6,2);flashLight.position.set(0,.03,-.85);gun.add(flashLight);
    viewScene.add(new THREE.HemisphereLight(0xf0f0d5,0x3a5148,2.1));
    const key=new THREE.DirectionalLight(0xffedcf,2.2);key.position.set(-1,2,2);viewScene.add(key);
    const rim=new THREE.DirectionalLight(0x9ac1b9,1.2);rim.position.set(2,1,-2);viewScene.add(rim);
    // Knife offsets follow an authored wrist/forearm arc. A short draw-back,
    // fast cut through contact and a longer recovery avoid the old pendulum
    // motion. Hand, blade and sleeve remain rigidly attached to the same rig.
    // Each row is [seconds, x,y,z, pitch,yaw,roll], relative to the ready pose.
    // Monotone cubic tangents are calculated once, keeping every frame free of
    // keyframe arrays, temporary vectors and spline overshoot.
    function makePoseMotion(duration,hitTime,recoveryTime,keys){
      const slopes=keys.map(()=>new Float64Array(6));
      for(let i=1;i<keys.length-1;i++){
        const before=keys[i][0]-keys[i-1][0],after=keys[i+1][0]-keys[i][0];
        for(let axis=0;axis<6;axis++){
          const left=(keys[i][axis+1]-keys[i-1][axis+1])/before,right=(keys[i+1][axis+1]-keys[i][axis+1])/after;
          if(left*right>0){const first=2*after+before,second=after+2*before;slopes[i][axis]=(first+second)/(first/left+second/right);}
        }
      }
      return{duration,hitTime,recoveryTime,keys,slopes};
    }
    const knifeMotions={
      light:makePoseMotion(.52,.12,.205,[
        [0,0,0,0,0,0,0],
        [.065,.055,.018,.035,.10,.12,-.24],
        [.12,-.10,.04,-.095,-.12,-.22,.32],
        [.205,-.32,-.075,-.13,-.38,-.48,.93],
        [.285,-.285,-.13,-.06,-.20,-.28,.74],
        [.52,0,0,0,0,0,0]
      ]),
      heavy:makePoseMotion(.95,.28,.38,[
        [0,0,0,0,0,0,0],
        [.17,.035,.14,.015,-.46,.16,-.72],
        [.24,.01,.15,-.04,-.22,.05,-.46],
        [.28,-.105,.02,-.16,.25,-.22,.30],
        [.38,-.275,-.19,-.18,.62,-.42,1.02],
        [.52,-.24,-.22,-.05,.32,-.25,.78],
        [.95,0,0,0,0,0,0]
      ])
    };
    // Lift, turn to show each face, then settle. These offsets belong only to
    // the first-person rig; they never rotate the player's camera or aim.
    const inspectMotions={
      primary:makePoseMotion(2.35,0,0,[
        [0,0,0,0,0,0,0],
        [.48,-.13,.035,.08,.18,.58,-.38],
        [.94,-.13,.035,.08,.18,.58,-.38],
        [1.48,-.21,.05,.02,.08,-.35,.32],
        [1.80,-.21,.05,.02,.08,-.35,.32],
        [2.35,0,0,0,0,0,0]
      ]),
      secondary:makePoseMotion(2.1,0,0,[
        [0,0,0,0,0,0,0],
        [.42,-.12,.10,-.03,.12,.65,-.48],
        [.80,-.12,.10,-.03,.12,.65,-.48],
        [1.26,-.17,.07,.015,-.12,-.55,.36],
        [1.62,-.17,.07,.015,-.12,-.55,.36],
        [2.1,0,0,0,0,0,0]
      ]),
      knife:makePoseMotion(1.95,0,0,[
        [0,0,0,0,0,0,0],
        [.4,-.17,.055,-.13,.10,-.60,-.48],
        [.74,-.17,.055,-.13,.10,-.60,-.48],
        [1.2,-.14,.025,-.10,-.16,.65,.28],
        [1.5,-.14,.025,-.10,-.16,.65,.28],
        [1.95,0,0,0,0,0,0]
      ])
    };
    function sampleMotion(motion,elapsed,offset){
      let index=0;while(index<motion.keys.length-2&&elapsed>motion.keys[index+1][0])index++;
      const from=motion.keys[index],to=motion.keys[index+1],span=to[0]-from[0],t=(elapsed-from[0])/span,t2=t*t,t3=t2*t;
      const h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2;
      for(let axis=0;axis<6;axis++)offset[axis]=h00*from[axis+1]+h10*span*motion.slopes[index][axis]+h01*to[axis+1]+h11*span*motion.slopes[index+1][axis];
    }
    const inspectOffset=new Float64Array(6);
    let inspectActive=false,inspectElapsed=0,inspectSlot='primary',inspectBlocked=false;
    function cancelInspect(){inspectActive=false;inspectElapsed=0;inspectOffset.fill(0);}
    function updateInspection(dt){
      inspectOffset.fill(0);if(!inspectActive)return;
      const motion=inspectMotions[inspectSlot];inspectElapsed=Math.min(motion.duration,inspectElapsed+dt);
      if(inspectElapsed>=motion.duration){inspectActive=false;return;}
      sampleMotion(motion,inspectElapsed,inspectOffset);
    }
    const knifeOffset=new Float64Array(6);
    let meleeActive=false,meleeElapsed=0,meleeMode='light',meleeJustStarted=false;
    function cancelMelee(){meleeActive=false;meleeElapsed=0;meleeJustStarted=false;knifeOffset.fill(0);}
    function updateKnifeMotion(dt){
      knifeOffset.fill(0);if(!meleeActive)return;
      // Input starts the gesture after this simulation step's contact timer.
      // Its first displayed pose is therefore time zero, not one frame ahead.
      if(meleeJustStarted){meleeJustStarted=false;return;}
      const motion=knifeMotions[meleeMode];meleeElapsed=Math.min(motion.duration,meleeElapsed+dt);
      if(meleeElapsed>=motion.duration){meleeActive=false;return;}
      sampleMotion(motion,meleeElapsed,knifeOffset);
    }
    let time=0,adsBlend=0,motionBlend=0,sprintBlend=0,kick=0,kickVelocity=0,flashTime=0,roll=0,switchAmount=0;
    let activeSlot='primary',desiredSlot='primary';
    function slotOf(value,fallback='primary'){return value==='knife'||value==='melee'?'knife':value==='secondary'||value==='pistol'?'secondary':value==='primary'||value==='rifle'?'primary':fallback;}
    function selectSlot(slot){
      activeSlot=slot;gun.visible=slot==='primary';pistol.visible=slot==='secondary';knife.visible=slot==='knife';
      adsBlend=0;kick=0;kickVelocity=0;roll=0;flashTime=0;cancelMelee();cancelInspect();muzzle.visible=false;flashLight.intensity=0;
      const owner=slot==='secondary'?pistol:gun;owner.add(muzzle);owner.add(flashLight);
      muzzle.position.set(0,slot==='secondary'?.027:.01,slot==='secondary'?-.462:-1);
      flashLight.position.set(0,.03,slot==='secondary'?-.37:-.85);
    }
    function update(dt,state={}){
      dt=Math.max(0,Math.min(.05,Number(dt)||0));time+=dt;
      // Paused/dead views keep the pose, but transient muzzle light must not freeze.
      if(dt===0)flashTime=0;
      const requested=slotOf(state.activeSlot||state.weaponKind,desiredSlot);
      if(requested!==desiredSlot){desiredSlot=requested;flashTime=0;cancelMelee();cancelInspect();}
      if(desiredSlot!==activeSlot){switchAmount=Math.min(1,switchAmount+dt/ .10);if(switchAmount>=1)selectSlot(desiredSlot);}
      else switchAmount=Math.max(0,switchAmount-dt/ .16);
      const melee=activeSlot==='knife',sidearm=activeSlot==='secondary';
      const movement=Math.min(1,Math.max(0,Number(state.moving)||0));
      const hasReadiness=Number.isFinite(state.adsBlend),targetAds=melee?0:hasReadiness?state.adsBlend:Number(state.ads)||0,targetMotion=movement>.001?movement:0,targetSprint=state.sprinting&&targetMotion>0?1:0;
      // Tactical handling owns readiness. A second visual easing would lag the
      // shot's real accuracy and make an aligned sight falsely appear ready.
      if(hasReadiness)adsBlend=Math.min(1,Math.max(0,targetAds));
      else adsBlend+=(Math.min(1,Math.max(0,targetAds))-adsBlend)*(1-Math.exp(-dt*15));
      // Use actual movement amplitude: a residual velocity is not a full stride.
      // Braking finishes within 84 ms, so idle/ADS poses become exactly steady
      // instead of retaining a tiny oscillation for the rest of the session.
      if(targetMotion===0)motionBlend=Math.max(0,motionBlend-dt*12);
      else motionBlend+=(targetMotion-motionBlend)*(1-Math.exp(-dt*9));
      if(targetSprint===0)sprintBlend=Math.max(0,sprintBlend-dt*12);
      else sprintBlend+=(targetSprint-sprintBlend)*(1-Math.exp(-dt*8));
      kickVelocity+=(-kick*175-kickVelocity*21)*dt;kick+=kickVelocity*dt;kick=Math.max(-.016,Math.min(.14,kick));roll*=Math.exp(-dt*13);
      const rawReload=melee?0:Number(state.reloadProgress)||0,reloading=rawReload>0&&rawReload<1;
      inspectBlocked=!!state.ads||adsBlend>.001||reloading||switchAmount>0||desiredSlot!==activeSlot||meleeActive;
      if(inspectBlocked)cancelInspect();
      const reload=reloading?Math.sin(Math.PI*rawReload):0;
      const bobStrength=motionBlend*(1-adsBlend*.85),bobTime=time*(8+sprintBlend*4);
      const bobX=Math.sin(bobTime)*.006*bobStrength,bobY=Math.abs(Math.cos(bobTime))*.006*bobStrength;
      // At full ADS, the optic window's center aligns with the shared HUD reticle.
      if(sidearm)rig.position.set(.215*(1-adsBlend)+bobX,-.235+.139*adsBlend+bobY-.035*sprintBlend,-.43+.01*adsBlend+kick*.85);
      else if(melee)rig.position.set(.29+bobX*1.5,-.28+bobY*1.5,-.50);
      else rig.position.set(.245*(1-adsBlend)+bobX,-.235+.055*adsBlend+bobY-.035*sprintBlend,-.38+.045*adsBlend+kick*.75);
      rig.rotation.set(kick*(sidearm?1.3:.65)+.12*sprintBlend+reload*.2,Math.sin(bobTime)*.005*bobStrength+reload*.15,roll-.13*sprintBlend-reload*(sidearm?.65:.52));
      rig.position.y-=reload*.035;rig.position.x+=reload*.075;
      const magDrop=reloading?Math.sin(Math.PI*Math.max(0,Math.min(1,(rawReload-.12)/.72))):0;
      magazine.position.y=-.105-magDrop*.21;magazine.position.z=-.183+magDrop*.085;magazine.rotation.x=-magDrop*.25;
      leftHand.position.y=-.083-magDrop*.13;leftHand.position.z=-.465+reload*.22;
      pistolSlide.position.z=kick*.22;pistolMagazine.position.y=-.101-magDrop*.19;pistolMagazine.position.z=-.03+magDrop*.055;
      pistolLeft.position.y=-.122-magDrop*.12;pistolLeft.position.z=-.045+reload*.095;
      updateKnifeMotion(dt);
      if(melee){rig.position.x+=knifeOffset[0];rig.position.y+=knifeOffset[1];rig.position.z+=knifeOffset[2];rig.rotation.x+=knifeOffset[3];rig.rotation.y+=knifeOffset[4];rig.rotation.z+=knifeOffset[5];}
      updateInspection(dt);
      rig.position.x+=inspectOffset[0];rig.position.y+=inspectOffset[1];rig.position.z+=inspectOffset[2];
      rig.rotation.x+=inspectOffset[3];rig.rotation.y+=inspectOffset[4];rig.rotation.z+=inspectOffset[5];
      rig.position.y-=switchAmount*.36;rig.rotation.x-=switchAmount*.35;
      flashTime=melee?0:Math.max(0,flashTime-dt);muzzle.visible=flashTime>0;flashLight.intensity=flashTime>0?(sidearm?1.65:2.1):0;
      if(muzzle.visible){muzzle.rotation.z=time*71;muzzle.scale.setScalar(.8+Math.random()*.35);materials.flash.opacity=Math.min(1,flashTime*45);}
    }
    return{
      update,
      inspect(slot=activeSlot){
        if(inspectActive){cancelInspect();return true;}
        if(inspectBlocked||meleeActive||switchAmount>0||slotOf(slot)!==activeSlot||desiredSlot!==activeSlot)return false;
        inspectSlot=activeSlot;inspectElapsed=0;inspectActive=true;return true;
      },
      cancelInspect,
      shoot(slot,mode='light'){
        cancelInspect();
        // Optional slot lets input dispatch a shot before the frame's update runs.
        if(slot)desiredSlot=slotOf(slot,desiredSlot);
        if(activeSlot!==desiredSlot){selectSlot(desiredSlot);switchAmount=Math.min(switchAmount,.35);}
        if(activeSlot==='knife'){meleeMode=mode==='heavy'?'heavy':'light';meleeElapsed=0;meleeActive=true;meleeJustStarted=true;flashTime=0;muzzle.visible=false;flashLight.intensity=0;return;}
        kickVelocity+=(activeSlot==='secondary'?1.85:1.55)*(1-.32*adsBlend);roll+=(Math.random()-.5)*.018;flashTime=.055;
      },
      render(renderer){
        const autoClear=renderer.autoClear,colorSpace=renderer.outputColorSpace,toneMapping=renderer.toneMapping,exposure=renderer.toneMappingExposure;
        try{renderer.autoClear=false;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.clearDepth();renderer.render(viewScene,camera);}
        finally{renderer.autoClear=autoClear;renderer.outputColorSpace=colorSpace;renderer.toneMapping=toneMapping;renderer.toneMappingExposure=exposure;}
      },
      resize(width,height){camera.aspect=Math.max(1,width)/Math.max(1,height);camera.updateProjectionMatrix();},
      cancelMelee,
      // Snapshot only: diagnostics can inspect timing without mutating the rig.
      getState(){const motion=knifeMotions[meleeMode];return{activeSlot,adsBlend,inspection:{active:inspectActive,elapsed:inspectElapsed,duration:inspectMotions[inspectSlot].duration,slot:inspectSlot},melee:{active:meleeActive,mode:meleeMode,elapsed:meleeElapsed,duration:motion.duration,hitTime:motion.hitTime,phase:!meleeActive?'idle':meleeElapsed<motion.hitTime?'windup':meleeElapsed<motion.recoveryTime?'strike':'recover'},pose:{position:[rig.position.x,rig.position.y,rig.position.z],rotation:[rig.rotation.x,rig.rotation.y,rig.rotation.z]}};},
      reset(){time=0;adsBlend=0;motionBlend=0;sprintBlend=0;kick=0;kickVelocity=0;flashTime=0;roll=0;cancelMelee();cancelInspect();inspectSlot='primary';inspectBlocked=false;meleeMode='light';switchAmount=0;desiredSlot='primary';selectSlot('primary');update(0,{activeSlot:'primary'});}
    };
  };
})(window);

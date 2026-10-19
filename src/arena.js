/* COPPER YARD / 铜港货场. Original three-route industrial combat arena.
 * The authored boxes are shared by rendering, collision, shots and navigation.
 * No downloaded meshes, textures, external fonts or run-time dependencies. */
(function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function makeArenaWorld(options={}){
    const size=192,water=-10,colliders=[],buildings=[],cargo=[];
    function box(kind,x,z,hx,hz,height,y=0,style='concrete'){
      const c={shape:'box',kind,x,y,z,hx,hz,height,r:Math.hypot(hx,hz),style};colliders.push(c);return c;
    }
    // Four closed warehouses define three north/south routes. The central
    // cross street and both end streets connect the lanes in both directions.
    for(const x of [-38,38])for(const z of [-44,44]){
      const b=box('wall',x,z,20,23,x<0?8.2:10,0,x<0?'sand':'ivory');buildings.push(b);
    }
    for(const s of [-1,1]){
      box('wall',s*94,0,1.5,95.5,5,0,'boundary');
      box('wall',0,s*94,92.5,1.5,5,0,'boundary');
    }
    // Tall cargo breaks the long lanes, while the smaller pallets provide
    // close-range corners. The lowest solid cover is above jump apex.
    const cargoSpecs=[
      [-76,-41,6,3.2,3,'copper'],[-72,-33,6,3.2,3,'teal'],
      [-77,43,6,3.2,3,'teal'],[-73,35,6,3.2,3,'copper'],
      [75,-45,6,3.2,3,'teal'],[73,39,6,3.2,3,'copper'],
      [-76,0,5.5,3.2,3,'copper'],[75,0,5.5,3.2,3,'teal'],
      [-5,-43,5.5,2.5,2.25,'copper'],[5,42,5.5,2.5,2.25,'teal'],
      [-30,5,3,3,2.2,'concrete'],[32,-6,3,3,2.2,'concrete'],
      [-13,78,2.6,2,2.3,'teal'],[12,-79,2.6,2,2.3,'copper'],
      [-83,-65,2.4,2.4,2.1,'concrete'],[83,63,2.4,2.4,2.1,'concrete']
    ];
    if(options.tactical)cargoSpecs.push(
      // The south staging area has real, full-height cover. Its right-hand
      // opening asks the player to clear a corner before seeing defenders;
      // the same cargo blocks bullets, sight and walking in every ruleset API.
      [-5,73,13.5,1.5,3,'teal'],
      [-8,62,6,2.5,3,'copper'],[8,20,6,2.5,3,'teal'],[-8,-22,6,2.5,3,'copper'],[8,-62,6,2.5,3,'teal'],[-10,29.8,.45,.3,1.5,'teal'],[-9,-9.2,.45,.3,1.5,'teal'],[-13,6.8,.5,.3,.9,'teal']
    );
    for(const spec of cargoSpecs){const [x,z,hx,hz,height,style]=spec;cargo.push(box('crate',x,z,hx,hz,height,0,style));}
    const tower=box('wall',9,0,3.5,3.5,16,0,'tower');
    // Crane legs block shots/movement; the overhead gantry blocks shots only.
    box('wall',-25,79,.8,1.2,21,0,'crane');box('wall',25,79,.8,1.2,21,0,'crane');
    box('wall',0,79,29,2,2,21,'gantry');
    const spawnPoints=[];
    for(const z of [-80,80])for(const x of [-75,-48,-4,6,48,75])spawnPoints.push({x,z});
    for(const x of [-81,81])for(const z of [-14,14])spawnPoints.push({x,z});
    const extractPoints=[{name:'南门撤离区',x:-46,z:80},{name:'北门撤离区',x:46,z:-80}];
    const zones=[{name:'A 货场',x:-74,z:0},{name:'中街',x:0,z:-10},{name:'B 装卸区',x:74,z:0},{name:'南门',x:0,z:84},{name:'北门',x:0,z:-84}];
    function inBounds(x,z,margin=0){return Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<=92.4-margin&&Math.abs(z)<=92.4-margin;}
    function walkable(x,z,r=.68){
      if(!inBounds(x,z,r))return false;
      for(let i=0;i<colliders.length;i++){
        const c=colliders[i];if(c.y>=1.8||c.y+c.height<=0)continue;
        const dx=Math.max(0,Math.abs(x-c.x)-c.hx),dz=Math.max(0,Math.abs(z-c.z)-c.hz);
        if(dx*dx+dz*dz<r*r)return false;
      }return true;
    }
    function segmentClear(x,z,tx,tz,r=.68){
      if(!walkable(x,z,r)||!walkable(tx,tz,r))return false;
      const dx=tx-x,dz=tz-z,length2=dx*dx+dz*dz;
      if(length2<1e-12)return true;
      // Exact 2D swept circle: two rectangles and four round corners form the
      // Minkowski-expanded box. Cost is independent of the route's length;
      // even a 150 m patrol path does not sample hundreds of positions.
      function rect(cx,cz,hx,hz){
        let near=0,far=1;
        if(Math.abs(dx)<1e-10){if(x<cx-hx||x>cx+hx)return false;}
        else{let a=(cx-hx-x)/dx,b=(cx+hx-x)/dx;if(a>b){const t=a;a=b;b=t;}near=Math.max(near,a);far=Math.min(far,b);if(near>far)return false;}
        if(Math.abs(dz)<1e-10){if(z<cz-hz||z>cz+hz)return false;}
        else{let a=(cz-hz-z)/dz,b=(cz+hz-z)/dz;if(a>b){const t=a;a=b;b=t;}near=Math.max(near,a);far=Math.min(far,b);if(near>far)return false;}
        return near<=far;
      }
      for(let i=0;i<colliders.length;i++){
        const c=colliders[i];if(c.y>=1.8||c.y+c.height<=0)continue;
        if(!rect(c.x,c.z,c.hx+r,c.hz+r))continue;
        if(rect(c.x,c.z,c.hx+r,c.hz)||rect(c.x,c.z,c.hx,c.hz+r))return false;
        for(let sx=-1;sx<=1;sx+=2)for(let sz=-1;sz<=1;sz+=2){
          const cx=c.x+sx*c.hx,cz=c.z+sz*c.hz,t=clamp(((cx-x)*dx+(cz-z)*dz)/length2,0,1);
          if((x+dx*t-cx)**2+(z+dz*t-cz)**2<r*r)return false;
        }
      }return true;
    }
    // A fixed 2 m grid with four-neighbour flow fields prevents diagonal corner
    // cutting. Destination buckets are 8 m wide and only eight cached fields
    // survive, so moving targets cannot cause unbounded memory growth.
    const n=96,step=2,count=n*n,open=new Uint8Array(count),queue=new Int32Array(count),fields=new Map();
    let builds=0;
    const point=id=>({x:-95+(id%n)*2,z:-95+Math.floor(id/n)*2});
    const cell=(x,z)=>clamp(Math.floor((x+96)/2),0,n-1)+n*clamp(Math.floor((z+96)/2),0,n-1);
    for(let id=0;id<count;id++){const p=point(id);open[id]=walkable(p.x,p.z,.76)?1:0;}
    function nearestOpen(x,z){
      const first=cell(x,z);if(open[first])return first;const cx=first%n,cz=Math.floor(first/n);
      for(let r=1;r<16;r++){
        let best=-1,bestD=Infinity;
        for(let iz=Math.max(0,cz-r);iz<=Math.min(n-1,cz+r);iz++)for(let ix=Math.max(0,cx-r);ix<=Math.min(n-1,cx+r);ix++){
          if(Math.abs(ix-cx)!==r&&Math.abs(iz-cz)!==r)continue;const id=ix+n*iz;if(!open[id])continue;
          const d=(-95+ix*2-x)**2+(-95+iz*2-z)**2;if(d<bestD){bestD=d;best=id;}
        }if(best>=0)return best;
      }return -1;
    }
    function field(tx,tz){
      const bx=Math.round(tx/8)*8,bz=Math.round(tz/8)*8,key=bx+','+bz;
      if(fields.has(key)){const f=fields.get(key);fields.delete(key);fields.set(key,f);return f;}
      const end=nearestOpen(bx,bz);if(end<0)return null;
      const distance=new Int16Array(count);distance.fill(-1);distance[end]=0;
      let head=0,tail=0;queue[tail++]=end;
      let nextDistance=0;
      const visit=k=>{if(open[k]&&distance[k]<0){distance[k]=nextDistance;queue[tail++]=k;}};
      while(head<tail){
        const id=queue[head++],x=id%n,z=Math.floor(id/n);nextDistance=distance[id]+1;
        if(x>0)visit(id-1);if(x<n-1)visit(id+1);if(z>0)visit(id-n);if(z<n-1)visit(id+n);
      }
      const f={distance,end};if(fields.size>=8)fields.delete(fields.keys().next().value);fields.set(key,f);builds++;return f;
    }
    function navigate(x,z,tx,tz){
      if(![x,z,tx,tz].every(Number.isFinite)||!walkable(x,z,.6))return null;
      if(segmentClear(x,z,tx,tz,.68))return {x:tx,z:tz};
      const f=field(tx,tz);if(!f)return null;
      let current=cell(x,z);
      if(!open[current])current=nearestOpen(x,z);
      if(current<0||f.distance[current]<0)return null;
      let best=current,bestDistance=f.distance[current],bestTravel=Infinity;
      const cx=current%n,cz=Math.floor(current/n),consider=id=>{
        if(id<0||id>=count||!open[id]||f.distance[id]<0||f.distance[id]>bestDistance)return;
        const p=point(id),travel=(p.x-x)**2+(p.z-z)**2;
        if((f.distance[id]<bestDistance||travel<bestTravel)&&segmentClear(x,z,p.x,p.z,.68)){best=id;bestDistance=f.distance[id];bestTravel=travel;}
      };
      if(cx>0)consider(current-1);if(cx<n-1)consider(current+1);if(cz>0)consider(current-n);if(cz<n-1)consider(current+n);
      const next=point(best);
      // At a bucket centre, move toward the real target only along clear space.
      if(bestDistance===0&&segmentClear(x,z,tx,tz,.68))return {x:tx,z:tz};
      return segmentClear(x,z,next.x,next.z,.68)?next:null;
    }
    const minimapBlocks=colliders.filter(c=>c.y<2).map(c=>({x:c.x,z:c.z,hx:c.hx,hz:c.hz,height:c.height,kind:c.kind,color:c.kind==='crate'?'#bf835b':c.style==='boundary'?'#798580':'#a7aaa1'}));
    return {id:'depot',name:'铜港货场',isArena:true,size,water,n:96,step:2,colliders,buildings,cargo,tower,spawnPoints,extractPoints,zones,minimapBlocks,
      height:()=>0,rawHeight:()=>0,slope:()=>0,river:()=>-1000,noise:()=>.5,fbm:()=>.5,inBounds,walkable,segmentClear,navigate,
      constrain(x,y,z,clearance=2.1){return {x:clamp(Number.isFinite(x)?x:0,-91,91),y:Math.max(clearance,Math.min(100,Number.isFinite(y)?y:clearance)),z:clamp(Number.isFinite(z)?z:0,-91,91)};},
      navStats(){return {cells:count,openCells:open.reduce((a,b)=>a+b,0),cachedFields:fields.size,maxCachedFields:8,fieldBuilds:builds};}
    };
  }

  function createArena(ctx){
    const {THREE,scene,world}=ctx,group=new THREE.Group(),farGroup=new THREE.Group();group.name='Copper Yard';farGroup.name='Copper Yard skyline';
    const colors={sand:0xc5ac86,ivory:0xded6be,concrete:0x737b75,boundary:0xaaa996,roof:0x526669,teal:0x267b7d,copper:0xb8663c,steel:0x344a4c,glass:0x58858c,yellow:0xd7b552,line:0xe9dab1,dark:0x2f4144};
    const cube=new THREE.BoxGeometry(1,1,1),batches={},materials=[],textures=[],extraGeometry=[],meshes=[],dummy=new THREE.Object3D();
    function add(material,x,y,z,sx,sy,sz,rz=0,ry=0){
      if(!batches[material])batches[material]=[];batches[material].push({x,y,z,sx,sy,sz,rz,ry});
    }
    function building(b,index){
      const {x,z,hx,hz,height:h}=b;
      add(b.style,x,h/2,z,hx*2,h,hz*2);
      // Foundation, cornice, parapet and piers articulate the mass at eye level.
      add('concrete',x,.46,z,hx*2+.12,.92,hz*2+.12);
      add('ivory',x,h-.28,z,hx*2+.4,.35,hz*2+.4);
      add('roof',x,h+.18,z,hx*2+.7,.45,hz*2+.7);
      for(const side of [-1,1]){
        for(let px=-hx+1;px<hx;px+=9.5){
          add('ivory',x+px,h/2,z+side*(hz+.08),.45,h,.25);
          add('dark',x+px+3.7,h-2.1,z+side*(hz+.17),5.4,1.7,.12);
          add('glass',x+px+3.7,h-2.1,z+side*(hz+.25),4.95,1.28,.08);
          add('steel',x+px+3.7,h-2.1,z+side*(hz+.31),.10,1.4,.08);
        }
        // Closed roller shutters read clearly as solid cover, not open doors.
        add('steel',x,2.45,z+side*(hz+.23),7.3,4.9,.22);
        add('teal',x,2.30,z+side*(hz+.38),6.6,4.6,.10);
        for(let y=.4;y<4.6;y+=.45)add('roof',x,y,z+side*(hz+.46),6.6,.045,.055);
        add('yellow',x-3.8,.72,z+side*(hz+.6),.24,1.44,.28);
        add('yellow',x+3.8,.72,z+side*(hz+.6),.24,1.44,.28);
        add('steel',x+side*(hx+.13),2.6,z, .22,5.2,.22);
        add('steel',x+side*(hx+.16),5.1,z+hz*.55,.18,.18,hz*1.1);
        for(let pz=-hz+3;pz<hz;pz+=9){
          add('ivory',x+side*(hx+.07),h/2,z+pz,.22,h,.4);
          add('dark',x+side*(hx+.2),h-2.2,z+pz+3,.13,1.65,4.1);
          add('glass',x+side*(hx+.29),h-2.2,z+pz+3,.08,1.25,3.7);
        }
      }
      add('concrete',x+8,h+.95,z-8,7,1.6,4);
      for(let i=0;i<4;i++)add('steel',x+5.7+i*1.5,h+1.83,z-8,.9,.15,3.4);
      add('steel',x-10,h+1.8,z+10,1.1,3.3,1.1);
      add('concrete',x-10,h+3.5,z+10,1.7,.3,1.7);
    }
    world.buildings.forEach(building);
    for(const c of world.colliders.filter(c=>c.style==='boundary')){
      add('boundary',c.x,c.height/2,c.z,c.hx*2,c.height,c.hz*2);
      add('ivory',c.x,c.height+.12,c.z,c.hx*2+.12,.24,c.hz*2+.12);
    }
    for(const c of world.cargo){
      const {x,z,hx,hz,height:h,style}=c;add(style,x,h/2,z,hx*2,h,hz*2);
      for(const side of [-1,1]){
        add('steel',x,h-.12,z+side*hz,hx*2,.16,.14);add('steel',x,.14,z+side*hz,hx*2,.16,.14);
        for(let px=-hx+.5;px<hx;px+=.72)add(style==='concrete'?'ivory':'roof',x+px,h/2,z+side*(hz+.025),.045,h-.32,.05);
        add('steel',x+side*(hx+.035),h/2,z,.07,h-.22,hz*2-.12);
        add(style,x+side*(hx+.08),h/2,z,.06,h-.38,hz*2-.4);
        for(const dz of [-.8,.8])add('ivory',x+side*(hx+.14),h/2,z+dz,.035,h-.6,.05);
      }
      if(style==='concrete'){
        add('yellow',x,h-.2,z+hz+.04,hx*2,.28,.06);
        for(let i=-hx+.5;i<hx;i+=1.2)add('dark',x+i,h-.2,z+hz+.081,.35,.3,.03,-.3);
      }
    }
    // Beacon tower: a recognizable copper crown over the central cross street.
    add('concrete',9,5.9,0,7,11.8,7);add('ivory',9,1.1,0,7.1,2.2,7.1);
    add('copper',9,12.2,0,7.2,.8,7.2);add('steel',9,14.1,0,6.4,3.2,6.4);
    for(const side of [-1,1]){
      add('glass',9,14.2,side*3.24,5.8,2.1,.05);add('glass',9+side*3.24,14.2,0,.05,2.1,5.8);
      add('ivory',9+side*2.9,14.1,0,.18,3.2,6.6);add('ivory',9,14.1,side*2.9,6.6,3.2,.18);
    }
    add('copper',9,16.1,0,7.9,.45,7.9);add('steel',9,18,0,.15,3.4,.15);add('yellow',9,19.7,0,.5,.5,.5);
    // The large yellow portal crane gives the north side its own silhouette.
    for(const x of [-25,25]){
      add('yellow',x,10.5,79,1.6,21,2.4);add('steel',x,.5,79,2.6,1,4);
      add('steel',x,12,79,.15,14,2.55);
      for(let y=4;y<20;y+=4)add('dark',x,y,77.77,1.65,.35,.08);
    }
    add('yellow',0,22,79,58,2,4);add('steel',0,23.15,79,58,.3,4.4);
    add('steel',4,21,79,5,.7,3.5);add('steel',4,16,79,.06,9,.06);
    add('yellow',4,11.5,79,.7,1,.5);add('steel',4.3,10.9,79,.8,.2,.25);
    // Surface markings deliberately show route direction and objective yards.
    for(const x of [-68,0,68])for(let z=-84;z<=84;z+=12)add('line',x,.014,z,.18,.025,5.5);
    for(const x of [-74,74]){
      add('yellow',x,.02,-12,24,.03,.16);add('yellow',x,.02,12,24,.03,.16);
      add('yellow',x-12,.02,0,.16,.03,24);add('yellow',x+12,.02,0,.16,.03,24);
    }
    for(const e of world.extractPoints){
      add('teal',e.x,.025,e.z,10,.035,.12);add('teal',e.x,.025,e.z-6,10,.035,.12);
      add('teal',e.x-5,.025,e.z-3,.12,.035,6);add('teal',e.x+5,.025,e.z-3,.12,.035,6);
    }
    // Asphalt uses shader noise; a single quad carries fine grain and expansion
    // seams, rather than thousands of decorative ground meshes.
    const groundMaterial=new THREE.MeshStandardMaterial({color:0x747a70,roughness:1});materials.push(groundMaterial);
    groundMaterial.onBeforeCompile=s=>{
      s.vertexShader='varying vec3 vYardPosition;\n'+s.vertexShader;
      s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvYardPosition=position;');
      s.fragmentShader='varying vec3 vYardPosition;\nfloat yardHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n'+s.fragmentShader;
      s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 p=vYardPosition.xz;float grain=yardHash(floor(p*38.));
        vec2 seam=abs(fract((p+96.)/8.)-.5);float joint=smoothstep(.493,.499,max(seam.x,seam.y));
        float oil=yardHash(floor(p/7.))*0.06;
        diffuseColor.rgb*=.92+grain*.13-oil-joint*.13;`);
    };
    const groundGeometry=new THREE.BoxGeometry(192,.2,192);extraGeometry.push(groundGeometry);
    const ground=new THREE.Mesh(groundGeometry,groundMaterial);ground.position.y=-.10;ground.receiveShadow=true;group.add(ground);
    for(const [name,entries]of Object.entries(batches)){
      const material=new THREE.MeshStandardMaterial({color:colors[name]||colors.concrete,roughness:name==='glass'?.35:.86,metalness:['steel','copper','roof'].includes(name)?.25:0});materials.push(material);
      const mesh=new THREE.InstancedMesh(cube,material,entries.length);mesh.name='Yard '+name;mesh.castShadow=!['line','glass'].includes(name);mesh.receiveShadow=true;
      for(let i=0;i<entries.length;i++){const e=entries[i];dummy.position.set(e.x,e.y,e.z);dummy.rotation.set(0,e.ry,e.rz);dummy.scale.set(e.sx,e.sy,e.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);meshes.push(mesh);
    }
    // One generated atlas supplies readable A/B, gate and warehouse lettering.
    // Decorative lettering has no independent hit geometry; the wall behind it
    // is the authoritative solid volume.
    if(typeof document!=='undefined'){
      const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const c=canvas.getContext('2d');
      if(c){
        const labels=[['A','CARGO / WEST'],['B','LOADING / EAST'],['COPPER YARD','08 / PORT AUTHORITY'],['NORTH','GATE 02'],['SOUTH','GATE 01'],['01','WAREHOUSE'],['02','WAREHOUSE'],['03','WAREHOUSE']];
        for(let i=0;i<labels.length;i++){
          const ox=(i%4)*256,oy=Math.floor(i/4)*256;c.fillStyle=i===1?'#276c70':'#d0ba94';c.fillRect(ox,oy,256,256);
          c.strokeStyle=i===1?'#d8d6b7':'#3e5655';c.lineWidth=5;c.strokeRect(ox+12,oy+12,232,232);
          c.fillStyle=i===1?'#f1dfb5':'#304c4c';c.textAlign='center';c.textBaseline='middle';c.font='900 '+(labels[i][0].length>5?28:labels[i][0].length>2?46:132)+'px sans-serif';c.fillText(labels[i][0],ox+128,oy+106,220);
          c.font='bold 14px monospace';c.fillText(labels[i][1],ox+128,oy+196,220);c.fillRect(ox+30,oy+222,196,4);
        }
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;textures.push(texture);
        const signMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:.9,side:THREE.DoubleSide});materials.push(signMaterial);
        function sign(index,x,y,z,w,h,ry){
          const geo=new THREE.PlaneGeometry(w,h),uv=geo.attributes.uv,ox=index%4,oy=Math.floor(index/4);
          for(let i=0;i<uv.count;i++)uv.setXY(i,(ox+uv.getX(i))*.25,1-(oy+1-uv.getY(i))*.5);extraGeometry.push(geo);
          const mesh=new THREE.Mesh(geo,signMaterial);mesh.position.set(x,y,z);mesh.rotation.y=ry;group.add(mesh);return mesh;
        }
        sign(0,-58.36,4.8,-44,5,5,-Math.PI/2);sign(0,-58.36,4.8,44,5,5,-Math.PI/2);
        sign(1,58.36,5.2,-44,5.2,5.2,Math.PI/2);sign(1,58.36,5.2,44,5.2,5.2,Math.PI/2);
        sign(2,9,8.4,3.54,5.5,3.4,0);sign(2,9,8.4,-3.54,5.5,3.4,Math.PI);
        sign(3,0,3,-92.46,7,3,0);sign(4,0,3,92.46,7,3,Math.PI);
        sign(5,-27,5.1,-20.64,3,3,0);sign(6,27,5.1,20.64,3,3,Math.PI);
      }
    }
    // A shared-material port apron extends beneath the skyline. It is visual
    // scenery only; world.inBounds and the perimeter walls still bound play.
    // Twelve triangles and one draw call avoid a floating "island in the sky".
    const apronGeometry=new THREE.BoxGeometry(1800,.2,1800);extraGeometry.push(apronGeometry);
    const apron=new THREE.Mesh(apronGeometry,groundMaterial);apron.name='Port exterior apron';apron.position.y=-.13;apron.receiveShadow=true;farGroup.add(apron);
    // Distant port silhouettes are static low-poly landmarks outside play.
    const distantMaterial=new THREE.MeshStandardMaterial({color:0x728b89,roughness:1});materials.push(distantMaterial);
    const distant=new THREE.InstancedMesh(cube,distantMaterial,12);
    for(let i=0;i<12;i++){const x=-160+i*29,y=12+(i%4)*5;dummy.position.set(x,y/2,-140-(i%3)*15);dummy.rotation.set(0,0,0);dummy.scale.set(18,y,20);dummy.updateMatrix();distant.setMatrixAt(i,dummy.matrix);}
    distant.computeBoundingSphere();farGroup.add(distant);group.add(farGroup);scene.add(group);
    let disposed=false;
    return {group,mesh:ground,farGroup,colliders:world.colliders,update(){},setDensity(){},
      stats(){return {map:'depot',trees:0,grass:0,rocks:0,instances:Object.values(batches).reduce((n,a)=>n+a.length,0)+12,meshes:meshes.length+3,colliders:world.colliders.length,drawCalls:meshes.length+13,density:1,capacity:{trees:0,grass:0,rocks:0},navigation:world.navStats()};},
      dispose(){if(disposed)return;disposed=true;group.removeFromParent();cube.dispose();for(const g of extraGeometry)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}
    };
  }
  globalThis.makeArenaWorld=makeArenaWorld;globalThis.createArena=createArena;
})();

/* Lightweight Unreal-inspired stack: depth AO + HDR bloom + ACES + sRGB. */
function createPost(ctx){
  const {THREE,renderer,camera}=ctx,quadScene=new THREE.Scene(),quadCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),null);quadScene.add(quad);
  const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  function material(fragmentShader,uniforms){return new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,depthTest:false,depthWrite:false});}
  const target=()=>new THREE.WebGLRenderTarget(1,1,{type:ctx.hdrType,depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
  // Copy both attachments with a full-screen pass. Keeping a separate depth copy
  // avoids framebuffer feedback when water samples depth and writes its own depth.
  const copy=material(`varying vec2 vUv;uniform sampler2D source,sourceDepth;void main(){gl_FragColor=texture2D(source,vUv);gl_FragDepth=texture2D(sourceDepth,vUv).r;}`,{source:{value:null},sourceDepth:{value:null}});
  copy.depthTest=true;copy.depthWrite=true;copy.depthFunc=THREE.AlwaysDepth;
  const bloomA=target(),bloomB=target();
  const threshold=material(`varying vec2 vUv;uniform sampler2D source;void main(){vec3 c=texture2D(source,vUv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(.85,1.9,l),1.);}`,{source:{value:null}});
  const blur=material(`varying vec2 vUv;uniform sampler2D source;uniform vec2 direction;void main(){vec3 c=texture2D(source,vUv).rgb*.227027;c+=(texture2D(source,vUv+direction*1.384615).rgb+texture2D(source,vUv-direction*1.384615).rgb)*.316216;c+=(texture2D(source,vUv+direction*3.230769).rgb+texture2D(source,vUv-direction*3.230769).rgb)*.070270;gl_FragColor=vec4(c,1.);}`,{source:{value:null},direction:{value:new THREE.Vector2()}});
  const composite=material(`precision highp float;varying vec2 vUv;
    uniform sampler2D source,depthTex,bloom;uniform mat4 inverseProjection;uniform vec2 resolution;
    uniform float aoStrength,bloomStrength,exposure,nearZ,farZ,aoSamples;
    vec3 viewPos(vec2 uv,float d){vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
    vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
    vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
    void main(){
      vec3 c=texture2D(source,vUv).rgb;float d=texture2D(depthTex,vUv).r,occ=0.;
      if(d<.99999 && aoStrength>0.){
        vec3 p=viewPos(vUv,d);vec3 normal=normalize(cross(dFdx(p),dFdy(p)));if(dot(normal,-p)<0.)normal=-normal;
        float radius=clamp(1.6/max(-p.z,.1),.001,.09),angle=fract(sin(dot(floor(vUv*resolution),vec2(12.9898,78.233)))*43758.5453)*6.28318;
        for(int i=0;i<10;i++){
          if(float(i)>=aoSamples)break;
          float a=angle+float(i)*2.399963;vec2 uv=clamp(vUv+vec2(cos(a),sin(a))*radius*(.35+.065*float(i)),vec2(.001),vec2(.999));
          float sd=texture2D(depthTex,uv).r;vec3 delta=viewPos(uv,sd)-p;float dist=length(delta);
          occ+=max(0.,dot(normal,delta/max(dist,.0001))-.12)*(1.-smoothstep(.2,5.,dist))*(sd<.99999?1.:0.);
        }
        occ=clamp(occ/max(aoSamples,1.)*2.0,0.,.6);
      }
      c*=1.-occ*aoStrength;c+=texture2D(bloom,vUv).rgb*bloomStrength;
      c=aces(c*exposure);float vig=1.-.16*pow(length((vUv-.5)*vec2(1.0,.8)),2.);c*=vig;
      gl_FragColor=vec4(srgb(c),1.);
    }`,{source:{value:null},depthTex:{value:null},bloom:{value:bloomA.texture},inverseProjection:{value:camera.projectionMatrixInverse},resolution:{value:new THREE.Vector2()},aoStrength:{value:.65},bloomStrength:{value:.14},exposure:{value:1.22},nearZ:{value:camera.near},farZ:{value:camera.far},aoSamples:{value:6}});
  let width=1,height=1,enabled=true;
  function pass(mat,target){quad.material=mat;renderer.setRenderTarget(target);renderer.render(quadScene,quadCamera);}
  function resize(w,h){width=Math.max(1,Math.floor(w/3));height=Math.max(1,Math.floor(h/3));bloomA.setSize(width,height);bloomB.setSize(width,height);composite.uniforms.resolution.value.set(w,h);}
  function render(input){
    if(enabled){threshold.uniforms.source.value=input.texture;pass(threshold,bloomA);blur.uniforms.source.value=bloomA.texture;blur.uniforms.direction.value.set(1/width,0);pass(blur,bloomB);blur.uniforms.source.value=bloomB.texture;blur.uniforms.direction.value.set(0,1/height);pass(blur,bloomA);}
    composite.uniforms.source.value=input.texture;composite.uniforms.depthTex.value=input.depthTexture;composite.uniforms.inverseProjection.value=camera.projectionMatrixInverse;
    composite.uniforms.bloomStrength.value=enabled?.14:0;composite.uniforms.aoStrength.value=enabled?.65:0;pass(composite,null);
  }
  return {resize,render,copyOpaque(source,destination){copy.uniforms.source.value=source.texture;copy.uniforms.sourceDepth.value=source.depthTexture;pass(copy,destination);},setQuality(q){composite.uniforms.aoSamples.value=q==='high'?10:q==='low'?0:6;},setEnabled(v){enabled=!!v;},stats:()=>({enabled,aoSamples:composite.uniforms.aoSamples.value,bloom:'one-third resolution separable Gaussian'})};
}

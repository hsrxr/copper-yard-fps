/* Independent native-resolution scaling and effects-only performance adaptation. */
(function(){
  'use strict';
  const qualities=['low','medium','high'],scales=[.5,.75,1,1.25,1.5];
  const qualityOf=value=>qualities.includes(value)?value:'medium';
  const scaleOf=value=>scales.includes(value)?value:1;
  function create(saved){
    saved=saved&&typeof saved==='object'?saved:{};
    let quality=qualityOf(saved.quality),renderScale=scaleOf(saved.renderScale);
    let adaptive=typeof saved.adaptive==='boolean'?saved.adaptive:true,effectiveQuality=quality,slow=0,fast=0;
    function reset(){slow=fast=0;}
    return {
      get quality(){return quality;},get renderScale(){return renderScale;},
      get adaptive(){return adaptive;},get effectiveQuality(){return effectiveQuality;},
      snapshot(){return {quality,effectiveQuality,renderScale,adaptive};},
      setQuality(value){quality=qualityOf(value);effectiveQuality=quality;reset();return quality;},
      setRenderScale(value){renderScale=scaleOf(value);reset();return renderScale;},
      setAdaptive(value){adaptive=!!value;effectiveQuality=quality;reset();return adaptive;},
      sample(dt,fps,active){
        if(!adaptive||!active){reset();return effectiveQuality;}
        if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(fps)||fps<=0)return effectiveQuality;
        dt=Math.min(dt,.25);
        slow=fps<35?slow+dt:Math.max(0,slow-dt);fast=fps>55?fast+dt:0;
        const level=qualities.indexOf(effectiveQuality),ceiling=qualities.indexOf(quality);
        if(slow>=2.5&&level>0){effectiveQuality=qualities[level-1];reset();}
        else if(fast>=15&&level<ceiling){effectiveQuality=qualities[level+1];reset();}
        return effectiveQuality;
      }
    };
  }
  function dimensions({width,height,devicePixelRatio,renderScale,maxDimension}){
    width=Number.isFinite(width)&&width>0?width:2;height=Number.isFinite(height)&&height>0?height:2;
    const dpr=Number.isFinite(devicePixelRatio)&&devicePixelRatio>0?devicePixelRatio:1;
    const requestedRatio=dpr*scaleOf(renderScale);
    const limit=Number.isFinite(maxDimension)&&maxDimension>=2?maxDimension:16384;
    const ratio=Math.min(requestedRatio,limit/width,limit/height);
    return {width:Math.max(2,Math.floor(width*ratio)),height:Math.max(2,Math.floor(height*ratio)),ratio,limited:ratio<requestedRatio};
  }
  globalThis.FPSDisplay=Object.freeze({create,dimensions});
})();

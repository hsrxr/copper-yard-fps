(function(global){
  'use strict';
  global.createFPSUI=function createFPSUI(actions){
    const $=id=>document.getElementById(id);
    const nodes={};
    ['menuScreen','pausedScreen','deadScreen','startButton','resumeButton','pauseRestartButton','restartButton','qualitySelect','soundButton','soundLabel','menuSensitivity','menuSensitivityValue','pauseSensitivity','pauseSensitivityValue','loading','loadingTitle','loadingDetail','retry','waveValue','enemiesValue','scoreValue','killsValue','headshotsValue','performanceValue','crosshair','hitmarker','hurtVignette','hurtDirection','reloadStatus','reloadFill','upgradeToast','healthBlock','hpValue','hpCap','healthFill','healthCondition','ammoBlock','weaponName','weaponLevel','ammoValue','ammoCap','reserveValue','reserveCap','upgradeTrack','upgradeCaption','resultScore','resultKills','resultWave','resultTime'].forEach(id=>nodes[id]=$(id));
    ['minimapWarning','slotPrimary','slotSecondary','slotKnife','slotPrimaryName','slotSecondaryName','slotKnifeName','aimControl','aimControlLabel','moveControlLabel','pauseMoveLabel','reloadControl','attackControlLabel'].forEach(id=>nodes[id]=$(id));
    ['menuCrosshairPicker','pauseCrosshairPicker'].forEach(id=>nodes[id]=$(id));
    ['pauseQualitySelect','menuRenderScale','pauseRenderScale','menuAdaptiveEffects','pauseAdaptiveEffects','menuRenderInfo','pauseRenderInfo'].forEach(id=>nodes[id]=$(id));
    ['menuCareerButton','pauseCareerButton','deadCareerButton','careerScreen','careerCloseButton','careerExportButton','careerStorage','careerRuns','careerKills','careerHeadshots','careerBestScore','careerBestWave','careerSeconds','careerRecordsTab','careerAchievementsTab','careerRecordsPanel','careerAchievementsPanel','careerRecordCount','careerAchievementCount','careerActive','careerActiveSummary','careerActiveDetail','careerRecords','careerAchievements','combatConfirm','combatIcon','combatLabel','combatDetail','killFeed0','killFeed1','killFeed2','killFeed3','achievementToast','achievementTitle','achievementDescription'].forEach(id=>nodes[id]=$(id));
    ['difficultySelect','mapSubtitle','mapTitle','setupDetail','mapHud','huntStatus','huntDetail','dangerStatus','extractStatus','pauseMenuButton','deadMenuButton','resultTitle','resultCopy','resultEyebrow','careerGroups'].forEach(id=>nodes[id]=$(id));
    ['mapBrief','missionNote','menuAimMode','pauseAimMode','pauseNewMissionButton','newMissionButton','missionSteps','missionStep0','missionStep1','missionStep2','missionTrack','missionFill','missionMedical','aimReadiness','aimReadinessLabel','aimReadinessFill','waveCaption','enemyCaption','enemyUnit','radarEnemyLabel','radarWarningLabel','resultWaveLabel','resultTimeLabel','resultAccuracy','resultDamage','resultTacticalStats','pauseCopy','restartLabel'].forEach(id=>nodes[id]=$(id));
    const cache=new Map(),timers={};let ready=false,muted=false,currentScreen='menu',careerOpen=false,returnFocus=null,careerTab='records',aimMode='hold';
    let feedback={kind:null,damage:0,enemyName:'',points:0,visible:false,expiresAt:0,protectedUntil:0};
    const killFeed=[],achievementQueue=[];let achievementActive=null;
    function text(id,value){const v=String(value);if(cache.get(id)!==v){nodes[id].textContent=v;cache.set(id,v);}}
    function later(key,callback,delay){clearTimeout(timers[key]);timers[key]=setTimeout(callback,delay);}
    function invoke(name,...args){if(typeof actions[name]==='function')return actions[name](...args);}
    function setAimMode(mode){aimMode=mode==='toggle'?'toggle':'hold';for(const id of ['menuAimMode','pauseAimMode'])if(nodes[id])nodes[id].value=aimMode;return aimMode;}
    function setCrosshairStyle(value){
      const style=['classic','dot','cross','gap'].includes(value)?value:'classic';
      nodes.crosshair.dataset.style=style;
      for(const id of ['menuCrosshairPicker','pauseCrosshairPicker']){
        for(const button of nodes[id].querySelectorAll('button[data-crosshair]'))button.setAttribute('aria-pressed',String(button.dataset.crosshair===style));
      }
      return style;
    }
    const qualityLabels={low:'流畅',medium:'均衡',high:'精细'};
    let displaySettings={quality:'medium',renderScale:1,adaptive:true};
    function setDisplaySettings(value={}){
      displaySettings={...displaySettings,...value};
      if(!Object.hasOwn(qualityLabels,displaySettings.quality))displaySettings.quality='medium';
      if(![.5,.75,1,1.25,1.5].includes(Number(displaySettings.renderScale)))displaySettings.renderScale=1;
      displaySettings.renderScale=Number(displaySettings.renderScale);displaySettings.adaptive=displaySettings.adaptive!==false;
      for(const id of ['qualitySelect','pauseQualitySelect'])nodes[id].value=displaySettings.quality;
      for(const prefix of ['menu','pause']){nodes[prefix+'RenderScale'].value=String(displaySettings.renderScale);nodes[prefix+'AdaptiveEffects'].checked=displaySettings.adaptive;}
      return {...displaySettings};
    }
    function updateDisplayStatus({width,height,effectiveQuality,limited=false}={}){
      const w=Math.max(0,Math.floor(Number(width)||0)),h=Math.max(0,Math.floor(Number(height)||0));
      const quality=Object.hasOwn(qualityLabels,effectiveQuality)?effectiveQuality:displaySettings.quality;
      const status=(w&&h?w+' × '+h:'正在读取画面尺寸…')+' · 当前特效：'+qualityLabels[quality]+(limited?' · 已达设备分辨率上限':'');
      for(const prefix of ['menu','pause']){text(prefix+'RenderInfo',status);nodes[prefix+'RenderInfo'].dataset.limited=String(!!limited);}
    }
    for(const id of ['qualitySelect','pauseQualitySelect'])nodes[id].addEventListener('change',event=>invoke('setQuality',setDisplaySettings({quality:event.currentTarget.value}).quality));
    for(const prefix of ['menu','pause']){
      nodes[prefix+'RenderScale'].addEventListener('change',event=>invoke('setRenderScale',setDisplaySettings({renderScale:Number(event.currentTarget.value)}).renderScale));
      nodes[prefix+'AdaptiveEffects'].addEventListener('change',event=>invoke('setAdaptive',setDisplaySettings({adaptive:event.currentTarget.checked}).adaptive));
    }
    setDisplaySettings();
    function setSensitivity(value){
      const sensitivity=Math.round(Math.max(.25,Math.min(3,Number.isFinite(value)?value:1))*20)/20;
      for(const prefix of ['menu','pause']){
        const input=nodes[prefix+'Sensitivity'];input.value=String(sensitivity);input.setAttribute('aria-valuetext',sensitivity.toFixed(2)+' 倍');input.style.setProperty('--range-fill',((sensitivity-.25)/2.75*100)+'%');
        text(prefix+'SensitivityValue',sensitivity.toFixed(2)+'×');
      }
      return sensitivity;
    }
    for(const prefix of ['menu','pause'])nodes[prefix+'Sensitivity'].addEventListener('input',event=>invoke('setSensitivity',setSensitivity(Number(event.currentTarget.value))));
    setSensitivity(1);
    for(const id of ['menuCrosshairPicker','pauseCrosshairPicker']){
      nodes[id].addEventListener('click',event=>{
        const button=event.target.closest('button[data-crosshair]');
        if(button&&nodes[id].contains(button))invoke('setCrosshairStyle',setCrosshairStyle(button.dataset.crosshair));
      });
    }
    setCrosshairStyle('classic');
    nodes.startButton.addEventListener('click',()=>{if(ready)invoke('start');});
    nodes.resumeButton.addEventListener('click',()=>invoke('resume'));
    nodes.pauseRestartButton.addEventListener('click',()=>invoke('restart'));
    nodes.restartButton.addEventListener('click',()=>invoke('restart'));
    for(const id of ['menuAimMode','pauseAimMode'])nodes[id].addEventListener('change',event=>invoke('setAimMode',setAimMode(event.currentTarget.value)));
    for(const id of ['pauseNewMissionButton','newMissionButton'])nodes[id].addEventListener('click',()=>invoke('newMission'));
    nodes.soundButton.addEventListener('click',()=>{const result=invoke('mute');muted=typeof result==='boolean'?result:!muted;nodes.soundButton.setAttribute('aria-pressed',String(muted));text('soundLabel',muted?'声音关闭':'声音开启');});
    nodes.difficultySelect.addEventListener('change',()=>invoke('setDifficulty',nodes.difficultySelect.value));
    for(const id of ['pauseMenuButton','deadMenuButton'])nodes[id].addEventListener('click',()=>invoke('menu'));
    nodes.retry.addEventListener('click',()=>location.reload());
    for(const id of ['menuCareerButton','pauseCareerButton','deadCareerButton'])nodes[id].addEventListener('click',()=>invoke('openCareer'));
    nodes.careerCloseButton.addEventListener('click',closeCareer);
    nodes.careerExportButton.addEventListener('click',()=>invoke('exportCareer'));
    nodes.careerRecordsTab.addEventListener('click',()=>selectCareerTab('records'));
    nodes.careerAchievementsTab.addEventListener('click',()=>selectCareerTab('achievements'));
    function selectCareerTab(tab,focus=false){
      careerTab=tab==='achievements'?'achievements':'records';
      for(const [key,button,panel]of [['records','careerRecordsTab','careerRecordsPanel'],['achievements','careerAchievementsTab','careerAchievementsPanel']]){
        const active=careerTab===key;nodes[button].setAttribute('aria-selected',String(active));nodes[button].tabIndex=active?0:-1;nodes[panel].hidden=!active;
        if(active&&focus)nodes[button].focus();
      }
    }
    // Capture keyboard input while the archive is open, before gameplay handlers see it.
    document.addEventListener('keydown',event=>{
      if(!careerOpen)return;
      event.stopImmediatePropagation();
      if(event.code==='Escape'||event.key==='Escape'){event.preventDefault();closeCareer();return;}
      if((event.target===nodes.careerRecordsTab||event.target===nodes.careerAchievementsTab)&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
        event.preventDefault();selectCareerTab(event.key==='Home'?'records':event.key==='End'?'achievements':careerTab==='records'?'achievements':'records',true);return;
      }
      if(event.key==='Tab'){
        const focusable=Array.from(nodes.careerScreen.querySelectorAll('button:not([disabled]),[tabindex="0"]')).filter(el=>!el.closest('[hidden]')&&el.getAttribute('tabindex')!=='-1');
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&(document.activeElement===first||!nodes.careerScreen.contains(document.activeElement))){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||!nodes.careerScreen.contains(document.activeElement))){event.preventDefault();first.focus();}
      }
    },true);
    document.addEventListener('keyup',event=>{if(careerOpen)event.stopImmediatePropagation();},true);
    function closeCareer(){
      if(!careerOpen)return;
      careerOpen=false;nodes.careerScreen.setAttribute('aria-hidden','true');delete document.body.dataset.career;
      for(const id of ['menuScreen','pausedScreen','deadScreen'])nodes[id].inert=false;
      if(returnFocus&&returnFocus.isConnected&&!returnFocus.closest('[aria-hidden="true"]'))returnFocus.focus();
      else if(currentScreen==='paused')nodes.resumeButton.focus();
      else if(currentScreen==='dead')nodes.restartButton.focus();
      else if(currentScreen==='menu')nodes.menuCareerButton.focus();
      returnFocus=null;
    }
    const safeNumber=value=>Math.max(0,Number.isFinite(Number(value))?Number(value):0);
    function duration(value){const s=Math.floor(safeNumber(value));return(s>=3600?Math.floor(s/3600)+':'+String(Math.floor(s%3600/60)).padStart(2,'0'):String(Math.floor(s/60)).padStart(2,'0'))+':'+String(s%60).padStart(2,'0');}
    function localDate(value){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'日期未知';}
    function element(tag,className,content){const el=document.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=String(content);return el;}
    function runSummary(run){return '铜港 / '+(run.difficulty==='hard'?'困难':'标准')+' · 动态战术 · 击杀 '+Math.floor(safeNumber(run.kills))+' · 爆头 '+Math.floor(safeNumber(run.headshots))+' · 目标 '+Math.min(3,Math.floor(safeNumber(run.wave)))+' / 3 · '+duration(run.duration);}
    function showCareer(data={}){
      if(!careerOpen){returnFocus=document.activeElement;careerOpen=true;document.body.dataset.career='open';for(const id of ['menuScreen','pausedScreen','deadScreen'])nodes[id].inert=true;}
      const totals=data.totals||{},storage=data.storage||{},records=Array.isArray(data.records)?data.records.slice(0,100):[],achievements=Array.isArray(data.achievements)?data.achievements:[];
      for(const [id,key]of [['careerRuns','runs'],['careerKills','kills'],['careerHeadshots','headshots'],['careerBestScore','bestScore'],['careerBestWave','bestWave']])text(id,Math.floor(safeNumber(totals[key])).toLocaleString('zh-CN'));
      text('careerSeconds',duration(totals.seconds));text('careerStorage',storage.message||(storage.available===false?'浏览器暂时无法保存档案。本次可查看记录，请及时导出。':'本地保存已开启 · 仅当前浏览器可见'));
      nodes.careerStorage.classList.toggle('unavailable',storage.available===false);text('careerRecordCount',records.length);text('careerAchievementCount',achievements.filter(item=>item.unlocked).length+' / '+achievements.length);
      nodes.careerActive.hidden=!data.active;
      if(data.active){text('careerActiveSummary',Math.floor(safeNumber(data.active.score))+' 分 · '+runSummary(data.active));text('careerActiveDetail','开始于 '+localDate(data.active.startedAt)+'。当前行动尚未计入上方累计战绩。');}
      const recordFragment=document.createDocumentFragment();
      if(!records.length){const empty=element('div','career-empty');empty.append(element('strong','', '档案等待第一份战报'),element('span','', '结束一次行动后，可在这里回顾战绩。'));recordFragment.append(empty);}
      for(const run of records){
        const card=element('article','career-record'),heading=element('div'),label={death:'阵亡结算',restart:'重新出发',abandoned:'离开行动',extracted:'成功撤离'}[run.outcome]||'行动记录';
        heading.append(element('h3','',label),element('time','',localDate(run.startedAt)));
        const score=element('div','career-record-score',Math.floor(safeNumber(run.score)).toLocaleString('zh-CN'));score.append(element('small','','本局得分'));
        const detail=element('div','career-record-details');detail.append(element('div','',runSummary(run)));
        const accuracy=run.accuracy===null||run.accuracy===undefined?'—':(Math.min(1,safeNumber(run.accuracy))*100).toFixed(1)+'%';
        const performance=run.performance||{},fps=safeNumber(performance.frames)>0?safeNumber(performance.averageFps).toFixed(1)+' FPS':'—';
        detail.append(element('div','','命中率 '+accuracy+' · 开火 '+Math.floor(safeNumber(run.shots))+' · 平均 '+fps));
        card.append(heading,score,detail);recordFragment.append(card);
      }
      nodes.careerRecords.replaceChildren(recordFragment);
      nodes.careerGroups.replaceChildren(...(data.groups||[]).map(g=>element('div','career-group','铜港 / '+(g.difficulty==='hard'?'困难':'标准')+' · 近期最高 '+g.bestScore+' 分')));
      const achievementFragment=document.createDocumentFragment();
      for(const item of achievements){
        const card=element('article','career-achievement'+(item.unlocked?' unlocked':'')),content=element('div'),target=Math.max(1,safeNumber(item.target)),current=Math.min(target,safeNumber(item.current));card.dataset.achievementId=String(item.id||'');
        card.append(element('div','achievement-symbol',item.unlocked?'◆':'◇'));
        content.append(element('h3','',item.title||'成就'),element('p','',item.description||''));
        const track=element('div','achievement-progress'),fill=element('i');fill.style.width=Math.min(100,current/target*100)+'%';track.append(fill);track.setAttribute('role','progressbar');track.setAttribute('aria-label',String(item.title||'成就进度'));track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(target));track.setAttribute('aria-valuenow',String(current));content.append(track);
        const progress=element('div','achievement-progress-label');progress.append(element('span','',item.unlocked?'已解锁':'进行中'),element('span','',item.unlocked&&item.unlockedAt?localDate(item.unlockedAt):Math.floor(current)+' / '+Math.floor(target)));content.append(progress);card.append(content);achievementFragment.append(card);
      }
      if(!achievements.length)achievementFragment.append(element('div','career-empty','暂时没有成就数据'));
      nodes.careerAchievements.replaceChildren(achievementFragment);nodes.careerScreen.setAttribute('aria-hidden','false');selectCareerTab(careerTab);nodes.careerCloseButton.focus();
    }
    function clearFeedback(){
      for(const key of ['hit','feed','achievement','hurt','toast']){clearTimeout(timers[key]);delete timers[key];}
      feedback={kind:null,damage:0,enemyName:'',points:0,visible:false,expiresAt:0,protectedUntil:0};killFeed.length=0;achievementQueue.length=0;achievementActive=null;
      nodes.hitmarker.classList.remove('on','head','kill','armor','armor-break');nodes.combatConfirm.classList.remove('on');nodes.achievementToast.classList.remove('on');
      nodes.hurtVignette.classList.remove('on');nodes.hurtDirection.classList.remove('on');nodes.upgradeToast.classList.remove('on');renderFeed();
    }
    function renderFeed(){
      const now=performance.now();for(let i=killFeed.length-1;i>=0;i--)if(killFeed[i].expiresAt<=now)killFeed.splice(i,1);
      for(let i=0;i<4;i++){const node=nodes['killFeed'+i],entry=killFeed[i];node.hidden=!entry;if(entry){node.textContent=(entry.kind==='headshotKill'?'◆ 爆头击杀':'✕ 击杀')+' · '+entry.enemyName+(entry.points>0?'  +'+entry.points:'');node.classList.toggle('head',entry.kind==='headshotKill');}}
      clearTimeout(timers.feed);if(killFeed.length)later('feed',renderFeed,Math.max(16,Math.min(...killFeed.map(item=>item.expiresAt))-now));
    }
    function combatFeedback(event={}){
      const priority={hit:1,body:1,armor:1,armorBreak:2,headshot:2,kill:3,headshotKill:4},kind=priority[event.kind]?event.kind:'hit',now=performance.now(),isKill=kind==='kill'||kind==='headshotKill',head=kind==='headshot'||kind==='headshotKill',armor=kind==='armor'||kind==='armorBreak';
      const damage=Math.round(safeNumber(event.damage)),points=Math.round(safeNumber(event.points)),enemyName=String(event.enemyName||'敌人').slice(0,32);
      if(isKill){killFeed.unshift({kind,enemyName,points,expiresAt:now+3600});killFeed.length=Math.min(4,killFeed.length);renderFeed();}
      // A following automatic-fire hit must not erase the previous kill confirmation.
      if(now<feedback.protectedUntil&&priority[kind]<priority[feedback.kind])return;
      const lifetime=isKill?650:head||kind==='armorBreak'?300:160;
      feedback={kind,damage,enemyName,points,visible:true,expiresAt:now+lifetime,protectedUntil:now+(isKill?420:head?180:0)};
      nodes.hitmarker.classList.toggle('head',head);nodes.hitmarker.classList.toggle('kill',isKill);nodes.hitmarker.classList.toggle('armor',armor);nodes.hitmarker.classList.toggle('armor-break',kind==='armorBreak');nodes.hitmarker.classList.add('on');
      nodes.combatConfirm.dataset.kind=kind;text('combatIcon',kind==='armorBreak'?'◈':armor?'▱':kind==='headshotKill'?'◆':head?'◇':isKill?'✕':'╳');text('combatLabel',{hit:'命中',body:'躯干命中',armor:'护甲命中',armorBreak:'护甲击碎',kill:'击杀',headshot:'头部命中',headshotKill:'爆头击杀'}[kind]);text('combatDetail',isKill?(points>0?'+'+points:''):damage>0?'−'+damage:'');nodes.combatConfirm.classList.add('on');
      later('hit',()=>{feedback.visible=false;nodes.hitmarker.classList.remove('on');nodes.combatConfirm.classList.remove('on');},lifetime);
    }
    function showNextAchievement(){
      achievementActive=achievementQueue.shift()||null;
      if(!achievementActive){nodes.achievementToast.classList.remove('on');return;}
      text('achievementTitle',achievementActive.title);text('achievementDescription',achievementActive.description);nodes.achievementToast.classList.add('on');later('achievement',showNextAchievement,3200);
    }
    function achievement(item={}){
      const entry={id:String(item.id||''),title:String(item.title||'新成就'),description:String(item.description||'')};
      if(entry.id&&((achievementActive&&achievementActive.id===entry.id)||achievementQueue.some(value=>value.id===entry.id)))return;
      if(achievementQueue.length>=4)achievementQueue.shift();achievementQueue.push(entry);if(!achievementActive)showNextAchievement();
    }
    function setScreen(screen){
      if(!['menu','playing','paused','dead','extracted'].includes(screen))return;
      if(screen!==currentScreen){clearFeedback();if(careerOpen)closeCareer();}
      currentScreen=screen;document.body.dataset.screen=screen;
      for(const [name,id]of [['menu','menuScreen'],['paused','pausedScreen'],['dead','deadScreen']])nodes[id].setAttribute('aria-hidden',String(screen!==name&&!(screen==='extracted'&&name==='dead')));
      text('resultTitle',screen==='extracted'?'成功撤离':'信号中断');text('resultCopy',screen==='extracted'?'已脱离交火区，本局战绩已保存。':'行动结束，战绩已记录。调整路线，再次出发。');text('resultEyebrow',screen==='extracted'?'FIELD UNIT / EXTRACTED':'FIELD UNIT / SIGNAL LOST');
      if(screen==='menu')clearFeedback();
    }
    function update(state,metrics={}){
      const w=state.weapon||{},tactical=!!state.tactical,mission=state.mission||{},accuracy=state.accuracy||{};const hp=Math.max(0,Number(state.hp)||0),maxHp=Math.max(1,Number(state.maxHp)||100);
      document.body.dataset.tactical=String(tactical);
      const slot=['primary','secondary','knife'].includes(state.activeSlot)?state.activeSlot:(w.kind==='knife'||w.kind==='melee'?'knife':w.kind==='pistol'?'secondary':'primary'),melee=slot==='knife';
      const level=Math.max(1,Number(state.level)||1),kills=Math.max(0,Number(state.kills)||0),score=Math.max(0,Math.round(Number(state.score)||0));
      const ammo=Math.max(0,Number(state.ammo)||0),mag=Math.max(1,Number(w.magSize)||30),wave=Math.max(1,Number(state.wave)||1);
      const enemyCount=Array.isArray(state.enemies)?state.enemies.filter(e=>!e.dead&&e.hp!==0).length:Math.max(0,Number(state.enemies)||0);
      const missionStage=Math.max(0,Math.min(3,Math.floor(Number(mission.stage)||0)));
      text('waveValue',tactical?String(Math.min(3,missionStage+1)).padStart(2,'0'):String(wave).padStart(2,'0'));text('waveCaption',tactical?'任务阶段 / 03':'当前波次');text('enemyCaption',tactical?'已完成':'剩余');text('enemyUnit',tactical?'个目标':'名敌人');text('enemiesValue',tactical?mission.completed?3:missionStage:enemyCount);text('scoreValue',String(score).padStart(6,'0'));text('killsValue',kills);text('headshotsValue',Math.max(0,Number(state.headshots)||0));
      const warningTime=Math.max(0,Number(state.warningTime)||0),warningCount=Math.max(0,Math.floor(Number(state.warningCount)||0));
      const warning=!tactical&&warningTime>0&&warningCount>0;nodes.minimapWarning.classList.toggle('active',warning);text('minimapWarning',tactical?'仅显示目视位置 · 淡色为最后发现':warning?'增援预警 · '+warningCount+' 人 / '+warningTime.toFixed(1)+' 秒':'暂无增援预警');
      text('radarEnemyLabel',tactical?'目视记录':'敌人');text('radarWarningLabel',tactical?'目标':'预警');
      for(const [key,id]of [['primary','slotPrimary'],['secondary','slotSecondary'],['knife','slotKnife']]){nodes[id].classList.toggle('active',slot===key);nodes[id].setAttribute('aria-current',String(slot===key));}
      text(slot==='secondary'?'slotSecondaryName':melee?'slotKnifeName':'slotPrimaryName',w.name||(melee?'战术刀':slot==='secondary'?'手枪':'步枪'));
      nodes.ammoBlock.classList.toggle('is-melee',melee);nodes.aimControl.hidden=false;nodes.reloadControl.hidden=melee;text('attackControlLabel',melee?'轻击':'射击');text('aimControlLabel',melee?'重击':aimMode==='toggle'?'切换瞄准':'按住瞄准');
      text('hpValue',Math.ceil(hp));text('hpCap',maxHp);nodes.healthFill.style.width=Math.min(100,hp/maxHp*100)+'%';nodes.healthBlock.classList.toggle('low',hp/maxHp<=.3);text('healthCondition',hp<=0?'失去信号':hp/maxHp<=.3?'危险':hp/maxHp<=.6?'受伤':'稳定');
      text('weaponName',w.name||(melee?'战术刀':slot==='secondary'?'手枪':'V-01 CARBINE'));text('weaponLevel',tactical?'固定装备':'LV.'+String(level).padStart(2,'0'));text('ammoValue',String(ammo).padStart(2,'0'));text('ammoCap',mag);text('reserveValue',Math.max(0,Number(state.reserve)||0));text('reserveCap',Math.max(0,Number(state.reserveMax)||0));nodes.ammoBlock.classList.toggle('low',!melee&&ammo<=mag*.25);nodes.ammoBlock.classList.toggle('empty',!melee&&ammo===0);
      const progress=tactical?{ratio:0}:state.progress||FPSRules.progression(kills);
      nodes.upgradeTrack.hidden=tactical;nodes.upgradeTrack.style.setProperty('--progress',progress.ratio);text('upgradeCaption',tactical?(melee?'轻击 / 重击 · 近距离应急':slot==='secondary'?'50 伤害 · 半自动 · 快速切换':'40 伤害 · 2–3 发短点射'):level>=20?'武器满级 · 追猎进行中':'再击杀 '+(progress.required-progress.current)+' 人升级 · 升级回满血');
      nodes.missionSteps.hidden=!tactical;nodes.missionTrack.hidden=!tactical;nodes.missionMedical.hidden=!tactical;
      if(tactical){
        const complete=!!mission.completed||mission.phase==='complete',required=Math.max(.01,Number(mission.required)||1),completedProgress=Math.max(0,Math.min(1,(Number(mission.progress)||0)/required));
        for(let i=0;i<3;i++){nodes['missionStep'+i].classList.toggle('done',complete||i<missionStage);nodes['missionStep'+i].classList.toggle('active',!complete&&i===missionStage);}
        text('huntStatus',complete?'任务完成':mission.title||'切入货场');text('huntDetail',mission.instruction||'利用掩体，接近第一个目标');
        const medNear=mission.medAvailable&&hp<maxHp&&Number.isFinite(mission.medDistance)&&mission.medDistance<2.5;
        text('dangerStatus','');text('extractStatus',complete?'安全撤离':mission.medProgress>0?'正在医疗 · 保持按住 E':medNear?'按住 E · 医疗 1.5 秒':Number.isFinite(mission.distance)?(mission.distance>=2.7?Math.ceil(mission.distance)+' 米 · '+(mission.phase==='extract'?'前往撤离点':'前往目标'):('按住 E · '+(Number(mission.progress)||0).toFixed(1)+' / '+required.toFixed(1)+' 秒')):'');
        nodes.missionFill.style.width=(complete?100:completedProgress*100)+'%';
        text('missionMedical',mission.medAvailable?(mission.medProgress>0?'医疗中 '+Number(mission.medProgress).toFixed(1)+' / 1.5 秒 · 受伤或离开会中断':medNear?'医疗点 +35 · 按住 E 1.5 秒 · 仅一次':'医疗点 +35 · '+(Number.isFinite(mission.medDistance)?Math.ceil(mission.medDistance)+' 米 · ':'')+'仅一次'):'医疗点已使用');nodes.missionMedical.classList.toggle('used',!mission.medAvailable);
      }
      const reloading=!melee&&Number(state.reloadLeft)>0;nodes.reloadStatus.classList.toggle('active',reloading);const reloadTime=Math.max(.1,Number(state.reloadDuration)||Number(w.reloadTime)||2);nodes.reloadFill.style.width=Math.max(0,Math.min(100,(1-Number(state.reloadLeft||0)/reloadTime)*100))+'%';
      nodes.crosshair.classList.toggle('ads',!melee&&Boolean(state.ads));nodes.crosshair.classList.toggle('melee',melee);
      updateAim({tactical,melee,ads:state.ads,accuracy});
      const fps=Number.isFinite(metrics.fps)?Math.round(metrics.fps):null;text('performanceValue',fps===null?'— FPS':fps+' FPS');
      text('resultScore',score.toLocaleString('en-US'));text('resultKills',kills);text('resultWave',tactical?(mission.completed?'3':missionStage)+' / 3':wave);text('resultWaveLabel',tactical?'目标完成':'到达波次');text('resultTimeLabel',tactical?'任务用时':'生存时间');text('resultTime',duration(tactical&&Number.isFinite(mission.time)?mission.time:state.elapsed));
      nodes.resultTacticalStats.hidden=!tactical;const hitRate=Number.isFinite(state.hitRate)?state.hitRate:Number(state.shots)>0?Number(state.hits||0)/Number(state.shots):null;text('resultAccuracy',hitRate===null?'—':(Math.max(0,Math.min(1,hitRate))*100).toFixed(1)+'%');text('resultDamage',Number.isFinite(state.damageTaken)?Math.round(state.damageTaken):'—');
      nodes.pauseNewMissionButton.hidden=!tactical;nodes.newMissionButton.hidden=!tactical;text('restartLabel',tactical?'快速重试 · 相同布局':'再次行动');text('pauseRestartButton',tactical?'快速重试 · 相同布局':'重新开始');text('pauseCopy',tactical?'任务已暂停。准备好后继续，也可以从相同布局重新尝试。':'喘口气。准备好后，继续行动。追猎与撤离倒计时已暂停。');
    }
    // Precision may cross zero for only a few frames. Update this small cue at
    // the simulation rate rather than the rest of the HUD's 10 Hz throttle.
    function updateAim({tactical,melee,ads,accuracy={}}){
      const readiness=Math.max(0,Math.min(1,Number(accuracy.adsBlend)||0)),settled=accuracy.stable===true;
      nodes.aimReadiness.hidden=!tactical||melee;nodes.aimReadiness.classList.toggle('ready',settled&&(!ads||readiness>=.99));nodes.aimReadiness.classList.toggle('aiming',!!ads);
      nodes.aimReadinessFill.style.width=(ads?readiness:settled?1:0)*100+'%';
      text('aimReadinessLabel',!ads?(settled?'停步就绪':'移动偏差'):readiness<.99?'瞄准就绪中':settled?'瞄准稳定':'停步稳定枪口');
    }
    return{
      updateAim,
      setSetup(map,difficulty){
        nodes.difficultySelect.value=difficulty;document.body.dataset.map='depot';
        text('moveControlLabel','静步');text('pauseMoveLabel','无声静步');
        text('mapTitle','铜港货场');text('mapSubtitle','COPPER YARD · 动态交战');text('mapHud','铜港 / 战术任务 / '+(difficulty==='hard'?'困难':'标准'));
        text('setupDetail','三个目标 · 奔跑有声 / Shift 静步 · 急停点射');
        nodes.mapBrief.innerHTML='观察巡逻，预瞄拐角；开火后及时换位。<br><strong>突破检查点 → 读取终端 → 北门撤离。</strong><br>敌人会听声警戒、换位压制；利用掩体换弹。';
        nodes.missionNote.innerHTML='<span>行动要点</span><br>WASD 默认奔跑 · Shift 无声静步。<br>松键刹停，反向轻点急停；低速时恢复首发精度。<br>蓝色火花表示护甲；击碎头盔后瞄准裸露头部。<br><span class="menu-key-hint">1 步枪 · 2 手枪 · 3 刀 · 按住 E 交互</span>';
      },
      setScreen,update,setSensitivity,setAimMode,setCrosshairStyle,setDisplaySettings,updateDisplayStatus,showCareer,closeCareer,combatFeedback,achievement,resetFeedback:clearFeedback,isCareerOpen:()=>careerOpen,
      getFeedbackState(){return Object.freeze({...feedback,feed:Object.freeze(killFeed.map(item=>Object.freeze({...item}))),achievement:achievementActive?Object.freeze({...achievementActive}):null,queuedAchievements:achievementQueue.length});},
      setReady(value){ready=Boolean(value);nodes.startButton.disabled=!ready;nodes.loading.hidden=ready;if(ready){nodes.loading.classList.remove('is-error');nodes.retry.hidden=true;}},
      toast(message,tone='upgrade'){text('upgradeToast',message);nodes.upgradeToast.dataset.tone=tone;nodes.upgradeToast.classList.add('on');later('toast',()=>nodes.upgradeToast.classList.remove('on'),2600);},
      hitmarker(head=false){combatFeedback({kind:head?'headshot':'hit'});},
      hurt(angle=0){nodes.hurtVignette.classList.add('on');nodes.hurtDirection.style.transform='rotate('+(Number.isFinite(angle)?angle:0)+'rad)';nodes.hurtDirection.classList.add('on');later('hurt',()=>{nodes.hurtVignette.classList.remove('on');nodes.hurtDirection.classList.remove('on');},250);},
      error(message){ready=false;nodes.startButton.disabled=true;nodes.loading.hidden=false;nodes.loading.classList.add('is-error');text('loadingTitle','暂时无法进入货场');text('loadingDetail',message||'画面初始化失败，请重新载入。');nodes.retry.hidden=false;if(currentScreen==='menu')return;setScreen('menu');}
    };
  };
})(window);

import './style.css';
import { CITIES, localMinutes, formatTime } from './cities.js';
import { Simulation, buildNetwork, demandAt, roadTraffic, COLORS } from './simulation.js';
import { CityScene } from './scene.js';
import { icon } from './icons.js';
import { trendChart, sparkline, congestionDonut, barChart } from './charts.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={cityId:'shanghai',minutes:localMinutes(CITIES.shanghai),live:true,playing:true,speed:1,demand:1,selected:null,view:'3d',loaded:false,tab:'overview'};
let simulation,network,loadId=0,toastTimer;
const snapshots=new Map();

$('#app').innerHTML=`
  <header class="topbar">
    <a class="brand" href="./" aria-label="URBANFLOW 首页"><span class="brand-mark">${icon('cube')}</span><span>URBAN<span class="brand-light">FLOW</span><small>城市交通数字孪生平台</small></span></a>
    <nav class="primary-nav" aria-label="主导航"><button class="nav-item active" data-tab="overview">${icon('dashboard')}仿真总览</button><button class="nav-item" data-tab="analysis">${icon('chart')}交通分析</button><button class="nav-item" data-tab="bottleneck">${icon('pin')}瓶颈诊断</button></nav>
    <div class="header-actions"><span class="system-status"><i></i>系统运行正常</span><button class="icon-button" id="about" aria-label="数据来源与仿真说明">${icon('info')}</button><span class="user-avatar">UF</span></div>
  </header>
  <div class="page-heading"><div><div class="eyebrow"><span class="tiny-square"></span> URBAN MOBILITY INTELLIGENCE</div><h1>让城市脉搏，<span>清晰可见。</span></h1><p>真实路网驱动的三维交通仿真与洞察</p></div><div class="heading-right"><div id="header-date"></div><button class="outline-button" id="export">${icon('download')}导出仿真报告</button></div></div>
  <main class="workspace">
    <aside class="control-panel panel">
      <div class="panel-title">${icon('settings')}仿真控制<span class="small-caps">CONTROL</span></div>
      <section class="control-section"><div class="section-label">仿真城市<span>01</span></div>
        <div class="city-picker"><label for="city">${icon('globe')}</label><select id="city" aria-label="选择仿真城市">${Object.entries(CITIES).map(([id,c])=>`<option value="${id}">${c.name} · ${c.en}</option>`).join('')}</select>${icon('chevron')}</div>
        <div class="city-preview"><div class="city-contours"><svg viewBox="0 0 240 82" aria-hidden="true"><path d="M-10 60 35 30l30 18 35-35 40 23 26-18 50 27 30-14M-10 70 35 40l30 18 35-35 40 23 26-18 50 27 30-14M-10 80 35 50l30 18 35-35 40 23 26-18 50 27 30-14"/><path class="contour-river" d="m-20 60 55 0 26-14 38 10 30-20 33 6 37-27 65 6"/></svg><span class="city-dot"></span></div><div class="city-name"><span id="city-en">SHANGHAI</span><span class="osm-tag">OSM 路网</span></div><div class="city-location" id="city-subtitle"></div></div>
      </section>
      <section class="control-section"><div class="section-label">场景图层<span>02</span></div>
        ${[['buildings','building','三维建筑','建筑轮廓与城市地标'],['traffic','activity','交通流热力','路段状态与动态车辆'],['elevated','bridge','桥梁与高架','桥梁结构与高架桥墩'],['signals','signal','信号交叉口','模拟信号灯运行状态']].map(([key,ico,title,desc])=>`<label class="layer-row"><span class="layer-icon">${icon(ico)}</span><span class="layer-text">${title}<small>${desc}</small></span><input type="checkbox" data-layer="${key}" checked aria-label="${title}"><span class="switch"></span></label>`).join('')}
      </section>
      <section class="control-section demand-section"><div class="section-label">交通需求<span>03</span></div><div class="demand-title"><span>车流需求强度</span><strong id="demand-value">100<span>%</span></strong></div><input type="range" id="demand" min="40" max="180" step="5" value="100" aria-label="车流需求强度"><div class="range-labels"><span>低流量</span><span>高流量</span></div><div class="scenario-buttons"><button data-time="510">早高峰 <span>08:30</span></button><button data-time="1065">晚高峰 <span>17:45</span></button></div></section>
      <div class="control-bottom"><div>${icon('layers')}<span>路网数据<span class="source-value">OpenStreetMap</span></span></div><p>真实城市路网 · 交通模型仿真</p><button id="reset-all">${icon('reset')}重置仿真参数</button></div>
    </aside>
    <section class="center-column">
      <div class="map-panel panel" id="map-panel">
        <div id="city-map"><div class="map-vignette"></div>
          <div class="map-heading"><div><span class="map-eyebrow">CITY DIGITAL TWIN</span><h2><span id="map-city">上海</span><span class="map-area" id="map-area"></span></h2></div><span class="simulation-badge"><i></i><span id="run-state">仿真运行中</span></span></div>
          <div class="map-coordinate" id="coordinates"></div>
          <div class="view-switch" role="group" aria-label="地图视角"><button data-view="2d">2D</button><button data-view="3d" class="active">3D</button></div>
          <div class="map-controls"><button id="north" aria-label="复位地图视角" title="复位视角">${icon('compass')}<span>N</span></button><div><button id="zoom-in" aria-label="放大地图">${icon('plus')}</button><button id="zoom-out" aria-label="缩小地图">${icon('minus')}</button></div><button id="fullscreen" aria-label="全屏地图">${icon('expand')}</button></div>
          <div class="map-legend"><span>路况</span><i style="--legend:#83d8b0"></i>畅通<i style="--legend:#d9bc69"></i>缓行<i style="--legend:#e79063"></i>拥堵<i style="--legend:#e36673"></i>严重拥堵</div>
          <div class="map-scale"><span></span>500 m</div>
          <div class="map-help">拖拽旋转 · 滚轮缩放 · 点击道路查看详情</div>
          <div class="map-loading" id="loading"><span class="loading-cube">${icon('cube')}</span><strong>正在构建城市数字孪生</strong><span id="loading-message">读取真实路网与建筑数据…</span></div>
          <div class="road-popup" id="road-popup" hidden></div>
        </div>
        <div class="map-status"><span><i></i><span id="map-road-count">—</span> 路段已加载</span><span id="map-elements">—</span><span class="fps"><b id="fps">60</b> FPS</span></div>
      </div>
      <section class="timeline panel"><div class="timeline-heading"><div>${icon('clock')}<h3>时间推演</h3><span id="time-mode">城市当地时间</span></div><button id="live" class="live-button active"><i></i>实时同步</button></div><div class="time-controls"><button class="play-button" id="play" aria-label="暂停仿真">${icon('pause')}</button><div class="current-time" id="current-time">00:00</div><span class="time-zone" id="time-zone">UTC+8</span><div class="time-presets"><button data-time="360">清晨</button><button data-time="510">早高峰</button><button data-time="780">午间</button><button data-time="1065">晚高峰</button><button data-time="1320">夜间</button></div><button class="speed-button" id="speed" title="回放速度：1× = 每秒 1 分钟">1× ${icon('chevron')}</button></div><div class="timeline-track"><div class="peak-band morning"></div><div class="peak-band evening"></div><input type="range" id="time-slider" min="0" max="1439" step="1" aria-label="仿真时间（分钟）"><div class="time-ticks">${[0,3,6,9,12,15,18,21,24].map(h=>`<span>${String(h).padStart(2,'0')}:00</span>`).join('')}</div></div><div class="timeline-note"><span><i class="peak-dot"></i>高峰时段 <span class="dim">07:00–10:00 / 16:00–20:00</span></span><span>按城市时区同步</span></div></section>
    </section>
    <aside class="analytics-panel panel"><div class="panel-title">${icon('chart')}交通运行态势<span class="small-caps">INSIGHTS</span></div>
      <div class="analytics-content"><section class="congestion-overview"><div class="section-label">路网拥堵指数 <button class="text-icon" id="index-info" aria-label="拥堵指数计算说明">${icon('info')}</button></div><div class="congestion-value"><strong id="congestion-value">—</strong><span>/ 10</span><span class="status-pill" id="congestion-status">畅通</span></div><div class="index-meter"><span id="index-marker"></span></div><div class="meter-labels"><span>畅通</span><span>严重拥堵</span></div></section>
      <section class="metric-grid"><div class="metric-card"><span>${icon('speed')}平均车速</span><div><strong id="average-speed">—</strong><small>km/h</small></div><p><i class="metric-dot"></i>路长加权平均</p></div><div class="metric-card"><span>${icon('car')}在途车辆</span><div><strong id="vehicle-count">—</strong><small>辆</small></div><p><i class="metric-dot"></i>场景仿真车辆</p></div><div class="metric-card"><span>${icon('activity')}主干道流量</span><div><strong id="throughput">—</strong><small>辆/h</small></div><p>4 个入口等效流量</p></div><div class="metric-card"><span>${icon('road')}路网覆盖</span><div><strong id="network-length">—</strong><small>km</small></div><p id="road-count">— 个路段</p></div></section>
      <section class="analytics-section"><div class="section-heading"><h3>24 小时交通趋势</h3><span class="chart-legend"><i></i>需求强度</span></div><div id="trend-chart"></div></section>
      <section class="analytics-section distribution-section"><div class="section-heading"><h3>路段通行状态</h3><span class="small-muted">当前时刻</span></div><div class="distribution"><div id="donut"></div><div class="distribution-legend" id="distribution-legend"></div></div></section>
      <section class="analytics-section bottleneck-section"><div class="section-heading"><h3><span class="warning-dot"></span>交通瓶颈 <span class="heading-count">TOP 5</span></h3><button class="text-button" id="all-bottlenecks" aria-label="查看完整瓶颈分析">${icon('arrow')}</button></div><div id="bottlenecks"></div><p class="bottleneck-note">点击路段，在三维场景中定位 ${icon('pin')}</p></section>
      </div>
    </aside>
  </main>
  <footer class="page-footer"><span><i></i>引擎就绪<span class="footer-divider">/</span><span id="footer-city">上海</span><span class="footer-divider">/</span>基于真实路网的交通仿真</span><span>© OpenStreetMap contributors · ODbL<span class="footer-divider">/</span>URBANFLOW v1.0</span></footer>
  <div class="toast" id="toast" role="status" hidden></div>
  <dialog id="dialog"><div class="dialog-top"><span id="dialog-eyebrow">URBANFLOW / INSIGHTS</span><button class="icon-button" id="close-dialog" aria-label="关闭对话框">${icon('close')}</button></div><div id="dialog-content"></div></dialog>`;

let scene;
const loadingMarkup=$('#loading').innerHTML;
// Keep the actionable bottleneck list ahead of the detailed distribution chart.
$('.analytics-content').append($('.distribution-section'));
try{scene=new CityScene($('#city-map'),selectRoad);}catch(error){$('#loading').innerHTML=`${icon('warning')}<strong>三维引擎未能启动</strong><span>请启用浏览器 WebGL / 硬件加速后刷新。</span>`;console.error(error);}

function toast(message){$('#toast').innerHTML=`${icon('check')} ${escapeHtml(message)}`;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3200);}
function dateLabel(city){return new Intl.DateTimeFormat('zh-CN',{timeZone:city.timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'long'}).format(new Date());}
async function loadCity(id){
  if(!scene)return;
  const request=++loadId;state.loaded=false;state.cityId=id;state.selected=null;$('#road-popup').hidden=true;$('#loading').innerHTML=loadingMarkup;$('#loading').hidden=false;
  const city=CITIES[id];
  try{
    if(!snapshots.has(id)){const response=await fetch(`${import.meta.env.BASE_URL}data/${id}.json`);if(!response.ok)throw new Error(`路网数据 HTTP ${response.status}`);snapshots.set(id,await response.json());}
    if(request!==loadId)return;
    $('#loading-message').textContent='生成建筑、道路与交通模型…';
    // Yield so the loading state is painted before building the geometry.
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,20)));
    if(request!==loadId)return;
    network=buildNetwork(snapshots.get(id),city);
    if(!network.roads.length)throw new Error('快照中没有有效道路');
    if(state.live)state.minutes=localMinutes(city);
    simulation=new Simulation(network,state.minutes);simulation.setDemand(state.demand);scene.load(network,city,simulation);scene.setView(state.view);
    $('#city-en').textContent=city.en;$('#city-subtitle').textContent=city.subtitle;$('#map-city').textContent=city.name;$('#map-area').textContent=city.subtitle.split(' · ')[0];$('#coordinates').textContent=city.coordinates;$('#footer-city').textContent=city.name;
    $('#header-date').textContent=dateLabel(city);
    $('#time-zone').textContent=new Intl.DateTimeFormat('en',{timeZone:city.timezone,timeZoneName:'shortOffset'}).formatToParts(new Date()).find(p=>p.type==='timeZoneName').value.replace('GMT','UTC');
    $('#map-road-count').textContent=network.roads.length.toLocaleString();$('#map-elements').textContent=`${network.signalCount} 个信号节点 · ${network.roads.filter(r=>r.elevated).length} 段桥梁高架`;
    state.loaded=true;$('#loading').hidden=true;updateUI();
    window.__URBANFLOW__={state,get network(){return network},get simulation(){return simulation},scene};
  }catch(error){if(request!==loadId)return;$('#loading').innerHTML=`${icon('warning')}<strong>城市路网加载失败</strong><span>${escapeHtml(error.message)}</span><button class="outline-button" id="retry-city">重新加载</button>`;$('#retry-city').onclick=()=>location.reload();console.error(error);}
}

function updateUI(){
  $('#current-time').textContent=formatTime(state.minutes);$('#time-slider').value=Math.floor(state.minutes);$('#time-slider').style.setProperty('--progress',`${state.minutes/1440*100}%`);
  $('#time-mode').textContent=state.live?'城市当地时间':'手动时间推演';$('#live').classList.toggle('active',state.live);
  $('#play').innerHTML=icon(state.playing?'pause':'play');$('#play').setAttribute('aria-label',state.playing?'暂停仿真':'播放仿真');$('#run-state').textContent=state.playing?'仿真运行中':'仿真已暂停';$('.simulation-badge').classList.toggle('paused',!state.playing);
  $$('[data-time]').forEach(b=>b.classList.toggle('active',Math.abs(state.minutes-Number(b.dataset.time))<20));
  if(!simulation)return;
  const metrics=simulation.metrics(),index=metrics.congestion*10;
  $('#congestion-value').textContent=index.toFixed(1);$('#index-marker').style.left=`${Math.max(1,Math.min(99,index*10))}%`;
  const level=index>6.7?'严重拥堵':index>4.3?'拥堵':index>2.2?'缓行':'畅通';const c=index>6.7?COLORS.jam:index>4.3?COLORS.heavy:index>2.2?COLORS.moderate:COLORS.free;
  $('#congestion-status').textContent=level;$('#congestion-status').style.color=c;$('#congestion-status').style.background=`${c}16`;
  $('#average-speed').textContent=metrics.speed.toFixed(1);$('#vehicle-count').textContent=metrics.vehicles.toLocaleString();$('#throughput').textContent=metrics.throughput.toLocaleString();$('#network-length').textContent=metrics.length.toFixed(0);$('#road-count').textContent=`${metrics.roadCount.toLocaleString()} 个真实路段`;
  $('#trend-chart').innerHTML=trendChart(state.minutes,state.demand);$('#donut').innerHTML=congestionDonut(metrics.counts);
  $('#distribution-legend').innerHTML=metrics.counts.map((n,i)=>`<div><i style="background:${Object.values(COLORS)[i]}"></i><span>${['畅通','缓行','拥堵','严重拥堵'][i]}</span><b>${n.toLocaleString()}</b></div>`).join('');
  $('#bottlenecks').innerHTML=metrics.bottlenecks.map(({road,traffic},i)=>`<button class="bottleneck-row" data-road="${road.id}" aria-label="定位 ${escapeHtml(road.name)}"><span class="rank ${i<2?'rank-hot':''}">${String(i+1).padStart(2,'0')}</span><span class="bottleneck-road"><strong>${escapeHtml(road.name)}</strong><small>${road.bridge?'桥梁通道':road.elevated?'高架路段':road.signal?'信号交叉口':road.motorway?'快速路':'城市道路'}</small></span><span class="bottleneck-speed" style="color:${traffic.color}">${traffic.speed.toFixed(0)}<small>km/h</small></span>${icon('chevron')}</button>`).join('');
  $('.bottleneck-note').textContent=metrics.bottlenecks[0]?.traffic.congestion>.43?'点击路段，在三维场景中定位':'当前暂无拥堵 · 显示相对缓慢的道路';
  if(state.selected)renderRoadPopup(state.selected);
}
function changeTime(minutes){state.minutes=Number(minutes);state.live=false;simulation?.setTime(state.minutes);scene?.updateTraffic();updateUI();}
function selectRoad(road){if(!state.loaded)return;state.selected=road;renderRoadPopup(road);}
function renderRoadPopup(road){const traffic=simulation.stats[road.id];$('#road-popup').hidden=false;$('#road-popup').innerHTML=`<button class="popup-close" aria-label="关闭路段详情">${icon('close')}</button><span class="map-eyebrow">ROAD INSIGHT · OSM ${road.osmId}</span><h3>${escapeHtml(road.name)}</h3><div class="popup-tags"><span>${road.bridge?'桥梁':road.elevated?'高架':road.motorway?'快速路':'地面道路'}</span><span>${road.oneway?'单向通行':'双向通行'}</span><span>${road.lanes} 车道</span></div><div class="popup-metrics"><div><strong>${traffic.speed.toFixed(1)}<small> km/h</small></strong><span>平均速度</span></div><div><strong>${traffic.flow.toLocaleString()}<small> 辆/h</small></strong><span>模型流量</span></div><div><strong style="color:${traffic.color}">${(traffic.congestion*10).toFixed(1)}</strong><span>拥堵指数</span></div></div><p>${road.signal?'设置信号灯，模拟周期 70 秒。':road.bridge?'桥梁通道受容量约束，高峰需求可能产生排队。':'交通状态由当前时间和车流需求共同计算。'} 长度 ${(road.length*10).toFixed(0)} m。</p>`;$('.popup-close').onclick=()=>{state.selected=null;$('#road-popup').hidden=true;scene.highlight.visible=false};scene.highlight.visible=true;}

$('#city').addEventListener('change',e=>loadCity(e.target.value));
$$('[data-layer]').forEach(input=>input.addEventListener('change',()=>scene?.setLayer(input.dataset.layer,input.checked)));
$('#demand').addEventListener('input',e=>{state.demand=Number(e.target.value)/100;$('#demand-value').innerHTML=`${e.target.value}<span>%</span>`;simulation?.setDemand(state.demand);scene?.updateTraffic();updateUI();});
$('#time-slider').addEventListener('input',e=>changeTime(e.target.value));
$$('[data-time]').forEach(b=>b.addEventListener('click',()=>changeTime(b.dataset.time)));
$('#play').onclick=()=>{state.playing=!state.playing;updateUI();};
$('#live').onclick=()=>{state.live=true;state.minutes=localMinutes(CITIES[state.cityId]);state.playing=true;simulation?.setTime(state.minutes);scene?.updateTraffic();updateUI();};
$('#speed').onclick=()=>{const values=[1,5,15,60];state.speed=values[(values.indexOf(state.speed)+1)%values.length];$('#speed').innerHTML=`${state.speed}× ${icon('chevron')}`;$('#speed').title=`回放速度：每秒 ${state.speed} 分钟`;toast(`时间推演速度：每秒 ${state.speed} 分钟`);};
$$('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;scene?.setView(state.view);$$('[data-view]').forEach(x=>x.classList.toggle('active',x===b));});
$('#north').onclick=()=>{scene?.reset();state.view='3d';$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view==='3d'));};
$('#zoom-in').onclick=()=>scene?.zoom(.8);$('#zoom-out').onclick=()=>scene?.zoom(1.25);
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#map-panel').requestFullscreen();}catch{toast('当前浏览器不支持全屏，请使用地图缩放。');}};
$('#reset-all').onclick=()=>{state.demand=1;state.speed=1;state.live=true;state.playing=true;state.minutes=localMinutes(CITIES[state.cityId]);state.selected=null;$('#road-popup').hidden=true;$('#demand').value=100;$('#demand-value').innerHTML='100<span>%</span>';$('#speed').innerHTML=`1× ${icon('chevron')}`;$$('[data-layer]').forEach(x=>{x.checked=true;scene?.setLayer(x.dataset.layer,true)});simulation?.setDemand(1);simulation?.setTime(state.minutes);state.view='3d';$$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view==='3d'));scene?.reset();scene?.updateTraffic();if(scene?.highlight)scene.highlight.visible=false;updateUI();toast('已恢复默认参数与城市当地时间');};
$('#bottlenecks').onclick=e=>{const button=e.target.closest('[data-road]');if(button){const r=network.roads[Number(button.dataset.road)];scene?.focus(r);selectRoad(r);}};

function openDialog(html,eyebrow='URBANFLOW / INSIGHTS'){ $('#dialog-content').innerHTML=html;$('#dialog-eyebrow').textContent=eyebrow;if(!$('#dialog').open)$('#dialog').showModal(); }
function closeDialog(){ $('#dialog').close();$$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='overview'));state.tab='overview'; }
$('#close-dialog').onclick=closeDialog;$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});$('#dialog').addEventListener('cancel',closeDialog);
function showAbout(){openDialog(`<h2>以真实城市，理解交通。</h2><p class="dialog-intro">URBANFLOW 将开放地图与交通模型放在同一张三维画布中，让每一条道路的运行状态都可被探索。</p><div class="about-grid"><article>${icon('globe')}<h3>真实路网</h3><p>四座城市约 4–6 km 的核心城区，来自 OpenStreetMap。保留道路坐标、名称、车道数、单行方向、桥梁、高架层级与信号节点；并非全市路网。</p></article><article>${icon('activity')}<h3>模型驱动</h3><p>交通需求采用城市当地时间的双高峰曲线，速度由 BPR 容量延误关系计算。车辆沿路网行驶，考虑单行道、车距和 70 秒固定信号周期。</p></article><article>${icon('building')}<h3>三维表达</h3><p>建筑轮廓来自 OSM；无高度标注时使用确定性估算。河流水域与地标采用概化表达，桥梁高架高度按层级示意。场景最多显示 6,500 栋建筑、2,200 辆车。</p></article><article>${icon('clock')}<h3>数据边界</h3><p>实时同步指同步城市当地时间，路况为模型仿真，未接入实时交通传感器或导航实测数据。流量与拥堵指标用于场景探索，不能作为实际出行依据。</p></article></div><div class="source-note">路网快照：${escapeHtml(network?.snapshot.fetchedAt?.slice(0,10)||'—')} · 地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · ODbL 1.0<br>模型：BPR 速度延误关系、路长加权拥堵指数、确定性早晚高峰需求。回放 1× = 1 分钟/秒。</div>`,'URBANFLOW / DATA & MODEL');}
$('#about').onclick=showAbout;$('#index-info').onclick=()=>openDialog('<h2>路网拥堵指数</h2><p class="dialog-intro">以每条路段当前速度相对自由流速度的下降比例为基础，按路段长度加权，映射到 0–10 分。</p><div class="formula">指数 = 10 × Σ [路长 × (1 − 当前速度 / 自由流速度)] / 总路长</div><p class="source-note">0–2.2 畅通 · 2.2–4.3 缓行 · 4.3–6.7 拥堵 · 6.7–10 严重拥堵。瓶颈排序采用各道路最拥堵路段，代表局部状态，可能与全局平均不同。</p>');
function showAnalysis(){if(!simulation)return;const m=simulation.metrics();openDialog(`<div class="dialog-title-row"><div><h2>${CITIES[state.cityId].name} · 交通分析</h2><p class="dialog-intro">${formatTime(state.minutes)} 当地时间 · 需求强度 ${Math.round(state.demand*100)}% · 模型仿真</p></div><span class="analysis-tag">24H OVERVIEW</span></div><div class="analysis-summary"><div><span>路网平均车速</span><strong>${m.speed.toFixed(1)}<small> km/h</small></strong></div><div><span>路网拥堵指数</span><strong>${(m.congestion*10).toFixed(1)}<small> / 10</small></strong></div><div><span>仿真在途车辆</span><strong>${m.vehicles.toLocaleString()}<small> 辆</small></strong></div><div><span>路网总长度</span><strong>${m.length.toFixed(1)}<small> km</small></strong></div></div><h3 class="dialog-section-title">全天需求变化 <span>早高峰 08:30 / 晚高峰 17:45</span></h3>${trendChart(state.minutes,state.demand,true)}<div class="analysis-lower"><section><h3>各类道路平均速度</h3>${barChart(network.roads,simulation.stats)}</section><section><h3>高峰对比</h3><div class="peak-comparison">${[[180,'凌晨 03:00'],[510,'早高峰 08:30'],[1065,'晚高峰 17:45']].map(([time,label])=>{const speed=network.roads.reduce((n,r)=>n+roadTraffic(r,time,state.demand).speed*r.length,0)/network.roads.reduce((n,r)=>n+r.length,0);return `<div><span>${label}</span><strong>${speed.toFixed(1)} <small>km/h</small></strong></div>`}).join('')}</div></section></div><p class="source-note">所有指标来自当前场景同一交通模型；实时路况接口尚未接入。主干道流量为主干道路段平均流量 × 4 个等效入口。</p>`);}
function showBottlenecks(){if(!simulation)return;const rows=simulation.metrics().bottlenecks;openDialog(`<h2>瓶颈诊断</h2><p class="dialog-intro">${CITIES[state.cityId].name} · ${formatTime(state.minutes)} · 按单条道路最拥堵路段排序</p><div class="diagnosis-note">${icon('info')}桥梁、匝道与信号路口的容量约束会放大高峰需求。点击定位，观察现场交通。</div><div class="table-scroll"><table><thead><tr><th>道路名称</th><th>类型</th><th>当前车速</th><th>拥堵指数</th><th>延误</th><th></th></tr></thead><tbody>${rows.map(({road:r,traffic:s})=>`<tr><td>${escapeHtml(r.name)}</td><td>${r.bridge?'桥梁':r.elevated?'高架':r.signal?'信号路口':r.motorway?'快速路':'地面道路'}</td><td>${s.speed.toFixed(1)} <small>km/h</small></td><td><span style="color:${s.color}">${(s.congestion*10).toFixed(1)}</span></td><td>${s.delay.toFixed(0)} s</td><td><button class="table-locate" data-locate="${r.id}">${icon('pin')}定位</button></td></tr>`).join('')}</tbody></table></div><p class="source-note">延误为当前路段相对自由流的额外行驶时间，不包含下游全程延误。可在左侧提高需求，或切换到早晚高峰，观察瓶颈变化。</p>`);$$('[data-locate]').forEach(b=>b.onclick=()=>{closeDialog();const r=network.roads[Number(b.dataset.locate)];scene?.focus(r);selectRoad(r);});}
$$('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;$$('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));if(state.tab==='analysis')showAnalysis();else if(state.tab==='bottleneck')showBottlenecks();else closeDialog();});$('#all-bottlenecks').onclick=showBottlenecks;
$('#export').onclick=()=>{if(!simulation){toast('请等待路网加载完成');return;}const quote=s=>`"${String(s).replace(/"/g,'""')}"`;const rows=[['URBANFLOW 城市交通仿真报告'],['城市',CITIES[state.cityId].name],['当地时间',formatTime(state.minutes)],['需求强度',state.demand],['数据类型','OpenStreetMap 真实路网 + 模型仿真（非实时实测）'],['OSM 快照时间',network.snapshot.timestamp||network.snapshot.fetchedAt],[],['OSM ID','道路名称','道路类型','桥梁','高架层级','车道','单向','长度(m)','自由流速度(km/h)','仿真速度(km/h)','流量(辆/h)','拥堵指数(0-10)','延误(s)'],...network.roads.map(r=>{const s=simulation.stats[r.id];return [r.osmId,r.name,r.kind,r.bridge?'是':'否',r.layer,r.lanes,r.oneway?'是':'否',(r.length*10).toFixed(1),r.freeSpeed,s.speed.toFixed(1),s.flow,(s.congestion*10).toFixed(2),s.delay.toFixed(1)];})];const csv='\ufeff'+rows.map(r=>r.map(value=>quote(typeof value==='string'&&/^[=+\-@]/.test(value)?`'${value}`:value)).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`URBANFLOW_${state.cityId}_${formatTime(state.minutes).replace(':','')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前时刻全部路段的仿真报告');};

let last=performance.now(),lastUI=0,fpsStart=last,fpsFrames=0;
function frame(now){const dt=Math.min((now-last)/1000,.1);last=now;
  if(state.loaded){if(state.playing){if(state.live){const current=localMinutes(CITIES[state.cityId]);if(Math.floor(state.minutes)!==current){state.minutes=current;simulation.setTime(state.minutes);scene?.updateTraffic();}}else state.minutes=(state.minutes+dt*state.speed)%1440;}
    if(now-lastUI>1000){if(!state.live)simulation.setTime(state.minutes);scene?.updateTraffic();updateUI();lastUI=now;}
    scene?.render(dt,state.playing);
  }else scene?.render(dt,false);
  fpsFrames++;if(now-fpsStart>1500){$('#fps').textContent=Math.round(fpsFrames*1000/(now-fpsStart));fpsFrames=0;fpsStart=now;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);loadCity(state.cityId);

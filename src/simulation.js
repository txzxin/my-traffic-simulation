import { project } from './cities.js';

export const COLORS = { free: '#83d8b0', moderate: '#d9bc69', heavy: '#e79063', jam: '#e36673' };
export function hash(n) { const v = Math.sin(Number(n)*127.1+311.7)*43758.5453; return v-Math.floor(v); }
const gaussian = (h,center,width) => Math.exp(-0.5*((h-center)/width)**2);
export function demandAt(minutes) {
  const h = ((minutes%1440)+1440)%1440/60;
  return .16 + .87*gaussian(h,8.5,1.25)+1.0*gaussian(h,17.75,1.6)+.28*gaussian(h,12.5,2.6);
}
export function roadTraffic(road, minutes, multiplier=1) {
  const demand = demandAt(minutes) * multiplier;
  const vulnerability = .68+hash(road.osmId)*.72 + (road.bridge ? .28:0) + (road.junction ? .21:0) + (road.kind.endsWith('_link') ? .28:0);
  const ratio = Math.max(.03, demand*vulnerability);
  const freeSpeed = road.freeSpeed;
  // BPR volume-delay relationship, with a signal delay for surface roads.
  const speed = Math.max(4, freeSpeed / (1+.22*ratio**4) - (road.signal && demand>.5 ? 4*demand:0));
  const congestion = Math.min(1,1-speed/freeSpeed);
  const color = congestion>.67 ? COLORS.jam : congestion>.43 ? COLORS.heavy : congestion>.22 ? COLORS.moderate : COLORS.free;
  const flow = Math.round(Math.min(ratio,1.12)*road.capacity * Math.max(.23,1-congestion*.55));
  return { speed, congestion, color, ratio, flow, delay: Math.max(0,road.length*10/1000*(1/speed-1/freeSpeed)*3600) };
}

export function buildNetwork(snapshot, city) {
  const ways = snapshot.elements.filter(e=>e.type==='way' && e.tags?.highway && e.geometry?.length>1);
  const occurrences = new Map();
  for (const way of ways) for (const n of new Set(way.nodes)) occurrences.set(n,(occurrences.get(n)||0)+1);
  const signals = new Set(snapshot.elements.filter(e=>e.type==='node' && e.tags?.highway==='traffic_signals').map(e=>e.id));
  const roads = [];
  for (const way of ways) {
    const tags=way.tags, kind=tags.highway;
    const elevated=Number(tags.layer||0)>0 || tags.bridge==='yes' || tags.bridge==='viaduct';
    const motorway=/motorway|trunk/.test(kind);
    // OSM trunk roads may be two-way; only motorways and roundabouts imply one-way.
    const explicitTwoWay=['no','0','false'].includes(tags.oneway);
    const oneway=['yes','true','1','-1'].includes(tags.oneway)||(!explicitTwoWay&&(kind==='motorway'||tags.junction==='roundabout'));
    const major=motorway || /primary|secondary/.test(kind);
    const speedText=tags.maxspeed || '';
    const parsed=parseFloat(speedText);
    const freeSpeed = Number.isFinite(parsed) ? Math.max(15,Math.min(110,parsed*(speedText.includes('mph')?1.609:1))) : motorway?75:major?50:30;
    const lanes=Math.max(1,Math.min(6,parseInt(tags.lanes)|| (major?3:2)));
    let start=0;
    for (let i=1;i<way.geometry.length;i++) {
      if (i!==way.geometry.length-1 && (occurrences.get(way.nodes[i])||0)<2 && !signals.has(way.nodes[i])) continue;
      const points=way.geometry.slice(start,i+1).map(g=>project([g.lon,g.lat],city.center));
      const lengths=[0];
      for (let j=1;j<points.length;j++) lengths.push(lengths.at(-1)+Math.hypot(points[j][0]-points[j-1][0],points[j][1]-points[j-1][1]));
      const length=lengths.at(-1);
      if (length>.1) roads.push({ id: roads.length, osmId:way.id, named:!!(tags.name||tags['name:zh']||tags.ref), name:tags['name:zh']||tags.name||tags.ref||({residential:'未命名街区支路',motorway_link:'未命名快速路匝道',trunk_link:'未命名快速路匝道',primary_link:'未命名主干道连接线'}[kind]||'未命名城市道路'), kind, points, lengths, length, start:way.nodes[start], end:way.nodes[i], bridge:!!tags.bridge && tags.bridge!=='no', elevated, layer:elevated?Math.max(1,Number(tags.layer)||1):0, motorway, major, lanes, freeSpeed, capacity:lanes*(motorway?1800:major?1050:650), oneway, reverse:tags.oneway==='-1', signal:signals.has(way.nodes[i])||signals.has(way.nodes[start]), junction:tags.junction==='roundabout', width:motorway?1.7:major?1.2:.65 });
      start=i;
    }
  }
  const adjacency=new Map();
  for(const r of roads){
    if(!r.reverse){ if(!adjacency.has(r.start))adjacency.set(r.start,[]); adjacency.get(r.start).push({road:r,direction:1}); }
    if(!r.oneway || r.reverse){ if(!adjacency.has(r.end))adjacency.set(r.end,[]); adjacency.get(r.end).push({road:r,direction:-1}); }
  }
  return { roads, adjacency, signalCount: signals.size, snapshot };
}

export function pointOnRoad(road, progress, direction=1, driveLeft=false) {
  const d=Math.max(0,Math.min(road.length,progress*road.length));
  let low=1,high=road.lengths.length-1;
  while(low<high){const mid=(low+high)>>1;if(road.lengths[mid]<d)low=mid+1;else high=mid;}
  const idx=low,a=road.points[idx-1],b=road.points[idx];
  const t=(d-road.lengths[idx-1])/(road.lengths[idx]-road.lengths[idx-1]||1);
  const angle=Math.atan2(b[0]-a[0],b[1]-a[1]);
  const offset=road.width*.24*direction*(driveLeft?-1:1);
  // Smooth approach ramps avoid vertical jumps at bridge and flyover entrances.
  const y=road.elevated ? .25+road.layer*1.65*Math.min(1,progress*7,(1-progress)*7) : .18;
  return { x:a[0]+(b[0]-a[0])*t + Math.cos(angle)*offset, z:a[1]+(b[1]-a[1])*t-Math.sin(angle)*offset, y, angle:angle+(direction<0?Math.PI:0) };
}

export class Simulation {
  constructor(network, minutes=480) { this.network=network;this.minutes=minutes;this.multiplier=1;this.vehicles=[];this.clock=0;this.stats=[];this.updateTraffic(); }
  updateTraffic() {
    this.stats=this.network.roads.map(r=>roadTraffic(r,this.minutes,this.multiplier));
    const target=Math.min(2200,Math.max(180,Math.round(this.network.roads.reduce((sum,r)=>sum+r.length,0)*.028*(.3+demandAt(this.minutes)*this.multiplier))));
    while(this.vehicles.length<target){
      const i=this.vehicles.length, r=this.network.roads[Math.floor(hash(i*13+7)*this.network.roads.length)];
      this.vehicles.push({road:r,progress:hash(i*17+1),direction:r.oneway?(r.reverse?-1:1):(hash(i*23)>.5?1:-1),seed:hash(i*37+2),waiting:false});
    }
    this.vehicles.length=Math.min(this.vehicles.length,target);
  }
  setTime(minutes) { this.minutes=((minutes%1440)+1440)%1440;this.updateTraffic(); }
  setDemand(multiplier) { this.multiplier=multiplier;this.updateTraffic(); }
  tick(dt) {
    this.clock+=dt;
    // Lane leaders are evaluated in travel order; maintain 6 m headway.
    const lanes=new Map();
    for(const v of this.vehicles){const key=v.road.id+':'+v.direction;if(!lanes.has(key))lanes.set(key,[]);lanes.get(key).push(v);}
    for(const list of lanes.values()){
      list.sort((a,b)=>(b.progress-a.progress)*a.direction);
      let leader=null;
      for(const v of list){
        const r=v.road, s=this.stats[r.id];
        let next=v.progress+v.direction*(s.speed/36)*dt*(.85+v.seed*.3)/r.length;
        const red=r.signal && (this.clock+hash(r.osmId)*70)%70>38;
        v.waiting=false;
        if(red && (v.direction>0?next>.96:next<.04)){next=v.direction>0?Math.min(.96,next):Math.max(.04,next);v.waiting=true;}
        if(leader){const gap=.6/r.length;if(v.direction>0)next=Math.min(next,Math.max(v.progress,leader.progress-gap));else next=Math.max(next,Math.min(v.progress,leader.progress+gap));}
        v.progress=next;leader=v;
      }
    }
    for(const v of this.vehicles) if(v.progress>1 || v.progress<0){
      const endpoint=v.direction>0?v.road.end:v.road.start;
      const options=this.network.adjacency.get(endpoint)||[];
      const onward=options.filter(o=>o.road.id!==v.road.id);
      const choices=onward.length?onward:options;
      if(choices.length){const choice=choices[Math.floor(hash(v.seed*999+this.clock)*choices.length)];v.road=choice.road;v.direction=choice.direction;v.progress=v.direction>0?0:1;}
      else {v.progress=v.direction>0?0:1;}
    }
  }
  metrics(){
    const roads=this.network.roads,totalLength=roads.reduce((n,r)=>n+r.length,0)||1;
    const speed=roads.reduce((n,r)=>n+this.stats[r.id].speed*r.length,0)/totalLength;
    const congestion=roads.reduce((n,r)=>n+this.stats[r.id].congestion*r.length,0)/totalLength;
    const freeLength=roads.reduce((n,r)=>n+(this.stats[r.id].congestion<.22?r.length:0),0);
    const counts=[0,0,0,0];for(const s of this.stats) counts[s.congestion>.67?3:s.congestion>.43?2:s.congestion>.22?1:0]++;
    const grouped=new Map();for(const r of roads){if(r.length<3||!r.named)continue;const prev=grouped.get(r.name);const s=this.stats[r.id];if(!prev || s.congestion>prev.traffic.congestion)grouped.set(r.name,{road:r,traffic:s});}
    const bottlenecks=[...grouped.values()].sort((a,b)=>b.traffic.congestion-a.traffic.congestion).slice(0,5);
    const major=roads.filter(r=>r.major);
    const throughput=Math.round(major.reduce((n,r)=>n+this.stats[r.id].flow,0)/Math.max(1,major.length)*4);
    return { speed, congestion, freePercent:freeLength/totalLength*100, counts, bottlenecks, throughput, vehicles:this.vehicles.length, length:totalLength/100, roadCount:roads.length };
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CITIES, localMinutes, formatTime, project } from '../src/cities.js';
import { demandAt, roadTraffic, buildNetwork, Simulation, pointOnRoad } from '../src/simulation.js';

const mock={elements:[
 {type:'way',id:1,nodes:[1,2,3],tags:{highway:'primary',name:'主路',oneway:'yes'},geometry:[{lon:0,lat:0},{lon:.001,lat:0},{lon:.002,lat:0}]},
 {type:'way',id:2,nodes:[2,4],tags:{highway:'residential',name:'支路',oneway:'-1'},geometry:[{lon:.001,lat:0},{lon:.001,lat:.001}]},
 {type:'node',id:2,tags:{highway:'traffic_signals'},lon:.001,lat:0},
]};
const city={center:[0,0]};

test('当地时间跨时区与午夜，格式化循环时间',()=>{
 const date=new Date('2026-10-20T17:30:00Z');
 assert.equal(localMinutes(CITIES.shanghai,date),90);
 assert.equal(localMinutes(CITIES.tokyo,date),150);
 assert.equal(localMinutes(CITIES.newyork,date),810);
 assert.equal(formatTime(1441),'00:01');assert.equal(formatTime(-1),'23:59');
 assert.deepEqual(project(city.center,city.center),[0,-0]);
});
test('早晚高峰需求高于凌晨，24 小时周期一致',()=>{
 assert.ok(demandAt(510)>demandAt(180)*3);
 assert.ok(demandAt(1065)>demandAt(780));
 assert.equal(demandAt(510),demandAt(510+1440));
});
test('真实交叉口拆分路段，保留单行与反向单行约束',()=>{
 const n=buildNetwork(mock,city);assert.equal(n.roads.length,3);
 assert.equal(n.signalCount,1);assert.ok(n.roads[0].signal);
 assert.deepEqual(n.adjacency.get(1).map(o=>o.direction),[1]);
 assert.ok(!n.adjacency.has(3));
 assert.equal(n.adjacency.get(4)[0].direction,-1);
 assert.ok(n.adjacency.get(2).every(o=>o.road.osmId!==2));
});
test('BPR 模型响应时间和需求，速度及拥堵保持物理范围',()=>{
 const n=buildNetwork(mock,city),r=n.roads[0];
 const night=roadTraffic(r,180),peak=roadTraffic(r,1065),high=roadTraffic(r,1065,1.8);
 assert.ok(night.speed>peak.speed);assert.ok(peak.speed>=high.speed);
 assert.ok(high.congestion>=peak.congestion);assert.ok(high.speed>=4 && high.speed<=r.freeSpeed);
 assert.ok(high.flow>=0&&high.delay>=0);
});
test('车辆沿折线路径插值，桥梁两端平滑连接地面',()=>{
 const r=buildNetwork(mock,city).roads[0];
 const a=pointOnRoad(r,0),b=pointOnRoad(r,1),mid=pointOnRoad(r,.5);
 assert.ok(Math.abs(mid.x-(a.x+b.x)/2)<1e-8);
 const bridge={...r,elevated:true,layer:2};
 assert.equal(pointOnRoad(bridge,0).y,.25);assert.ok(pointOnRoad(bridge,.5).y>pointOnRoad(bridge,0).y);
 assert.equal(pointOnRoad(bridge,1).y,.25);
});
test('仿真车辆在合法路段内行驶，统计与车辆数一致',()=>{
 const n=buildNetwork(mock,city),sim=new Simulation(n,510);
 for(let i=0;i<200;i++)sim.tick(.1);
 assert.ok(sim.vehicles.every(v=>n.roads.includes(v.road)&&v.progress>=0&&v.progress<=1));
 const m=sim.metrics();assert.equal(m.vehicles,sim.vehicles.length);assert.equal(m.counts.reduce((a,b)=>a+b),n.roads.length);
 assert.ok(Number.isFinite(m.speed)&&m.speed>0);assert.ok(m.congestion>=0&&m.congestion<=1);
 sim.setTime(1065);sim.setDemand(1.8);assert.ok(sim.metrics().speed<m.speed);
});

for(const [id,c] of Object.entries(CITIES))test(`${c.name} 快照为可用的真实 OSM 路网，高峰指标一致`,()=>{
 const snapshot=JSON.parse(readFileSync(new URL(`../public/data/${id}.json`,import.meta.url),'utf8'));
 assert.equal(snapshot.source,'OpenStreetMap');assert.equal(snapshot.license,'ODbL-1.0');
 const n=buildNetwork(snapshot,c);assert.ok(n.roads.length>100);assert.ok(n.signalCount>0);assert.ok(n.roads.some(r=>r.elevated));assert.ok(n.roads.some(r=>r.bridge));
 assert.ok(n.roads.every(r=>r.length>0&&Number.isFinite(r.length)&&r.points.length>=2));
 const sim=new Simulation(n,180),night=sim.metrics();sim.setTime(1065);const peak=sim.metrics();
 assert.ok(peak.speed<night.speed);assert.ok(peak.congestion>night.congestion);assert.ok(peak.vehicles>=night.vehicles);
 assert.ok(peak.bottlenecks.length===5);assert.ok(n.adjacency.size>100);
});

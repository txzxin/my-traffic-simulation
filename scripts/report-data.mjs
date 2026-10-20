import { readFileSync } from 'node:fs';
import { CITIES } from '../src/cities.js';
import { buildNetwork } from '../src/simulation.js';

const rows=Object.entries(CITIES).map(([id,city])=>{
  const data=JSON.parse(readFileSync(new URL(`../public/data/${id}.json`,import.meta.url),'utf8'));
  const n=buildNetwork(data,city);
  return { 城市:city.name, 路段:n.roads.length, '路长 km':Math.round(n.roads.reduce((sum,r)=>sum+r.length,0)/100), 信号节点:n.signalCount, 桥梁高架路段:n.roads.filter(r=>r.elevated).length, 建筑轮廓:data.elements.filter(e=>e.tags.building).length, 'OSM 数据时间':data.timestamp };
});
console.table(rows);

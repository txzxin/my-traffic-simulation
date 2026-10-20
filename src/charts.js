import { demandAt } from './simulation.js';
import { formatTime } from './cities.js';

export function trendChart(minutes,multiplier=1,large=false){
  const w=large?900:300,h=large?190:106,left=large?40:8,right=12,top=12,bottom=22;
  const samples=Array.from({length:97},(_,i)=>({x:left+i/96*(w-left-right),y:top+(1-Math.min(1,demandAt(i*15)*multiplier/1.5))*(h-top-bottom)}));
  const line=samples.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const x=left+minutes/1440*(w-left-right),y=top+(1-Math.min(1,demandAt(minutes)*multiplier/1.5))*(h-top-bottom);
  const id=large?'trend-large':'trend-small';
  return `<svg class="trend-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="24 小时交通需求曲线，早高峰 08:30，晚高峰 17:45">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#a8dcb5" stop-opacity=".23"/><stop offset="1" stop-color="#a8dcb5" stop-opacity="0"/></linearGradient></defs>
  ${[.25,.5,.75].map(v=>`<line x1="${left}" x2="${w-right}" y1="${top+v*(h-top-bottom)}" y2="${top+v*(h-top-bottom)}" stroke="#2a363a" stroke-dasharray="3 4"/>`).join('')}
  <rect x="${left+7/24*(w-left-right)}" y="${top}" width="${3/24*(w-left-right)}" height="${h-top-bottom}" fill="#d9bc69" opacity=".035"/>
  <rect x="${left+16/24*(w-left-right)}" y="${top}" width="${4/24*(w-left-right)}" height="${h-top-bottom}" fill="#d9bc69" opacity=".035"/>
  <path d="${line} L${w-right},${h-bottom} L${left},${h-bottom} Z" fill="url(#${id})"/>
  <path d="${line}" fill="none" stroke="#a7dab4" stroke-width="1.7"/>
  <line x1="${x}" x2="${x}" y1="${top}" y2="${h-bottom}" stroke="#cadbd0" stroke-dasharray="3 3" opacity=".6"/>
  <circle cx="${x}" cy="${y}" r="3.3" fill="#c6efd0" stroke="#152522" stroke-width="2"/>
  ${[0,6,12,18,24].map(v=>`<text x="${left+v/24*(w-left-right)}" y="${h-3}" text-anchor="${v===0?'start':v===24?'end':'middle'}" fill="#75868b" font-size="${large?11:9}">${String(v).padStart(2,'0')}:00</text>`).join('')}
  </svg>`;
}
export function sparkline(values,color='#a6dcb5'){
  const max=Math.max(...values),min=Math.min(...values);const points=values.map((v,i)=>`${i*64/(values.length-1)},${22-(v-min)/(max-min||1)*18}`).join(' ');
  return `<svg viewBox="0 0 64 26" class="sparkline" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;
}
export function congestionDonut(counts){
  const total=counts.reduce((a,b)=>a+b,0)||1,colors=['#83d8b0','#d9bc69','#e79063','#e36673'];let offset=0;
  return `<svg class="donut" viewBox="0 0 116 116" role="img" aria-label="路段通行状态分布"><circle cx="58" cy="58" r="44" fill="none" stroke="#283538" stroke-width="9"/>${counts.map((n,i)=>{const len=n/total*276.46,svg=`<circle cx="58" cy="58" r="44" fill="none" stroke="${colors[i]}" stroke-width="9" stroke-dasharray="${Math.max(0,len-2)} ${276.46-Math.max(0,len-2)}" stroke-dashoffset="${-offset}" transform="rotate(-90 58 58)"/>`;offset+=len;return svg}).join('')}<text x="58" y="55" text-anchor="middle" fill="#ecf2ed" font-size="23" font-weight="500">${Math.round(counts[0]/total*100)}<tspan font-size="11">%</tspan></text><text x="58" y="73" text-anchor="middle" fill="#8a999c" font-size="10">畅通路段</text></svg>`;
}
export function barChart(roads,stats){
  const groups=[['motorway','快速路'],['primary','主干道'],['secondary','次干道'],['other','支路']];
  return groups.map(([key,name])=>{const rs=roads.filter(r=>key==='other'?!/motorway|trunk|primary|secondary/.test(r.kind):key==='motorway'?/motorway|trunk/.test(r.kind):r.kind.startsWith(key));const speed=rs.reduce((n,r)=>n+stats[r.id].speed,0)/(rs.length||1);return `<div class="road-bar"><span>${name}</span><div><i style="width:${Math.min(100,speed/80*100)}%"></i></div><b>${speed.toFixed(0)} <small>km/h</small></b></div>`;}).join('');
}

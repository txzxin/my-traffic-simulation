import { readFile, writeFile } from 'node:fs/promises';
const keep = new Set(['highway','name','name:zh','name:en','ref','maxspeed','lanes','oneway','bridge','layer','junction','building','height','building:levels','natural','waterway','landuse','leisure']);
export function compact(snapshot){
  return {...snapshot,elements:snapshot.elements.map(e=>({type:e.type,id:e.id,...(e.tags?.highway && e.nodes ? {nodes:e.nodes}:{}),...(e.geometry?{geometry:e.geometry.map(p=>({lat:+p.lat.toFixed(6),lon:+p.lon.toFixed(6)}))}:{}),...(e.lat?{lat:e.lat,lon:e.lon}:{}),tags:Object.fromEntries(Object.entries(e.tags||{}).filter(([k])=>keep.has(k)))}))};
}
if (process.argv[1]?.endsWith('compact-osm.mjs')) for(const id of ['shanghai','newyork','london','tokyo']){
  const path=new URL(`../public/data/${id}.json`,import.meta.url);const text=await readFile(path,'utf8');const result=JSON.stringify(compact(JSON.parse(text)));await writeFile(path,result);console.log(`${id}: ${(text.length/1e6).toFixed(1)} MB → ${(result.length/1e6).toFixed(1)} MB`);
}

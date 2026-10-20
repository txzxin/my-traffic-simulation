import { writeFile, mkdir } from 'node:fs/promises';
import { compact } from './compact-osm.mjs';

// OpenStreetMap data, ODbL 1.0. Preserve node IDs, layers and original coordinates.
export const areas = [
  { id: 'shanghai', name: '上海', center: [121.493, 31.237], bbox: [31.217,121.465,31.257,121.521] },
  { id: 'newyork', name: '纽约', center: [-74.002,40.713], bbox: [40.693,-74.030,40.733,-73.974] },
  { id: 'london', name: '伦敦', center: [-0.095,51.508], bbox: [51.488,-0.123,51.528,-0.067] },
  { id: 'tokyo', name: '东京', center: [139.770,35.682], bbox: [35.667,139.749,35.697,139.791] },
];
await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
for (const city of areas) {
  if (process.argv[2] && process.argv[2] !== city.id) continue;
  let result;
  const query = `[out:json][timeout:120];(way[highway~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street)$"](${city.bbox});way[building](${city.bbox});way[natural=water](${city.bbox});way[waterway=riverbank](${city.bbox});way[landuse~"^(grass|forest|recreation_ground)$"](${city.bbox});way[leisure=park](${city.bbox});node[highway=traffic_signals](${city.bbox}););out body geom;`;
  for (const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter']) {
    try {
      console.log(`Downloading ${city.id} from ${endpoint}`);
      const response = await fetch(`${endpoint}?${new URLSearchParams({ data: query })}`, { headers: { 'User-Agent': 'UrbanflowTrafficSimulation/1.0 (educational OSM visualization)' }, signal: AbortSignal.timeout(180000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.elements?.length) throw new Error(data.remark || 'Empty response');
      result = { ...city, source: 'OpenStreetMap', license: 'ODbL-1.0', fetchedAt: new Date().toISOString(), timestamp: data.osm3s?.timestamp_osm_base, elements: data.elements };
      break;
    } catch (error) { console.warn(error.message); }
  }
  if (!result) throw new Error(`Could not download ${city.id}. Existing snapshot retained.`);
  await writeFile(new URL(`../public/data/${city.id}.json`, import.meta.url), JSON.stringify(compact(result)));
  console.log(`${city.id}: ${result.elements.length} OSM elements saved.`);
}

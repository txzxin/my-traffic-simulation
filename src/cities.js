export const CITIES = {
  shanghai: {
    name: '上海', en: 'SHANGHAI', country: '中国', timezone: 'Asia/Shanghai', center: [121.493,31.237],
    subtitle: '黄浦江 · 陆家嘴 · 外滩', coordinates: '31.2370° N, 121.4930° E', driveLeft: false,
    landmarks: [
      { name: '东方明珠', coord: [121.4998,31.2397], height: 46, type: 'pearl' },
      { name: '上海中心', coord: [121.5054,31.2336], height: 63, type: 'tower' },
      { name: '环球金融中心', coord: [121.5079,31.2347], height: 49, type: 'tower' },
      { name: '外滩', coord: [121.4905,31.238], height: 7 },
      { name: '人民广场', coord: [121.475,31.231], height: 2 },
    ],
    water: [[[121.510,31.263],[121.498,31.250],[121.491,31.242],[121.490,31.234],[121.498,31.225],[121.512,31.216],[121.520,31.209]]], waterWidth: 36,
    waterLabel: { name: '黄 浦 江', coord: [121.494,31.228] },
  },
  newyork: {
    name: '纽约', en: 'NEW YORK', country: '美国', timezone: 'America/New_York', center: [-74.002,40.713],
    subtitle: '曼哈顿下城 · 布鲁克林大桥', coordinates: '40.7130° N, 74.0020° W', driveLeft: false,
    landmarks: [
      { name: '世贸中心一号楼', coord: [-74.0134,40.7127], height: 54, type: 'tower' },
      { name: '布鲁克林大桥', coord: [-73.9969,40.7061], height: 8 },
      { name: '曼哈顿大桥', coord: [-73.990,40.7085], height: 8 },
      { name: '纽约市政厅', coord: [-74.006,40.7128], height: 10 },
    ],
    water: [[[-73.973,40.738],[-73.975,40.725],[-73.978,40.716],[-73.988,40.706],[-73.999,40.699],[-74.013,40.692]], [[-74.018,40.741],[-74.023,40.723],[-74.025,40.709],[-74.022,40.696],[-74.013,40.688]]], waterWidth: 60,
    waterLabel: { name: 'E A S T  R I V E R', coord: [-73.983,40.712] },
  },
  london: {
    name: '伦敦', en: 'LONDON', country: '英国', timezone: 'Europe/London', center: [-0.095,51.508],
    subtitle: '伦敦金融城 · 泰晤士河', coordinates: '51.5080° N, 0.0950° W', driveLeft: true,
    landmarks: [
      { name: '碎片大厦', coord: [-0.0865,51.5045], height: 31, type: 'tower' },
      { name: '圣保罗大教堂', coord: [-0.0984,51.5138], height: 11, type: 'dome' },
      { name: '塔桥', coord: [-0.0754,51.5055], height: 8 },
      { name: '伦敦桥', coord: [-0.0877,51.5079], height: 5 },
    ],
    water: [[[-0.134,51.484],[-0.123,51.495],[-0.120,51.507],[-0.110,51.509],[-0.099,51.509],[-0.087,51.508],[-0.077,51.505],[-0.065,51.503],[-0.055,51.504]]], waterWidth: 24,
    waterLabel: { name: 'T H A M E S', coord: [-0.100,51.509] },
  },
  tokyo: {
    name: '东京', en: 'TOKYO', country: '日本', timezone: 'Asia/Tokyo', center: [139.770,35.682],
    subtitle: '东京站 · 日本桥 · 首都高速', coordinates: '35.6820° N, 139.7700° E', driveLeft: true,
    landmarks: [
      { name: '东京站', coord: [139.7671,35.6812], height: 5 },
      { name: '日本桥', coord: [139.7745,35.6841], height: 4 },
      { name: '皇居', coord: [139.7528,35.6852], height: 3 },
      { name: '东京中城八重洲', coord: [139.7695,35.678], height: 24, type: 'tower' },
    ],
    water: [[[139.790,35.710],[139.789,35.699],[139.790,35.690],[139.792,35.682],[139.789,35.673],[139.783,35.663],[139.785,35.652]]], waterWidth: 26,
    waterLabel: { name: '隅 田 川', coord: [139.792,35.682] },
  },
};

export function localMinutes(city, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: city.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
}
export function formatTime(minutes) {
  const m = Math.floor(((minutes % 1440) + 1440) % 1440);
  return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
}
export function project(coord, center) {
  return [(coord[0]-center[0]) * 111320 * Math.cos(center[1]*Math.PI/180) / 10, -(coord[1]-center[1]) * 111320 / 10];
}

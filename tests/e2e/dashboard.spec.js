import { test, expect } from '@playwright/test';

async function ready(page){
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#map-road-count')).not.toHaveText('—');
}

test('四个城市的真实路网均可切换，数据与三维场景同步',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);await page.getByRole('button',{name:'暂停仿真'}).click();
  for(const [id,name,en] of [['shanghai','上海','SHANGHAI'],['newyork','纽约','NEW YORK'],['london','伦敦','LONDON'],['tokyo','东京','TOKYO']]){
    await page.getByLabel('选择仿真城市').selectOption(id);
    await expect(page.locator('#city-en')).toHaveText(en);await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#map-city')).toHaveText(name);
    const data=await page.evaluate(()=>{const a=window.__URBANFLOW__;return {id:a.network.snapshot.id,roads:a.network.roads.length,geometries:a.scene.renderer.info.memory.geometries,vehicles:a.simulation.metrics().vehicles,valid:a.simulation.vehicles.every(v=>a.network.roads.includes(v.road)),sceneCity:a.scene.city.en};});
    expect(data.id).toBe(id);expect(data.roads).toBeGreaterThan(100);expect(data.geometries).toBeGreaterThan(1);expect(data.vehicles).toBeGreaterThan(0);expect(data.valid).toBe(true);expect(data.sceneCity).toBe(en);
    await page.screenshot({path:`test-results/${id}-desktop.png`});
  }
  expect(errors).toEqual([]);
});

test('高峰、午夜、车流需求、暂停与当地时间同步均生效',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'暂停仿真'}).click();
  const time=page.getByRole('slider',{name:'仿真时间（分钟）'});await time.focus();await time.press('Home');
  await expect(page.locator('#current-time')).toHaveText('00:00');const nightSpeed=Number(await page.locator('#average-speed').textContent());
  await page.getByRole('button',{name:'晚高峰',exact:true}).click();await expect(page.locator('#current-time')).toHaveText('17:45');
  const peakSpeed=Number(await page.locator('#average-speed').textContent());expect(peakSpeed).toBeLessThan(nightSpeed);await expect(page.locator('.hotspot-label').first()).toBeVisible();
  await page.screenshot({path:'test-results/hero.png'});
  const demand=page.getByRole('slider',{name:'车流需求强度'});await demand.focus();await demand.press('End');await expect(page.locator('#demand-value')).toHaveText('180%');expect(Number(await page.locator('#average-speed').textContent())).toBeLessThan(peakSpeed);
  const before=await page.evaluate(()=>({minutes:window.__URBANFLOW__.state.minutes,clock:window.__URBANFLOW__.simulation.clock}));
  await expect.poll(async()=>page.evaluate(()=>window.__URBANFLOW__.scene.frame)).toBeGreaterThan(100);
  const after=await page.evaluate(()=>({minutes:window.__URBANFLOW__.state.minutes,clock:window.__URBANFLOW__.simulation.clock}));expect(after).toEqual(before);
  await time.focus();await time.press('End');await expect(page.locator('#current-time')).toHaveText('23:59');
  await page.getByRole('button',{name:'实时同步',exact:true}).click();await expect(page.locator('#time-mode')).toHaveText('城市当地时间');await expect(page.getByRole('button',{name:'暂停仿真'})).toBeVisible();
});

test('图层、2D/3D、相机缩放及瓶颈定位可操作',async({page})=>{
  await ready(page);
  for(const [label,key] of [['三维建筑','buildings'],['交通流热力','traffic'],['桥梁与高架','elevated'],['信号交叉口','signals']]){
    const checkbox=page.getByRole('checkbox',{name:label});await checkbox.uncheck();
    expect(await page.evaluate(k=>window.__URBANFLOW__.scene.layerState[k],key)).toBe(false);await checkbox.check();
  }
  await page.getByRole('button',{name:'2D',exact:true}).click();
  // OrbitControls keeps a small tilt away from its singular north pole.
  expect(await page.evaluate(()=>window.__URBANFLOW__.scene.controls.getPolarAngle())).toBeLessThan(.06);
  await page.getByRole('button',{name:'3D',exact:true}).click();
  const before=await page.evaluate(()=>window.__URBANFLOW__.scene.camera.position.distanceTo(window.__URBANFLOW__.scene.controls.target));
  await page.getByRole('button',{name:'放大地图'}).click();
  expect(await page.evaluate(()=>window.__URBANFLOW__.scene.camera.position.distanceTo(window.__URBANFLOW__.scene.controls.target))).toBeLessThan(before);
  await page.locator('.bottleneck-row').first().click();await expect(page.locator('#road-popup')).toBeVisible();await expect(page.locator('#road-popup h3')).not.toBeEmpty();
  await page.getByRole('button',{name:'关闭路段详情'}).click();await expect(page.locator('#road-popup')).toBeHidden();
  await page.getByRole('button',{name:'重置仿真参数'}).click();await expect(page.locator('#demand-value')).toHaveText('100%');
});

test('交通分析、瓶颈诊断、数据来源说明与报告导出完整',async({page})=>{
  await ready(page);await page.getByRole('button',{name:'交通分析',exact:true}).click();await expect(page.getByRole('heading',{name:'上海 · 交通分析'})).toBeVisible();await expect(page.locator('.analysis-summary>div')).toHaveCount(4);
  await page.getByRole('button',{name:'关闭对话框'}).click();await page.getByRole('button',{name:'瓶颈诊断',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.locator('[data-locate]').first().click();await expect(page.locator('#dialog')).not.toBeVisible();await expect(page.locator('#road-popup')).toBeVisible();
  await page.getByRole('button',{name:'数据来源与仿真说明'}).click();await expect(page.locator('#dialog-content')).toContainText('未接入实时交通传感器');await page.keyboard.press('Escape');
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'导出仿真报告'}).click();const download=await downloading;
  expect(download.suggestedFilename()).toMatch(/^URBANFLOW_shanghai_\d{4}\.csv$/);await download.saveAs('test-results/report.csv');
});

test('移动端布局无横向溢出，地图和控件保持可用',async({page})=>{
  await page.setViewportSize({width:390,height:844});await ready(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('#city-map')).toBeVisible();
  await page.getByRole('button',{name:'早高峰',exact:true}).click();
  await page.getByLabel('选择仿真城市').selectOption('london');await expect(page.locator('#city-en')).toHaveText('LONDON');await expect(page.locator('#loading')).toBeHidden();
  await page.screenshot({path:'test-results/mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('路网请求失败时显示可恢复的错误状态',async({page})=>{
  await page.route('**/data/shanghai.json',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.goto('/');await expect(page.locator('#loading')).toContainText('城市路网加载失败');await expect(page.getByRole('button',{name:'重新加载'})).toBeVisible();
  await page.getByLabel('选择仿真城市').selectOption('tokyo');await expect(page.locator('#city-en')).toHaveText('TOKYO');await expect(page.locator('#loading')).toBeHidden();
});

test('不支持 WebGL 时保留明确的恢复说明',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;return original.call(this,type,...args)};});
  await page.goto('/');await expect(page.locator('#loading')).toContainText('三维引擎未能启动');await expect(page.locator('#loading')).toContainText('硬件加速');
});

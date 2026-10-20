import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { project } from './cities.js';
import { hash, pointOnRoad } from './simulation.js';

const color=new THREE.Color(), dummy=new THREE.Object3D();
export class CityScene {
  constructor(container, onSelect){
    this.container=container;this.onSelect=onSelect;this.layerState={buildings:true,traffic:true,signals:true,elevated:true};
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#111e22');this.scene.fog=new THREE.FogExp2('#111e22',.00115);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.container.prepend(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','可旋转、缩放和点击道路的三维城市交通地图');this.renderer.domElement.setAttribute('role','img');
    this.camera=new THREE.PerspectiveCamera(43,1,.5,2400);this.camera.position.set(270,320,390);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.07;this.controls.minDistance=35;this.controls.maxDistance=950;this.controls.maxPolarAngle=Math.PI*.47;this.controls.minPolarAngle=.05;this.controls.target.set(0,0,0);
    this.scene.add(new THREE.AmbientLight('#98c5c9',1.2));
    const light=new THREE.DirectionalLight('#c8e3dd',2.8);light.position.set(-150,300,100);this.scene.add(light);
    const rim=new THREE.DirectionalLight('#598d9a',1.4);rim.position.set(200,100,-200);this.scene.add(rim);
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(1800,1800),new THREE.MeshStandardMaterial({color:'#17272a',roughness:1}));plane.rotation.x=-Math.PI/2;plane.position.y=-.13;this.scene.add(plane);
    const grid=new THREE.GridHelper(1500,100,'#254044','#203438');grid.position.y=-.1;grid.material.transparent=true;grid.material.opacity=.35;this.scene.add(grid);
    this.root=new THREE.Group();this.scene.add(this.root);this.labels=[];this.frame=0;this.destroyed=false;
    this.pointerDown=null;
    this.renderer.domElement.addEventListener('pointerdown',e=>{this.pointerDown=[e.clientX,e.clientY]});
    this.renderer.domElement.addEventListener('pointerup',e=>{if(this.pointerDown && Math.hypot(e.clientX-this.pointerDown[0],e.clientY-this.pointerDown[1])<5)this.pick(e);});
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
  }
  resize(){const {width,height}=this.container.getBoundingClientRect();this.renderer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  clear(){
    while(this.root.children.length){const child=this.root.children[0];child.traverse(obj=>{if(obj.isInstancedMesh)obj.dispose();obj.geometry?.dispose();if(Array.isArray(obj.material))obj.material.forEach(m=>m.dispose());else obj.material?.dispose();});this.root.remove(child);}
    this.labels.forEach(l=>l.element.remove());this.labels=[];this.roadGeometry=null;this.selectedRoad=null;this.flyFrames=0;
  }
  load(network,city,simulation){
    this.clear();this.network=network;this.city=city;this.sim=simulation;this.roadOffsets=[];this.buildings=new THREE.Group();this.elevated=new THREE.Group();this.signals=new THREE.Group();this.root.add(this.buildings,this.elevated,this.signals);
    this.addWater(city);this.addBuildings(network.snapshot,city);this.addRoads();this.addLandmarks(city);this.addSignals();
    this.cars=new THREE.InstancedMesh(new THREE.BoxGeometry(.31,.20,.67),new THREE.MeshBasicMaterial({color:'#e0f5d7'}),2500);this.cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.cars.frustumCulled=false;this.root.add(this.cars);
    for(let i=0;i<2500;i++)this.cars.setColorAt(i,new THREE.Color(i%7===0?'#efb987':i%5===0?'#82c9dd':'#c9e7cd'));
    this.cars.instanceColor.needsUpdate=true;this.updateTraffic();this.applyLayers();this.reset();
  }
  addWater(city){
    for(const path of city.water){
      const pts=path.map(p=>{const [x,z]=project(p,city.center);return new THREE.Vector3(x,.02,z)});
      const curve=new THREE.CatmullRomCurve3(pts);const verts=[], cols=[];
      const samples=curve.getPoints(160);
      for(let i=0;i<samples.length-1;i++){
        const a=samples[i],b=samples[i+1],n=new THREE.Vector3().subVectors(b,a).normalize();const dx=n.z*city.waterWidth/2,dz=-n.x*city.waterWidth/2;
        const p=[[a.x+dx,.015,a.z+dz],[a.x-dx,.015,a.z-dz],[b.x+dx,.015,b.z+dz],[b.x-dx,.015,b.z-dz]];
        for(const idx of [0,1,2,2,1,3])verts.push(...p[idx]);
        if(i%4===0){const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x+dx*.8,.035,a.z+dz*.8),new THREE.Vector3(a.x-dx*.8,.035,a.z-dz*.8)]);this.root.add(new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#2b4c52',transparent:true,opacity:.25})));}
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#12323e',roughness:.3,metalness:.4,side:THREE.DoubleSide}));this.root.add(mesh);
    }
    this.addLabel(city.waterLabel.name,city.waterLabel.coord,1,'water-label');
  }
  addBuildings(snapshot,city){
    const geometries=[];const buildingWays=snapshot.elements.filter(e=>e.type==='way'&&e.tags?.building&&e.geometry?.length>=4);
    buildingWays.sort((a,b)=>hash(a.id)-hash(b.id));
    for(const b of buildingWays.slice(0,6500)){
      const points=b.geometry.map(p=>project([p.lon,p.lat],city.center));
      if(points.some(p=>Math.abs(p[0])>320||Math.abs(p[1])>260))continue;
      const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],-p[1])));
      const tagged=parseFloat(b.tags.height)||parseFloat(b.tags['building:levels'])*3;
      const centerX=points.reduce((n,p)=>n+p[0],0)/points.length;
      const height=Math.min(55,Math.max(.7,(tagged || (6+hash(b.id)*32+(city.en==='SHANGHAI'&&centerX>65?hash(b.id+1)*60:0)))/10));
      try{
        const geo=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1,curveSegments:1});geo.rotateX(-Math.PI/2);geo.translate(0,.08,0);
        // Color variation makes dense, real building footprints readable at city scale.
        const c=new THREE.Color().setHSL(.49+hash(b.id)*.025,.12,.19+hash(b.id+8)*.12);const colors=new Float32Array(geo.attributes.position.count*3);
        for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}
        geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geometries.push(geo);
      }catch{}
    }
    if(geometries.length){
      const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
      this.buildings.add(new THREE.Mesh(merged,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:.12})));
      const edge=new THREE.EdgesGeometry(merged,25);this.buildings.add(new THREE.LineSegments(edge,new THREE.LineBasicMaterial({color:'#88b3b4',transparent:true,opacity:.17})));
    }
  }
  addRoads(){
    const positions=[],colors=[],basePositions=[];this.pickLines=[];
    for(const r of this.network.roads){
      const start=positions.length/3;
      for(let i=1;i<r.points.length;i++){
        const a=pointOnRoad(r,r.lengths[i-1]/r.length),b=pointOnRoad(r,r.lengths[i]/r.length);
        const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
        const n=[dz/len,-dx/len];
        for(const [arr,width,lift] of [[basePositions,r.width*1.5,0],[positions,r.width*.48,.04]]){
          const p=[[a.x+n[0]*width,a.y+lift,a.z+n[1]*width],[a.x-n[0]*width,a.y+lift,a.z-n[1]*width],[b.x+n[0]*width,b.y+lift,b.z+n[1]*width],[b.x-n[0]*width,b.y+lift,b.z-n[1]*width]];
          for(const idx of [0,1,2,2,1,3])arr.push(...p[idx]);
        }
      }
      this.roadOffsets.push([start,positions.length/3]);
      if(r.elevated && r.length>8){
        const supports=[];
        for(let t=.2;t<.9;t+=.22){const p=pointOnRoad(r,t);const geom=new THREE.CylinderGeometry(.32,.46,p.y,5);geom.translate(p.x,p.y/2,p.z);supports.push(geom);}
        if(supports.length){const geom=mergeGeometries(supports);supports.forEach(g=>g.dispose());this.elevated.add(new THREE.Mesh(geom,new THREE.MeshStandardMaterial({color:'#557578',roughness:1})));}
      }
    }
    const base=new THREE.BufferGeometry();base.setAttribute('position',new THREE.Float32BufferAttribute(basePositions,3));this.root.add(new THREE.Mesh(base,new THREE.MeshBasicMaterial({color:'#273d41',side:THREE.DoubleSide})));
    this.roadGeometry=new THREE.BufferGeometry();this.roadGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.roadGeometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(positions.length),3));
    this.trafficMesh=new THREE.Mesh(this.roadGeometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.8}));this.root.add(this.trafficMesh);
    this.highlight=new THREE.Group();this.root.add(this.highlight);
  }
  addLandmarks(city){
    for(const l of city.landmarks){
      const [x,z]=project(l.coord,city.center);
      if(l.type){
        const group=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:'#8aada9',roughness:.4,metalness:.3});
        if(l.type==='pearl'){
          const stem=new THREE.Mesh(new THREE.CylinderGeometry(.5,1.1,l.height,8),mat);stem.position.y=l.height/2;group.add(stem);
          for(const [y,r] of [[l.height*.28,3.3],[l.height*.72,2.7]]){const sphere=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),mat);sphere.position.y=y;group.add(sphere);const ring=new THREE.Mesh(new THREE.TorusGeometry(r, .1,4,24),new THREE.MeshBasicMaterial({color:'#a4dcbd'}));ring.rotation.x=Math.PI/2;ring.position.y=y;group.add(ring);}
        }else {const g=new THREE.Mesh(new THREE.CylinderGeometry(l.type==='dome'?2:.65,3,l.height,l.type==='dome'?12:6),mat);g.position.y=l.height/2;group.add(g);const edges=new THREE.LineSegments(new THREE.EdgesGeometry(g.geometry),new THREE.LineBasicMaterial({color:'#a2c8bd',transparent:true,opacity:.55}));edges.position.copy(g.position);group.add(edges);}
        group.position.set(x,0,z);this.buildings.add(group);
      }
      this.addLabel(l.name,l.coord,l.height+1,'landmark-label');
    }
  }
  addLabel(name,coord,height,className){
    const [x,z]=project(coord,this.city.center);const element=document.createElement('div');element.className=`map-label ${className}`;element.textContent=name;this.container.appendChild(element);this.labels.push({element,position:new THREE.Vector3(x,height,z),building:className==='landmark-label'});
  }
  addSignals(){
    const signalRoads=this.network.roads.filter(r=>r.signal).slice(0,320);this.signalRoads=signalRoads;
    this.signalMesh=new THREE.InstancedMesh(new THREE.SphereGeometry(.48,5,4),new THREE.MeshBasicMaterial(),signalRoads.length);this.signalMesh.frustumCulled=false;
    signalRoads.forEach((r,i)=>{const p=pointOnRoad(r,.97);dummy.position.set(p.x,p.y+1,p.z);dummy.scale.set(1,1,1);dummy.updateMatrix();this.signalMesh.setMatrixAt(i,dummy.matrix);this.signalMesh.setColorAt(i,new THREE.Color('#9de8b4'));});this.signals.add(this.signalMesh);
  }
  updateTraffic(){
    if(!this.roadGeometry)return;const attr=this.roadGeometry.attributes.color;
    this.network.roads.forEach((r,i)=>{color.set(this.sim.stats[i].color);const [start,end]=this.roadOffsets[i];for(let v=start;v<end;v++)attr.setXYZ(v,color.r,color.g,color.b);});attr.needsUpdate=true;
    const hot=this.sim.metrics().bottlenecks.filter(b=>b.traffic.congestion>.43).slice(0,3);
    this.labels.filter(l=>l.hotspot).forEach(l=>l.element.remove());this.labels=this.labels.filter(l=>!l.hotspot);
    hot.forEach(({road,traffic},i)=>{
      const p=pointOnRoad(road,.5),element=document.createElement('button');element.className='map-label hotspot-label';element.innerHTML=`<span>${String(i+1).padStart(2,'0')}</span><b>${traffic.speed.toFixed(0)}<small> km/h</small></b>`;element.setAttribute('aria-label',`地图瓶颈 ${road.name}`);element.title=road.name;
      element.onclick=()=>{this.focus(road);this.onSelect(road)};this.container.appendChild(element);this.labels.push({element,position:new THREE.Vector3(p.x,p.y+2,p.z),hotspot:true});
    });
  }
  applyLayers(){if(!this.buildings)return;this.buildings.visible=this.layerState.buildings;this.trafficMesh.visible=this.layerState.traffic;this.cars.visible=this.layerState.traffic;this.signals.visible=this.layerState.signals;this.elevated.visible=this.layerState.elevated;}
  setLayer(key,value){this.layerState[key]=value;this.applyLayers();}
  reset(){this.controls.enableRotate=true;this.controls.screenSpacePanning=false;this.controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;this.camera.position.set(265,305,365);this.controls.target.set(0,0,0);this.controls.update();}
  zoom(factor){const delta=this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);this.camera.position.copy(this.controls.target).add(delta);this.controls.update();}
  setView(mode){this.controls.enableRotate=mode!=='2d';this.controls.screenSpacePanning=mode==='2d';this.controls.mouseButtons.LEFT=mode==='2d'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;const distance=this.camera.position.distanceTo(this.controls.target);if(mode==='2d')this.camera.position.copy(this.controls.target).add(new THREE.Vector3(.01,distance,.01));else this.camera.position.copy(this.controls.target).add(new THREE.Vector3(.47,.59,.66).normalize().multiplyScalar(distance));this.controls.update();}
  focus(road){
    this.selectedRoad=road;while(this.highlight.children.length){const c=this.highlight.children[0];c.geometry.dispose();c.material.dispose();this.highlight.remove(c);}
    const pts=road.points.map((p,i)=>new THREE.Vector3(p[0],pointOnRoad(road,road.lengths[i]/road.length).y+.5,p[1]));
    const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),Math.min(100,pts.length*5),.65,5,false),new THREE.MeshBasicMaterial({color:'#f4d79b'}));this.highlight.add(tube);
    const p=pointOnRoad(road,.5);this.flyTarget=new THREE.Vector3(p.x,0,p.z);this.flyFrames=50;
  }
  pick(event){
    if(!this.network)return;const rect=this.renderer.domElement.getBoundingClientRect();const mouse=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    const ray=new THREE.Raycaster();ray.setFromCamera(mouse,this.camera);const point=new THREE.Vector3();if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.3),point))return;
    let closest=null,dist=Infinity;
    for(const r of this.network.roads){for(let i=1;i<r.points.length;i++){const a=new THREE.Vector3(r.points[i-1][0],.3,r.points[i-1][1]),b=new THREE.Vector3(r.points[i][0],.3,r.points[i][1]);const v=new THREE.Vector3();new THREE.Line3(a,b).closestPointToPoint(point,true,v);const d=v.distanceTo(point);if(d<dist){dist=d;closest=r;}}}
    if(closest&&dist<8){this.focus(closest);this.onSelect(closest);}
  }
  render(dt,animate=true){
    if(this.sim){if(animate)this.sim.tick(Math.min(dt,.1));
      this.cars.count=this.sim.vehicles.length;
      this.sim.vehicles.forEach((v,i)=>{const p=pointOnRoad(v.road,v.progress,v.direction,this.city.driveLeft);dummy.position.set(p.x,p.y+.2,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(1,1,1);dummy.updateMatrix();this.cars.setMatrixAt(i,dummy.matrix);});this.cars.instanceMatrix.needsUpdate=true;
      if(this.frame%20===0 && this.signalMesh){this.signalRoads.forEach((r,i)=>this.signalMesh.setColorAt(i,new THREE.Color((this.sim.clock+hash(r.osmId)*70)%70>38?'#ed7f7f':'#9de8b4')));this.signalMesh.instanceColor.needsUpdate=true;}
    }
    if(this.flyFrames>0){const delta=this.flyTarget.clone().sub(this.controls.target).multiplyScalar(.075);this.controls.target.add(delta);this.camera.position.add(delta);this.flyFrames--;}
    this.controls.update();this.renderer.render(this.scene,this.camera);this.frame++;
    if(this.frame%3===0){const rect=this.container.getBoundingClientRect();for(const l of this.labels){const p=l.position.clone().project(this.camera);const x=(p.x*.5+.5)*rect.width,y=(-p.y*.5+.5)*rect.height;l.element.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;l.element.style.display=p.z>1||x<10||x>rect.width-10||y<80||y>rect.height-80||(l.building&&!this.layerState.buildings)||(l.hotspot&&!this.layerState.traffic)?'none':'';}}
    if(this.frame%20===0){
      const scale=this.container.querySelector('.map-scale');
      if(scale){const origin=this.controls.target.clone(),right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld,0).multiplyScalar(50);const a=origin.clone().project(this.camera),b=origin.add(right).project(this.camera);const pixels=Math.abs(b.x-a.x)*this.container.clientWidth/2;const meters=[50,100,200,500,1000,2000].reduce((best,n)=>Math.abs(pixels*n/500-55)<Math.abs(pixels*best/500-55)?n:best,500);scale.innerHTML=`<span style="width:${pixels*meters/500}px"></span>${meters>=1000?meters/1000+' km':meters+' m'}`;}
    }
  }
}

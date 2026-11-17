// GitHub Actions: builds static OSM surface maps for all GPX routes.
// Cache by GPX geometry fingerprint. Data is fetched only in the build, never by visitors.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const routes=JSON.parse(fs.readFileSync('site/routes.json','utf8'));
const hav=(a,b)=>{const p=Math.PI/180,x=Math.sin((b[0]-a[0])*p/2)**2+Math.cos(a[0]*p)*Math.cos(b[0]*p)*Math.sin((b[1]-a[1])*p/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(x)))};
function classifyWay(t){
 const surface=(t.surface||'').toLowerCase(),hw=t.highway||'',track=t.tracktype||'';
 const natural=['dirt','earth','ground','grass','mud','sand','rock','stone','woodchips','soil','clay','grass_paver','pebblestone'];
 const gravel=['gravel','fine_gravel','compacted','crushed_stone','shells'];
 const paved=['asphalt','concrete','concrete:plates','concrete:lanes','paving_stones','sett','cobblestone','unhewn_cobblestone','paved','metal','wood','bricks','chipseal'];
 if(paved.includes(surface))return {kind:'paved',strong:surface!=='paved',reason:surface};
 if(gravel.includes(surface))return {kind:'gravel',strong:true,reason:surface};
 if(natural.includes(surface))return {kind:'trail',strong:true,reason:surface};
 if(surface==='unpaved')return {kind:'other',strong:true,reason:'unpaved – Material unbekannt'};
 if(surface)return {kind:'other',strong:true,reason:surface};
 // Ein path ist ein Wegtyp, kein Oberflächenbeweis.
 if(hw==='path'||hw==='bridleway')return {kind:'trail',strong:false,reason:'OSM-Wegtyp '+hw};
 if(hw==='track'&&(track==='grade4'||track==='grade5'))return {kind:'trail',strong:false,reason:'OSM '+track};
 if(hw==='track'&&track==='grade2')return {kind:'gravel',strong:false,reason:'OSM '+track};
 return {kind:'unknown',strong:false,reason:'keine Oberflächenangabe'};
}
function makeOsmQuery(r){
 // Nur einen schmalen Streckenkorridor abfragen statt des gesamten Tour-Rechtecks.
 // 65 m Puffer und Wegpunkte etwa alle 70 m: auch kurvige Pfade bleiben im Suchgebiet.
 const points=[];let last=null,acc=0;
 for(const seg of r.segments){
  for(let j=0;j<seg.length;j++){
   const p=seg[j];
   if(!last||j===0||acc>=.07){points.push(p);acc=0}
   if(last)acc+=hav(last,p);
   last=p;
  }
  if(seg.length)points.push(seg[seg.length-1]);
 }
 const coords=points.filter((p,i)=>i===0||p[0]!==points[i-1][0]||p[1]!==points[i-1][1])
   .map(p=>p[0].toFixed(5)+','+p[1].toFixed(5)).join(',');
 return '[out:json][timeout:22];way["highway"~"^(path|footway|track|pedestrian|cycleway|residential|service|living_street|unclassified|tertiary|secondary|primary|steps|bridleway|road)$"](around:65,'+coords+');out geom;';
}
async function getOSMWays(r){
 const query=makeOsmQuery(r);
 const endpoints=['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter'];
 let lastError;
 for(const endpoint of endpoints){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const res=await fetch(endpoint,{method:'POST',body:new URLSearchParams({data:query}),signal:controller.signal});
   if(!res.ok)throw Error('OSM-Dienst meldet HTTP '+res.status);
   const data=await res.json();if(!Array.isArray(data.elements))throw Error('Ungültige OSM-Antwort');
   return data.elements.filter(w=>w.type==='way'&&Array.isArray(w.geometry)&&w.geometry.length>1);
  }catch(err){lastError=err;console.warn('Overpass:',endpoint,err.message)}finally{clearTimeout(timeout)}
 }
 throw lastError||Error('OpenStreetMap nicht erreichbar');
}
// Ein räumlicher Index beschleunigt den Abgleich der GPX-Segmente mit OSM-Wegegeometrien.
function matchSurface(r,ways){
 const cell=.0015,idx=new Map(),cos=Math.cos(r.segments[0][0][0]*Math.PI/180);
 const key=(x,y)=>x+','+y;
 for(const w of ways){
  const cl=classifyWay(w.tags||{});
  for(let j=1;j<w.geometry.length;j++){
   const a=w.geometry[j-1],b=w.geometry[j];
   const ax=a.lon*cos,ay=a.lat,bx=b.lon*cos,by=b.lat;
   const seg={ax,ay,bx,by,cl};
   const minx=Math.floor(Math.min(a.lon,b.lon)/cell),maxx=Math.floor(Math.max(a.lon,b.lon)/cell);
   const miny=Math.floor(Math.min(a.lat,b.lat)/cell),maxy=Math.floor(Math.max(a.lat,b.lat)/cell);
   if((maxx-minx+1)*(maxy-miny+1)>400)continue;
   for(let x=minx;x<=maxx;x++)for(let y=miny;y<=maxy;y++){
    const k=key(x,y),bucket=idx.get(k);if(bucket)bucket.push(seg);else idx.set(k,[seg]);
   }
  }
 }
 const output=[],totals={trail:0,gravel:0,paved:0,other:0,unknown:0},strongTotals={trail:0,gravel:0,paved:0,other:0,unknown:0};
 let total=0;
 for(const points of r.segments){
  if(points.length<2)continue;
  let runKind=null,run=[],runStrong=false;
  const flush=()=>{if(run.length>1)output.push({type:'Feature',properties:{kind:runKind,strong:runStrong},geometry:{type:'LineString',coordinates:run}})};
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],distance=hav(a,b);
   if(distance<=0)continue;
   const lon=(a[1]+b[1])/2,lat=(a[0]+b[0])/2,px=lon*cos,py=lat;
   const gx=Math.floor(lon/cell),gy=Math.floor(lat/cell);
   const candidates=new Set();
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const seg of idx.get(key(gx+dx,gy+dy))||[])candidates.add(seg);
   const vx=(b[1]-a[1])*cos,vy=b[0]-a[0],vlen=Math.hypot(vx,vy);
   let winner=null,best=Infinity;
   for(const seg of candidates){
    const sx=seg.bx-seg.ax,sy=seg.by-seg.ay,den=sx*sx+sy*sy;if(!den)continue;
    const t=Math.max(0,Math.min(1,((px-seg.ax)*sx+(py-seg.ay)*sy)/den));
    const d=Math.hypot(px-seg.ax-t*sx,py-seg.ay-t*sy)*111195;
    if(d>24)continue;
    const align=vlen?Math.abs((vx*sx+vy*sy)/(vlen*Math.sqrt(den))):1;
    if(distance>6&&align<.62)continue;
    const score=d+(1-align)*18-(seg.cl.strong?1:0);
    if(score<best){best=score;winner=seg.cl}
   }
   const kind=winner?winner.kind:'unknown',strong=!!(winner&&winner.strong);
   total+=distance;totals[kind]+=distance;if(strong)strongTotals[kind]+=distance;
   const xyA=[a[1],a[0]],xyB=[b[1],b[0]];
   if(runKind!==kind||runStrong!==strong){flush();runKind=kind;runStrong=strong;run=[xyA,xyB]}else run.push(xyB);
  }
  flush();
 }
 return {features:output,totals,strongTotals,total};
}

async function work(i){
 const r=routes[i];
 const hash=crypto.createHash('sha256').update(JSON.stringify(r.segments)).digest('hex').slice(0,24);
 const cachePath=path.join('surface-cache',hash+'.json'),dest=path.join('site','surfaces',i+'.json');
 if(fs.existsSync(cachePath)){
  fs.copyFileSync(cachePath,dest);console.log('CACHE',i,r.name);return true;
 }
 try{
  const ways=await getOSMWays(r);
  if(!ways.length)throw Error('Keine OSM Wege');
  const result=matchSurface(r,ways);
  fs.writeFileSync(dest,JSON.stringify(result));
  fs.copyFileSync(dest,cachePath);
  console.log('OK',i,r.name, 'OSM:',ways.length);
  return true;
 }catch(e){console.error('FEHLER',i,r.name,e.message);return false}
}
async function main(){
 fs.mkdirSync('site/surfaces',{recursive:true});fs.mkdirSync('surface-cache',{recursive:true});
 // Moderate parallelism to respect public Overpass resources.
 let next=0,ok=0;
 async function worker(){while(next<routes.length){const i=next++;if(await work(i))ok++;}}
 await Promise.all([worker(),worker()]);
 console.log(`Wegarten: ${ok}/${routes.length} Touren vorbereitet.`);
 if(!ok)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});

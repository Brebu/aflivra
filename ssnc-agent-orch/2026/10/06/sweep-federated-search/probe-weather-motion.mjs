// T3.1/T3.2 Weather-life probe — 4 conditions (rain/snow/sunny/night) x 2 viewports
// (390x844 dsf2, 1280x800) on the vreme weather surface. Condition control: fulfill the
// client forecast fetch (/api/weather?lat&lon, no kind param) with a parsed-shaped
// SourceState fixture; kind=alerts and everything else pass through to the dev server.
// Asserts per condition+viewport: scene class, ambient layer present, animationName
// matches the design inventory with motion ON; then page.emulateMedia(reducedMotion
// :'reduce') proves the blanket gate freezes every animation (computed animationName
// none, ambient/static scene still rendered, no overflow, no console errors).
import {chromium} from '@playwright/test';
import fs from 'node:fs';

const BASE='http://localhost:5173';
const DIR=import.meta.dirname;
const OUT=DIR+'/probes';
fs.mkdirSync(OUT,{recursive:true});

const now=Date.now(),hour=3600e3,day=24*hour;
const currentVariables={temperature_2m:21.4,relative_humidity_2m:68,apparent_temperature:20.9,is_day:1,precipitation:0.4,rain:0.4,showers:0,snowfall:0,weather_code:61,cloud_cover:100,pressure_msl:1013.2,surface_pressure:1008.7,wind_speed_10m:13.6,wind_direction_10m:210,wind_gusts_10m:27.1};
const currentUnits={temperature_2m:'°C',relative_humidity_2m:'%',apparent_temperature:'°C',is_day:'',precipitation:'mm',rain:'mm',showers:'mm',snowfall:'cm',weather_code:'',cloud_cover:'%',pressure_msl:'hPa',surface_pressure:'hPa',wind_speed_10m:'km/h',wind_direction_10m:'°',wind_gusts_10m:'km/h'};
const hourlyUnits={temperature_2m:'°C',relative_humidity_2m:'%',weather_code:'',wind_speed_10m:'km/h',precipitation:'mm'};
const dailyUnits={weather_code:'',temperature_2m_max:'°C',temperature_2m_min:'°C',precipitation_probability_max:'%'};

function fixture({code,isDay,temp}){
  const current={...currentVariables,weather_code:code,is_day:isDay,temperature_2m:temp,apparent_temperature:Math.round((temp-0.5)*10)/10,time:now,interval:900};
  const hourly=Array.from({length:24},(_,i)=>({time:now+i*hour,...Object.fromEntries(Object.keys(hourlyUnits).map(k=>[k,k==='weather_code'?code:k==='temperature_2m'?temp+i*0.1:k==='wind_speed_10m'?10+i%7:k==='relative_humidity_2m'?60+i%20:0.2]))}));
  const daily=Array.from({length:7},(_,i)=>({time:now+i*day,weather_code:code,temperature_2m_max:temp+3+i,temperature_2m_min:temp-5+i*0.5,precipitation_probability_max:i===0?85:40+i*5}));
  const iso=new Date(now).toISOString();
  return{key:'forecast:44.43:26.1',name:'Open-Meteo · prognoză locală',url:'https://open-meteo.com/',adapterVersion:'probe-fixture',status:'fresh',data:{latitude:44.43,longitude:26.1,elevation:91,timezone:'Europe/Bucharest',interval:900,current,currentUnits,hourly,hourlyUnits,daily,dailyUnits,attribution:'Open-Meteo · CC BY 4.0',method:'Valori calculate de modele meteorologice, distincte de observațiile măsurate la stațiile ANM.'},publishedAt:iso,lastSuccessAt:iso,lastAttemptAt:iso,nextAttemptAt:null,error:null,ttlSeconds:600};
}

// weather_code + is_day -> expected .weather-scene-{background} class + the ambient
// animation inventory (element + ::before + ::after computed animationName, motion ON).
const conditions=[
  {name:'rain',code:61,isDay:1,temp:11.6,scene:'weather-scene-rain',layerAnim:['aflivra-weather-rain-far','aflivra-weather-rain-near']},
  {name:'snow',code:73,isDay:1,temp:-2.3,scene:'weather-scene-snow',layerAnim:['aflivra-weather-snow-far','aflivra-weather-snow-near']},
  {name:'clear',code:0,isDay:1,temp:24.8,scene:'weather-scene-sunny',layerAnim:['aflivra-weather-glow','']},
  {name:'night',code:1,isDay:0,temp:14.2,scene:'weather-scene-night',layerAnim:['aflivra-weather-twinkle, aflivra-weather-night-drift','aflivra-weather-twinkle, aflivra-weather-night-drift']},
  {name:'cloudy',code:3,isDay:1,temp:9.5,scene:'weather-scene-cloudy',layerAnim:['aflivra-weather-drift-far','aflivra-weather-drift-near']},
];
const VPS=[{name:'390',w:390,h:844,dsf:2},{name:'1280',w:1280,h:800,dsf:1}];

const readMotion=()=>{const scene=document.querySelector('.weather-scene');const ambient=document.querySelector('.weather-scene .weather-ambient');const img=document.querySelector('.weather-scene>img');const chipIcon=document.querySelector('.weather-scene-metrics>span>svg');const gridIcon=document.querySelector('.weather-metric-grid article>svg');const cs=el=>el?getComputedStyle(el):null;const pseudo=(el,p)=>{try{return getComputedStyle(el,p)}catch{return null}};return{
  sceneClass:scene?scene.className:null,
  ambient:!!ambient,
  ambientAnim:cs(ambient)?.animationName||null,
  ambientBeforeAnim:pseudo(ambient,'::before')?.animationName||null,
  ambientAfterAnim:pseudo(ambient,'::after')?.animationName||null,
  ambientBeforeStatic:pseudo(ambient,'::before')?.transform||null,
  imgAnim:cs(img)?.animationName||null,
  chipIconAnim:cs(chipIcon)?.animationName||null,
  gridIconAnim:cs(gridIcon)?.animationName||null,
  kicker:document.querySelector('.weather-scene .kicker')?.textContent||'',
  temp:(document.querySelector('.weather-scene-temperature')?.textContent||'').trim(),
  metrics:document.querySelectorAll('.weather-scene-metrics>span').length,
  grid:document.querySelectorAll('.weather-metric-grid article').length,
  overflowX:Math.max(0,document.documentElement.scrollWidth-innerWidth)}};

const browser=await chromium.launch();
const report={conditions:[],reducedMotion:[]};
let failures=0;

for(const vp of VPS){
  const context=await browser.newContext({viewport:{width:vp.w,height:vp.h},deviceScaleFactor:vp.dsf});
  for(const cond of conditions){
    await context.route('**/api/weather*',async route=>{
      const url=new URL(route.request().url());
      if(url.searchParams.has('kind'))return route.fallback();
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture({code:cond.code,isDay:cond.isDay,temp:cond.temp}))});
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push('pageerror: '+String(e).slice(0,160)));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text().slice(0,160))});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto(BASE+'/#view=domain&id=vreme',{waitUntil:'domcontentloaded'});
    await page.locator('.weather-scene').waitFor({timeout:30000});
    await page.waitForTimeout(900);
    const on=await page.evaluate(`(${readMotion.toString()})()`);
    const expectLayer=(label,actual,want)=>{const ok=want===''?actual===want||actual==='none':actual===want;if(!ok){failures++;console.log(`  FAIL ${vp.name}/${cond.name} ${label}: want "${want}" got "${actual}"`)}return ok};
    let pass=true;
    pass=expectLayer('sceneClass',on.sceneClass.includes(cond.scene)?cond.scene:'MISSING',cond.scene)&&pass;
    pass=expectLayer('ambient present',on.ambient?'yes':'no','yes')&&pass;
    if(cond.scene==='weather-scene-sunny'){pass=expectLayer('ambient(element) anim',on.ambientAnim,cond.layerAnim[0])&&pass}
    else{pass=expectLayer('ambient ::before anim',on.ambientBeforeAnim,cond.layerAnim[0])&&pass;pass=expectLayer('ambient ::after anim',on.ambientAfterAnim,cond.layerAnim[1])&&pass}
    pass=expectLayer('scene img anim',on.imgAnim,'aflivra-weather-sky')&&pass;
    pass=expectLayer('metric chip icon anim',on.chipIconAnim,'aflivra-weather-icon')&&pass;
    pass=expectLayer('metric grid icon anim',on.gridIconAnim,'aflivra-weather-icon')&&pass;
    if(on.overflowX>1){failures++;pass=false;console.log(`  FAIL ${vp.name}/${cond.name} overflowX=${on.overflowX}`)}
    if(errors.length){failures++;pass=false;console.log(`  FAIL ${vp.name}/${cond.name} console errors: ${errors.join(' | ')}`)}
    await page.screenshot({path:`${OUT}/weather-${vp.name}-${cond.name}.png`,fullPage:false});
    await page.screenshot({path:`${OUT}/weather-${vp.name}-${cond.name}-full.png`,fullPage:true});
    report.conditions.push({vp:vp.name,condition:cond.name,scene:on.sceneClass,kicker:on.kicker,temp:on.temp,metrics:on.metrics,grid:on.grid,motionOn:{ambientAnim:on.ambientAnim,before:on.ambientBeforeAnim,after:on.ambientAfterAnim,img:on.imgAnim,chipIcon:on.chipIconAnim,gridIcon:on.gridIconAnim},overflowX:on.overflowX,errors,pass});
    // Reduced motion: same page, flip the media emulation, re-read computed animation.
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForTimeout(150);
    const off=await page.evaluate(`(${readMotion.toString()})()`);
    const stillOn=[off.ambientAnim,off.ambientBeforeAnim,off.ambientAfterAnim,off.imgAnim,off.chipIconAnim,off.gridIconAnim].filter(v=>v&&v!=='none');
    const reducedOk=stillOn.length===0&&off.ambient&&off.sceneClass.includes(cond.scene);
    if(!reducedOk){failures++;console.log(`  FAIL ${vp.name}/${cond.name} reduced-motion animations remain: ${JSON.stringify(stillOn)} ambient=${off.ambient}`)}
    if(vp.name==='390'||cond.name==='rain')await page.screenshot({path:`${OUT}/weather-${vp.name}-${cond.name}-reduced.png`});
    report.reducedMotion.push({vp:vp.name,condition:cond.name,animations:{ambient:off.ambientAnim,before:off.ambientBeforeAnim,after:off.ambientAfterAnim,img:off.imgAnim,chipIcon:off.chipIconAnim,gridIcon:off.gridIconAnim},ambientStillRendered:off.ambient,sceneIntact:off.sceneClass.includes(cond.scene),ok:reducedOk});
    await page.close();
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(OUT+'/weather-motion.json',JSON.stringify(report,null,1));
console.log('---');
for(const c of report.conditions)console.log(`${c.pass?'ok ':'FAIL'} ${c.vp.padEnd(4)} ${c.condition.padEnd(6)} scene=${c.scene} kicker="${c.kicker}" ${c.temp} metrics=${c.metrics} grid=${c.grid} on:[${c.motionOn.ambientAnim||c.motionOn.before}/${c.motionOn.after||'-'}] img=${c.motionOn.img} chip=${c.motionOn.chipIcon} gridIcon=${c.motionOn.gridIcon} overflowX=${c.overflowX}`);
console.log('reduced-motion (emulateMedia reduce):');
for(const r of report.reducedMotion)console.log(`${r.ok?'ok ':'FAIL'} ${r.vp.padEnd(4)} ${r.condition.padEnd(6)} all-animation-names=[${Object.values(r.animations).join(',')}] ambient-rendered=${r.ambientStillRendered} scene=${r.sceneIntact}`);
console.log('---');
console.log(failures===0?`PASS — ${report.conditions.length} condition x viewport audits + ${report.reducedMotion.length} reduced-motion audits, ${failures} failures`:`FAIL — ${failures} failures`);
process.exit(failures===0?0:1);

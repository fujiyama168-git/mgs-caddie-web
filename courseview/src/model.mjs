export const POINT_KEYS = Object.freeze(['tee','right','left','green']);
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const text=(s,max=2000)=>typeof s==='string'&&s.length<=max;
export function safeURL(value,base='https://example.invalid/') {
 if(!text(value,2000)||!value.trim())throw new TypeError('URL is required');
 const u=new URL(value,base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new TypeError('Only HTTP(S) URLs without credentials are allowed');return u.href;
}
export function validateCourse(c){
 const errors=[];const bad=(ok,key)=>{if(!ok)errors.push(key)};
 bad(c&&typeof c==='object','course');if(!c||typeof c!=='object')return errors;
 bad(c.schemaVersion===1,'schemaVersion');bad(text(c.courseId,100)&&!!c.courseId,'courseId');bad(text(c.courseName,100),'courseName');bad(Number.isInteger(c.hole)&&c.hole>0,'hole');bad(c.geometryStatus==='conceptual_unscaled','geometryStatus');bad(typeof c.imageSha256==='string'&&/^[0-9a-f]{64}$/.test(c.imageSha256),'imageSha256');
 const asset=(a,key)=>{bad(a&&finite(a.width,1,20000)&&finite(a.height,1,20000),key+'.dimensions');try{safeURL(a?.src)}catch{errors.push(key+'.src')}bad(text(a?.alt),key+'.alt')};
 asset({src:c.image,width:c.art?.width,height:c.art?.height,alt:c.alt},'overview');
 for(const k of POINT_KEYS){const p=c.points?.[k];bad(p&&text(p.label,100)&&text(p.note)&&finite(p.x,0,1)&&finite(p.y,0,1),'points.'+k);asset(c.scenes?.[k],'scenes.'+k)}
 bad(Array.isArray(c.obZones)&&c.obZones.length<=30,'obZones');
 for(const z of (Array.isArray(c.obZones)?c.obZones:[])){bad(z&&text(z.id,100)&&text(z.label,100)&&['x1','y1','x2','y2'].every(k=>finite(z[k],0,1))&&finite(z.width,0.001,1),'obZone')}
 if(c.landingSafeArea){
  const sections=c.landingSafeArea.sections,exclusions=c.landingSafeArea.exclusions??[];
  bad(Array.isArray(sections)&&sections.length>=2&&sections.length<=100,'landingSafeArea.sections');
  for(const s of(Array.isArray(sections)?sections:[]))bad(s&&finite(s.y,0,1)&&finite(s.left,0,1)&&finite(s.right,0,1)&&s.left<s.right,'landingSafeArea.section');
  bad(Array.isArray(exclusions)&&exclusions.length<=100,'landingSafeArea.exclusions');
  for(const z of(Array.isArray(exclusions)?exclusions:[]))bad(z&&['water','trees','bunker','cartpath'].includes(z.type)&&finite(z.minX,0,1)&&finite(z.maxX,0,1)&&finite(z.minY,0,1)&&finite(z.maxY,0,1)&&z.minX<z.maxX&&z.minY<z.maxY,'landingSafeArea.exclusion');
  if(c.landingSafeArea.green){const g=c.landingSafeArea.green;bad(finite(g.cx,0,1)&&finite(g.cy,0,1)&&finite(g.rx,.001,1)&&finite(g.ry,.001,1),'landingSafeArea.green')}
 }
 for(const key of ['sourceCredit','provenance']){if(c[key]){try{safeURL(c[key].url)}catch{errors.push(key+'.url')}}}
 return errors;
}
export function fitCourseArt(w,h,zoom=1,sourceWidth=1024,sourceHeight=1536){
 if(![w,h,zoom,sourceWidth,sourceHeight].every(Number.isFinite)||sourceWidth<=0||sourceHeight<=0)throw new TypeError('Invalid fit dimensions');
 w=Math.max(1,w);h=Math.max(1,h);zoom=Math.max(1,Math.min(3,zoom));const scale=Math.min(w/sourceWidth,h/sourceHeight)*zoom,imageWidth=sourceWidth*scale,imageHeight=sourceHeight*scale,canvasWidth=Math.max(w,imageWidth),canvasHeight=Math.max(h,imageHeight);
 return {scale,zoom,imageWidth,imageHeight,canvasWidth,canvasHeight,left:(canvasWidth-imageWidth)/2,top:(canvasHeight-imageHeight)/2,scrollLeft:(canvasWidth-w)/2,scrollTop:(canvasHeight-h)/2};
}
export async function loadCourseData(url,{signal,expectedRelease,fetchImpl=fetch}={}){
 const r=await fetchImpl(url,{signal,cache:'no-cache'});if(!r.ok)throw Error(`Course data HTTP ${r.status}`);const data=await r.json();
 if(data.schemaVersion!==1||typeof data.release!=='string'||(expectedRelease&&data.release!==expectedRelease)||!Array.isArray(data.courses)||!data.courses.length)throw Error('Course manifest/release mismatch');
 const ids=new Set();for(const c of data.courses){const errors=validateCourse(c);if(errors.length)throw Error(`${c.courseId}: ${errors.join(', ')}`);if(ids.has(c.courseId))throw Error('Duplicate courseId');ids.add(c.courseId)}
 return data;
}

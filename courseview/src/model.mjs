export const POINT_KEYS = Object.freeze(['tee','right','left','green']);
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const text=(s,max=2000)=>typeof s==='string'&&s.length<=max;
export const METRIC_ALIGNMENT_QUALITY_POLICY=Object.freeze({id:'courseview-metric-v1',maxRmsResidualM:2,maxResidualM:5});
const determinant3=m=>m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]);
const inverse3=m=>{const d=determinant3(m);if(!Number.isFinite(d)||Math.abs(d)<1e-12)return null;const[a,b,c,e,f,g,h,i,j]=m;return[(f*j-g*i)/d,(c*i-b*j)/d,(b*g-c*f)/d,(g*h-e*j)/d,(a*j-c*h)/d,(c*e-a*g)/d,(e*i-f*h)/d,(b*h-a*i)/d,(a*f-b*e)/d]};
const matrixFor=t=>{if(t?.type==='affine_local_metres_to_normalized_image')return[...t.coefficients,0,0,1];if(t?.type!=='projective_local_metres_to_normalized_image'||!Array.isArray(t.matrix))return null;const scale=Math.max(...t.matrix.map(Math.abs));return scale>0?t.matrix.map(value=>value/scale):null};
const invertPoint=(m,p)=>{const inv=inverse3(m);if(!inv)return null;const w=inv[6]*p.x+inv[7]*p.y+inv[8];if(!Number.isFinite(w)||Math.abs(w)<1e-10)return null;return{eastM:(inv[0]*p.x+inv[1]*p.y+inv[2])/w,northM:(inv[3]*p.x+inv[4]*p.y+inv[5])/w}};
const nonCollinear=points=>points.some((a,i)=>points.some((b,j)=>j!==i&&points.some((c,k)=>k!==i&&k!==j&&Math.abs((b.local.eastM-a.local.eastM)*(c.local.northM-a.local.northM)-(b.local.northM-a.local.northM)*(c.local.eastM-a.local.eastM))>1e-8)));
export function validateMetricAlignment(m,c){
 const errors=[],bad=(ok,key)=>{if(!ok)errors.push(key)},t=m?.transform,matrix=matrixFor(t),projective=t?.type==='projective_local_metres_to_normalized_image';
 bad(m?.schemaVersion===1&&m?.status==='calibrated'&&m?.overviewImage===c?.image&&m?.overviewSha256===c?.imageSha256&&m?.imageWidth===c?.art?.width&&m?.imageHeight===c?.art?.height,'metricAlignment.binding');
 bad(m?.coordinateSystem==='local_metres'&&matrix?.length===9&&matrix.every(Number.isFinite)&&!!inverse3(matrix),'metricAlignment.transform');
 const coverage=m?.coverage,coveragePoints=coverage?.points??[];if(projective)bad(coverage?.type==='local_metres_polygon'&&coveragePoints.length>=3,'metricAlignment.coverage');
 if(matrix&&coveragePoints.length){const ds=coveragePoints.map(p=>matrix[6]*p.eastM+matrix[7]*p.northM+matrix[8]);bad(ds.every(v=>Number.isFinite(v)&&Math.abs(v)>1e-10)&&ds.every(v=>Math.sign(v)===Math.sign(ds[0])),'metricAlignment.coverageDenominator')}
 const v=m?.validation,fit=v?.fitPoints,holdout=v?.holdoutPoints,all=Array.isArray(fit)&&Array.isArray(holdout)?[...fit,...holdout]:[];
 const valid=p=>p&&p.id&&Number.isFinite(p.local?.eastM)&&Number.isFinite(p.local?.northM)&&Number.isFinite(p.image?.x)&&Number.isFinite(p.image?.y);
 bad(v?.policyId===METRIC_ALIGNMENT_QUALITY_POLICY.id&&['surveyed','authoritative_geospatial'].includes(v?.source?.type)&&!!v?.source?.reference?.trim()&&v?.review?.status==='independently_reviewed'&&!!v?.review?.reviewer?.trim()&&/^\d{4}-\d{2}-\d{2}$/.test(v?.review?.reviewedAt??''),'metricAlignment.evidence');
 bad(Array.isArray(fit)&&fit.length>=(projective?4:3)&&Array.isArray(holdout)&&holdout.length>=1&&all.every(valid),'metricAlignment.controlPoints');
 if(all.length&&all.every(valid)){const ids=new Set(all.map(p=>p.id)),locals=new Set(all.map(p=>`${p.local.eastM}:${p.local.northM}`));bad(ids.size===all.length&&locals.size===all.length,'metricAlignment.independentPoints');bad(nonCollinear(fit),'metricAlignment.controlGeometry');if(matrix&&holdout.length){const residuals=holdout.map(p=>{const q=invertPoint(matrix,p.image);return q?Math.hypot(q.eastM-p.local.eastM,q.northM-p.local.northM):Infinity}),rms=Math.sqrt(residuals.reduce((s,n)=>s+n*n,0)/residuals.length),max=Math.max(...residuals);bad([v.rmsResidualM,v.maxResidualM,rms,max].every(Number.isFinite)&&v.rmsResidualM>=0&&v.maxResidualM>=v.rmsResidualM&&Math.abs(v.rmsResidualM-rms)<=.05&&Math.abs(v.maxResidualM-max)<=.05&&rms<=2&&max<=5,'metricAlignment.residuals')}}
 return errors;
}
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

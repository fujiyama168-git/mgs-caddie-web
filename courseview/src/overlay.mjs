// 画像上の注釈は既存資料に基づく概略です。既存ハザード位置は
// 「推奨点をここへ置かない」安全側比較に使えます。
export const HAZARD_TYPES = Object.freeze({
 ob_attention:{name:'OB注意',color:'#bb2435'},
 one_penalty_attention:{name:'1ペナ注意',color:'#9b5a00'},
 bunker:{name:'バンカー',color:'#775411'},
 water:{name:'池・水路',color:'#006b9a'}
});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const point=p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1);
const imagePoint=p=>p&&typeof p==='object'&&point([p.x,p.y])?{x:p.x,y:p.y}:null;
const imageRoute=course=>{
 const tee=imagePoint(course?.points?.tee),green=imagePoint(course?.points?.green);
 if(!tee||!green||tee.y<=green.y)return null;
 const explicit=Array.isArray(course?.centerline)?course.centerline.map(imagePoint).filter(Boolean):[];
 const waypoints=[tee,imagePoint(course?.points?.right),imagePoint(course?.points?.left),green].filter(Boolean);
 const route=explicit.length>=2?explicit:waypoints;
 if(route.length<2)return null;
 const cumulative=[0];
 for(let i=1;i<route.length;i++)cumulative.push(cumulative[i-1]+Math.hypot(route[i].x-route[i-1].x,route[i].y-route[i-1].y));
 const total=cumulative.at(-1);
 return total>0?{points:route,cumulative,total}:null;
};
/**
 * 独自生成の全体図に登録した、ティーからグリーンまでの折れ曲がった
 * フェアウェイ中心線を返す。ティーとグリーンの直線だけを使うと、
 * ドッグレッグの途中で着弾点が林へ飛ぶため、曲がり角の要点座標を通す。
 */
export function interpolateImageRoute(course,distanceRatio){
 const route=imageRoute(course);if(!route)return null;
 const ratio=Math.max(0,Math.min(1,Number.isFinite(distanceRatio)?distanceRatio:0));
 const target=route.total*ratio;
 let index=route.points.length-1;
 for(let i=1;i<route.cumulative.length;i++){if(target<=route.cumulative[i]){index=i;break;}}
 const a=route.points[index-1],b=route.points[index],segment=route.cumulative[index]-route.cumulative[index-1];
 const dy=b.y-a.y,dx=b.x-a.x,len=Math.hypot(dx,dy)||1;
 const t=Math.max(0,Math.min(1,(target-route.cumulative[index-1])/(segment||Number.EPSILON)));
 return {x:a.x+dx*t,y:a.y+dy*t,rightX:-dy/len,rightY:dx/len};
}
export function verifiedImageOverlay(course){
 const o=course?.hazardOverlay;
 if(!o||o.image!==course.image||!course.imageSha256||o.assetSha256!==course.imageSha256||o.coordinateSpace!=='normalized_image'||o.scope!=='overview_only'||!Array.isArray(o.zones)||!o.zones.length||o.zones.length>30)return null;
 if(o.zones.some(z=>!z||!HAZARD_TYPES[z.type]||typeof z.id!=='string'||typeof z.label!=='string'||z.label.length>30||!point(z.labelAnchor)||!Array.isArray(z.points)||z.points.length<3||z.points.length>12||!z.points.every(point)||!['attention_patch_not_boundary','visible_feature_approximation'].includes(z.geometryMeaning)))return null;
 if(o.callouts!==undefined&&(!Array.isArray(o.callouts)||o.callouts.length>10||o.callouts.some(z=>!z||!HAZARD_TYPES[z.type]||typeof z.label!=='string'||z.label.length>30||!point(z.labelAnchor))))return null;
 return o;
}
export function renderHazardLayer(course){
 const w=course.art.width,h=course.art.height,o=verifiedImageOverlay(course);
 if(o){return o.zones.map(z=>{
  const color=HAZARD_TYPES[z.type].color,pts=z.points.map(([x,y])=>`${x*w},${y*h}`).join(' '),cx=z.points.reduce((a,p)=>a+p[0],0)/z.points.length*w,cy=z.points.reduce((a,p)=>a+p[1],0)/z.points.length*h,lx=z.labelAnchor[0]*w,ly=z.labelAnchor[1]*h;
  return `<g class="hazard-mark" data-hazard-type="${z.type}"><title>${escape(z.label||HAZARD_TYPES[z.type].name)}：${escape(z.evidence??'位置・輪郭は概略')}</title><polygon points="${pts}" fill="${color}" fill-opacity="${z.type.endsWith('attention')?'.24':'.20'}" stroke="none"/>`+(z.label?`<path d="M${cx} ${cy} L${lx} ${ly}" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="9 7"/><text x="${lx}" y="${ly}" dy=".33em" text-anchor="middle" fill="${color}" class="hazard-label">${escape(z.label)}</text>`:'')+'</g>';
 }).join('')+(o.callouts??[]).map(z=>`<g class="hazard-mark" data-hazard-type="${z.type}"><title>${escape(z.label)}：${escape(z.evidence??'位置概略')}</title><text x="${z.labelAnchor[0]*w}" y="${z.labelAnchor[1]*h}" dy=".33em" text-anchor="middle" fill="${HAZARD_TYPES[z.type].color}" class="hazard-label">${escape(z.label)}</text></g>`).join('');}
 return '<g class="ob-attention-bands">'+course.obZones.map(z=>`<path d="M${z.x1*w} ${z.y1*h} L${z.x2*w} ${z.y2*h}" style="stroke-width:${z.width*w}"/>`).join('')+'</g><g class="ob-attention-labels">'+course.obZones.map(z=>`<text x="${(z.x1+z.x2)*w/2}" y="${(z.y1+z.y2)*h/2}" text-anchor="middle">${escape(z.label)}</text>`).join('')+'</g>';
}

const pointInPolygon=(x,y,points)=>{let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j],cross=((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi||Number.EPSILON)+xi;if(cross)inside=!inside;}return inside;};
const segmentDistance=(x,y,x1,y1,x2,y2)=>{const dx=x2-x1,dy=y2-y1;if(dx===0&&dy===0)return Math.hypot(x-x1,y-y1);const t=Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-(x1+t*dx),y-(y1+t*dy));};
const polygonDistance=(x,y,points)=>{let best=Infinity;for(let i=0;i<points.length;i++){const [x1,y1]=points[i],[x2,y2]=points[(i+1)%points.length];best=Math.min(best,segmentDistance(x,y,x1,y1,x2,y2));}return pointInPolygon(x,y,points)?0:best;};
const landingZones=course=>verifiedImageOverlay(course)?.zones??[];
const safeFromLandingZones=(x,y,zones,margin)=>zones.every(z=>!pointInPolygon(x,y,z.points)&&polygonDistance(x,y,z.points)>margin);
const routeLandingPoint=(course,distanceRatio,lateralOffset)=>{
 const route=interpolateImageRoute(course,distanceRatio);if(!route)return null;
 return {x:Math.max(.04,Math.min(.96,route.x+route.rightX*lateralOffset)),y:Math.max(.04,Math.min(.96,route.y+route.rightY*lateralOffset))};
};
export function resolveLandingPoint(course,baseX,baseY,margin,distanceRatio){
 const zones=landingZones(course);if(!zones.length||safeFromLandingZones(baseX,baseY,zones,margin))return {x:baseX,y:baseY,adjusted:false};
 // ハザード回避後も、ドッグレッグの中心線から外れた林側へ逃がさない。
 if(typeof distanceRatio==='number'&&Number.isFinite(distanceRatio)){
  let nearestSafe=null,nearestSafeDistance=Number.POSITIVE_INFINITY;
  let bestRoute=null,bestRouteDistance=-1;
  for(const distanceShift of [0,-.025,.025,-.05,.05,-.075,.075]){
   const distance=Math.max(0,Math.min(1,distanceRatio+distanceShift));
   for(let step=0;step<=8;step++){
    const lateral=step===0?0:(step%2===1?1:-1)*Math.ceil(step/2)*.01;
    if(Math.abs(lateral)>.08)continue;
    const candidate=routeLandingPoint(course,distance,lateral);if(!candidate)continue;
    const distanceFromBase=Math.hypot(candidate.x-baseX,candidate.y-baseY);
    const clearance=Math.min(...zones.map(z=>polygonDistance(candidate.x,candidate.y,z.points)));
    if(clearance>bestRouteDistance){bestRoute={...candidate,adjusted:true};bestRouteDistance=clearance;}
    if(safeFromLandingZones(candidate.x,candidate.y,zones,margin)&&distanceFromBase<nearestSafeDistance){nearestSafe={...candidate,adjusted:true};nearestSafeDistance=distanceFromBase;}
   }
  }
  if(nearestSafe)return nearestSafe;
  if(bestRoute)return bestRoute;
 }
 for(let radius=.02;radius<=.24;radius+=.02){for(let index=0;index<24;index++){const angle=(Math.PI*2*index)/24,x=Math.max(.04,Math.min(.96,baseX+Math.cos(angle)*radius)),y=Math.max(.04,Math.min(.96,baseY+Math.sin(angle)*radius));if(safeFromLandingZones(x,y,zones,margin))return {x,y,adjusted:true};}}
 let best={x:baseX,y:baseY,adjusted:true},bestDistance=-1;for(let ix=4;ix<=24;ix++){for(let iy=4;iy<=24;iy++){const x=ix/25,y=iy/25,d=Math.min(...zones.map(z=>polygonDistance(x,y,z.points)));if(d>bestDistance){best={x,y,adjusted:true};bestDistance=d;}}}return best;
}

export function renderPlayerLandingLayer(course,overlay){
 const w=course?.art?.width,h=course?.art?.height;
 if(!Number.isFinite(w)||!Number.isFinite(h)||!overlay||typeof overlay!=='object')return '';
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const ratio=n=>typeof n==='number'&&Number.isFinite(n)?clamp(n,0,1):null;
 const distance=ratio(overlay.distanceRatio),offset=typeof overlay.lateralOffsetRatio==='number'&&Number.isFinite(overlay.lateralOffsetRatio)?clamp(overlay.lateralOffsetRatio,-.16,.16):0;
 if(distance===null)return '';
 const route=interpolateImageRoute(course,distance);
 if(!route)return '';
 // 表示上の左右差は、曲がり角を含む局所的なフェアウェイ軸へ適用する。
 // 画像は概略図なので、外側へ大きく飛ばして林側へ表示しない。
 const visualOffset=clamp(offset,-.08,.08);
 const baseX=clamp(route.x+route.rightX*visualOffset,.04,.96),baseY=clamp(route.y+route.rightY*visualOffset,.04,.96);
 const spreadX=clamp(typeof overlay.spreadXRatio==='number'&&Number.isFinite(overlay.spreadXRatio)?overlay.spreadXRatio:.035,.012,.16);
 const spreadY=clamp(typeof overlay.spreadYRatio==='number'&&Number.isFinite(overlay.spreadYRatio)?overlay.spreadYRatio:.025,.012,.12);
 const resolved=resolveLandingPoint(course,baseX,baseY,Math.max(.012,Math.min(.05,Math.max(spreadX,spreadY)*.75)),distance),cx=resolved.x*w,cy=resolved.y*h,rx=spreadX*w,ry=spreadY*h;
 const markerRadius=Math.max(24,Math.min(40,w*.036));
 const coreRadius=Math.max(6,Math.min(9,w*.008));
 const labelX=clamp(cx,180,w-180);
 const labelY=clamp(cy-ry-34,34,h-34);
 const label=escape(overlay.label||'推奨着弾点'),club=escape(overlay.clubName||'推奨クラブ'),carry=escape(overlay.carryYd??'');
 const adjustment=resolved.adjusted?'既存資料の注意ゾーンを避ける側へ表示位置を補正しています。':'';
 return `<g class="player-landing-layer"><title>${label}：${club} / キャリー ${carry}yd。画像上の概略表示で、精密な測量地点ではありません。${adjustment}</title><ellipse class="player-landing-band" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/><line class="player-landing-axis" x1="${cx}" y1="${cy-ry}" x2="${cx}" y2="${cy+ry}"/><circle class="player-landing-point" cx="${cx}" cy="${cy}" r="${markerRadius}"/><circle class="player-landing-core" cx="${cx}" cy="${cy}" r="${coreRadius}"/><g class="player-landing-label"><rect x="${labelX-180}" y="${labelY-26}" width="360" height="52" rx="12"/><text x="${labelX}" y="${labelY+7}" text-anchor="middle">${label} / ${club} / ${carry}yd</text></g></g>`;
}
export const hasHazardLayer=c=>!!verifiedImageOverlay(c)||!!c.obZones.length;
export function hazardLegend(course){
 const o=verifiedImageOverlay(course);if(!o)return '<strong>赤い帯：出典の表示をもとにした注意ゾーン</strong><p>ハザード位置は既存資料に基づく概略表示です。正確な測量境界線ではないため、現地の杭・白線とローカルルールを確認してください。</p>';
 const types=[...new Set([...o.zones,...(o.callouts??[])].map(z=>z.type))];
 return '<strong>既存資料に基づく注意表示 / 位置・広さは概略</strong><div class="hazard-key">'+types.map(t=>`<span><i style="background:${HAZARD_TYPES[t].color}"></i>${HAZARD_TYPES[t].name}</span>`).join('')+'</div><p>ハザードの位置と種類は既存資料に基づき反映しています。塗りは精密な測量境界線ではなく、池・砂の輪郭や前後距離も目安です。現地の杭・白線とローカルルールを確認してください。</p>'+(types.includes('one_penalty_attention')?'<p>「1ペナ」は公式図の表記です。OBや現在のペナルティーエリアと同じ扱いとは確認していません。</p>':'')+'<p>全体画像専用の表示です。別視点Viewには座標を流用していません。</p>';
}

/* CNC Studio Web v3 - controller-aware CNC geometry/interpreter preview engine.
 * The engine intentionally separates modal interpretation from geometry projection.
 * It is a browser-only preview engine: it does NOT replace a machine controller.
 */
(function(global){
'use strict';
const EPS=1e-9, TAU=Math.PI*2;
const AXES=['X','Y','Z','A','B','C','U','V','W'];
const MOTION=new Set(['G00','G01','G02','G03','G33','G33.1','G38.2','G38.3','G38.4','G38.5']);
const PLANES=new Set(['G17','G18','G19']);
const UNITS=new Set(['G20','G21']);
const DIST=new Set(['G90','G91']);
const ARC_DIST=new Set(['G90.1','G91.1']);
const FEED=new Set(['G93','G94','G95']);
const CANNED=new Set(['G73','G74','G76','G81','G82','G83','G84','G85','G86','G87','G88','G89']);
const LATHE_CYCLES=new Set(['G70','G71','G72','G73','G74','G75','G76','G90','G92','G94']);
const MILL_HOLE_PATTERNS=new Set(['G70','G71','G72']);
const KNOWN_G=new Set([
'G00','G01','G02','G03','G04','G05','G05.1','G05.2','G07','G08','G09','G10','G12','G13','G14','G15',
'G17','G18','G19','G19.1','G20','G21','G28','G29','G30','G31','G32','G33','G33.1',
'G38.2','G38.3','G38.4','G38.5','G40','G41','G42','G41.1','G42.1','G43','G43.1','G43.2','G49',
'G50','G51','G52','G53','G54','G55','G56','G57','G58','G59','G59.1','G59.2','G59.3','G61','G61.1','G64',
'G65','G68','G69','G70','G71','G72','G73','G74','G75','G76','G77','G80','G81','G82','G83','G84','G85','G86','G87','G88','G89',
'G90','G90.1','G91','G91.1','G92','G92.1','G92.2','G92.3','G93','G94','G95','G96','G97','G98','G99','G100','G101','G103'
]);
const KNOWN_M=new Set(['M00','M01','M02','M03','M04','M05','M06','M07','M08','M09','M19','M30','M48','M49','M50','M51','M52','M53','M60','M98','M99']);
const PROFILES={
 FANUC:{name:'FANUC',latheG90Cycle:true,latheG94Cycle:true,diameterMode:false,defaultPlaneMill:'G17',defaultPlaneLathe:'G18'},
 HAAS:{name:'HAAS',latheG90Cycle:true,latheG94Cycle:true,diameterMode:false,defaultPlaneMill:'G17',defaultPlaneLathe:'G18'},
 LINUXCNC:{name:'LinuxCNC',latheG90Cycle:false,latheG94Cycle:false,diameterMode:false,defaultPlaneMill:'G17',defaultPlaneLathe:'G18'}
};
function finite(v){return Number.isFinite(v)}
function n(v){const x=Number(v);return finite(x)?x:null}
function fmtG(v){return 'G'+(Number.isInteger(v)?String(v).padStart(2,'0'):String(v))}
function stripComments(line){
 line=line.replace(/\([^)]*\)/g,' ');
 line=line.replace(/;.*$/,'');
 line=line.replace(/\/\s*(?=(?:N\s*)?\d|G|M|T|X|Y|Z|A|B|C|U|V|W|F|S|I|J|K|R|P|Q|L|H|D)/gi,' ');
 return line.trim().toUpperCase();
}
function expandCR(line){return line.replace(/\bCR\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)/gi,'R$1')}
function tokenize(line){
 const s=expandCR(stripComments(line)); const out=[];
 const re=/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)/g; let m;
 while((m=re.exec(s))) out.push({letter:m[1],value:n(m[2]),raw:m[0],index:m.index});
 return out;
}
function gCodes(ws){return ws.filter(w=>w.letter==='G').map(w=>fmtG(w.value))}
function mCodes(ws){return ws.filter(w=>w.letter==='M').map(w=>'M'+Math.round(w.value).toString().padStart(2,'0'))}
function word(ws,l,occ=0){let k=0;for(const w of ws)if(w.letter===l){if(k===occ)return w.value;k++}return null}
function has(ws,l){return ws.some(w=>w.letter===l)}
function near(a,b){return Math.abs(a-b)<EPS}
function len2(a,b){return Math.hypot(b.x-a.x,b.y-a.y)}
function clone(o){return JSON.parse(JSON.stringify(o))}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function axisPoint(s){return {x:s.x,y:s.y,z:s.z,a:s.a,b:s.b,c:s.c,u:s.u,v:s.v,w:s.w}}
function project(p,plane){
 if(plane==='G18')return {x:p.x,y:p.z,z:p.y};
 if(plane==='G19')return {x:p.y,y:p.z,z:p.x};
 return {x:p.x,y:p.y,z:p.z};
}
function unproject(q,plane,base){
 if(plane==='G18')return {x:q.x,y:base.y,z:q.y};
 if(plane==='G19')return {x:base.x,y:q.x,z:q.y};
 return {x:q.x,y:q.y,z:base.z};
}
function addSegment(out,a,b,g,line,meta){
 if(len2(a,b)<EPS && !meta?.force)return;
 out.push({x:a.x,y:a.y,x2:b.x,y2:b.y,z:b.z,g,line,rapid:g==='G00',cut:g!=='G00',meta:meta||{}});
}
function arcCenterIJK(a,b,ws,plane,arcDistance,base){
 let u='I',v='J'; if(plane==='G18'){u='I';v='K'} if(plane==='G19'){u='J';v='K'}
 const du=word(ws,u),dv=word(ws,v); if(du===null&&dv===null)return null;
 if(arcDistance==='G90.1'){
   const c3={x:0,y:0,z:0}; if(u==='I')c3.x=du??a.x; if(u==='J')c3.y=du??a.y; if(u==='K')c3.z=du??a.z;
   if(v==='I')c3.x=dv??a.x; if(v==='J')c3.y=dv??a.y; if(v==='K')c3.z=dv??a.z;
   const q=project(c3,plane); return {x:q.x,y:q.y};
 }
 const p0=project(a,plane); return {x:p0.x+(du??0),y:p0.y+(dv??0)};
}
function arcCenterR(a,b,r,cw){
 const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),rr=Math.abs(r);
 if(d<EPS)return null;
 if(rr<d/2-EPS)return null;
 const mx=(a.x+b.x)/2,my=(a.y+b.y)/2,h=Math.sqrt(Math.max(0,rr*rr-d*d/4));
 const nx=-dy/d,ny=dx/d,c1={x:mx+nx*h,y:my+ny*h},c2={x:mx-nx*h,y:my-ny*h};
 function sweep(c){let s=Math.atan2(a.y-c.y,a.x-c.x),e=Math.atan2(b.y-c.y,b.x-c.x),d=e-s;if(cw&&d>=0)d-=TAU;if(!cw&&d<=0)d+=TAU;return d}
 let c1sw=sweep(c1),chosen=Math.abs(c1sw)<=Math.PI?c1:c2;
 if(r<0)chosen=chosen===c1?c2:c1; return chosen;
}
function arc(out,a,b,center,cw,g,line,meta){
 const r=Math.hypot(a.x-center.x,a.y-center.y); if(r<EPS){addSegment(out,a,b,g,line,meta);return}
 let s=Math.atan2(a.y-center.y,a.x-center.x),e=Math.atan2(b.y-center.y,b.x-center.x),d=e-s;
 if(cw&&d>=0)d-=TAU;if(!cw&&d<=0)d+=TAU;
 if(len2(a,b)<EPS)d=cw?-TAU:TAU;
 const steps=Math.max(8,Math.min(3600,Math.ceil(Math.abs(d)*r/1.25)));
 const arcMeta={...meta,arc:true,arcCenter:{x:center.x,y:center.y},arcRadius:r,arcStart:s,arcSweep:d};
 let p={...a}; for(let i=1;i<=steps;i++){const t=i/steps,ang=s+d*t,q={x:center.x+Math.cos(ang)*r,y:center.y+Math.sin(ang)*r,z:a.z+(b.z-a.z)*t};addSegment(out,p,q,g,line,arcMeta);p=q}
}
function rotatePoint(p,c,deg){const a=deg*Math.PI/180,co=Math.cos(a),si=Math.sin(a),x=p.x-c.x,y=p.y-c.y;return {x:c.x+x*co-y*si,y:c.y+x*si+y*co,z:p.z}}
function offsetLine(a,b,d,side){const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy)||1;const nx=-dy/L*side*d,ny=dx/L*side*d;return {a:{x:a.x+nx,y:a.y+ny,z:a.z},b:{x:b.x+nx,y:b.y+ny,z:b.z}}}
function evalExpr(v,vars){
 if(typeof v!=='string')return v;
 let s=v.trim(); if(/^#/.test(s)){const k=s.match(/^#<?([0-9A-Za-z_]+)>?$/);return k?(vars[k[1]]??0):0}
 s=s.replace(/#<([\w_]+)>/g,(_,k)=>String(vars[k]??0)).replace(/#(\d+)/g,(_,k)=>String(vars[k]??0));
 if(!/^[0-9A-Za-z_+\-*/().\s<>=[\]&|!]+$/.test(s))return n(s);
 try{const x=Function('return ('+s+')')();return finite(x)?x:null}catch{return n(s)}
}
function parse(text,options={}){
 const mode=options.mode==='turning'?'turning':'milling'; const controller=(options.controller||'FANUC').toUpperCase(); const profile=PROFILES[controller]||PROFILES.FANUC;
 const lines=String(text??'').replace(/\r/g,'').split('\n');
 const result={version:'3.0',mode,controller,segments:[],diagnostics:[],warnings:[],errors:[],events:[],lines:lines.length,totalLength:0,bounds:null,state:null,modalHistory:[],variables:{}};
 const s={x:0,y:0,z:mode==='turning'?0:5,a:0,b:0,c:0,u:0,v:0,w:0,f:0,spindle:0,tool:1,feedMode:'G94',distance:'G90',arcDistance:'G91.1',plane:mode==='turning'?'G18':'G17',units:'G21',motion:'G00',coolant:'M09',spindleCode:'M05',spindleMode:'G97',diameterMode:profile.diameterMode,canned:null,toolComp:'G40',toolLength:false,coordSystem:'G54',coordOffsets:{G54:{x:0,y:0,z:0},G55:{x:0,y:0,z:0},G56:{x:0,y:0,z:0},G57:{x:0,y:0,z:0},G58:{x:0,y:0,z:0},G59:{x:0,y:0,z:0}},localOffset:{x:0,y:0,z:0},g92Offset:{x:0,y:0,z:0},rotation:null,scale:1,mirrorX:false,mirrorY:false,skip:false};
 const vars={}; const cycle={}; let profileStart=null,profileEnd=null,profileStartLine=null,profileEndLine=null;
 function diag(line,severity,message,code=''){const d={line,severity,message,code};result.diagnostics.push(d);if(severity==='warning')result.warnings.push(message);if(severity==='error')result.errors.push(message)}
 function setVar(name,val){if(name!=null&&finite(val))vars[String(name)]=val}
 function readAxis(ws,k){const v=word(ws,k);return v===null?null:evalExpr(v,vars)}
 function machineTarget(ws){
   const inc=s.distance==='G91'; const t=axisPoint(s);
   for(const a of AXES){const v=readAxis(ws,a);if(v===null)continue;const k=a.toLowerCase();t[k]=inc?s[k]+v:v}
   return t;
 }
 function transform(p){
   let q={...p}; q.x*=s.scale;q.y*=s.scale;q.z*=s.scale;
   if(s.mirrorX)q.x=-q.x;if(s.mirrorY)q.y=-q.y;
   if(s.rotation)q=rotatePoint(q,s.rotation.center,s.rotation.deg);
   const off=s.coordOffsets[s.coordSystem]||{x:0,y:0,z:0};q.x+=off.x+s.localOffset.x+s.g92Offset.x;q.y+=off.y+s.localOffset.y+s.g92Offset.y;q.z+=off.z+s.localOffset.z+s.g92Offset.z;return q;
 }
 function display(a,b,g,line,meta={}){const pa=transform(a),pb=transform(b);const qa=project(pa,s.plane),qb=project(pb,s.plane);addSegment(result.segments,qa,qb,g,line,{...meta,rawStart:{...a},rawEnd:{...b},state:{plane:s.plane,units:s.units,feed:s.f,spindle:s.spindle,tool:s.tool}})}
 function executeLinear(a,b,g,line,meta={}){display(a,b,g,line,meta)}
 function executeArc(a,b,ws,cw,g,line,meta={}){
   const pa=transform(a),pb=transform(b); const qa=project(pa,s.plane),qb=project(pb,s.plane);
   let c=arcCenterIJK(pa,pb,ws,s.plane,s.arcDistance,pa); const rv=readAxis(ws,'R');
   if(!c&&rv!==null)c=arcCenterR(qa,qb,rv,cw);
   if(!c){diag(line,'warning','Không xác định được tâm cung; hiển thị thành đoạn thẳng.',g);addSegment(result.segments,qa,qb,g,line,{...meta,arcFallback:true});return}
   arc(result.segments,qa,qb,c,cw,g,line,meta)
 }
 function drillCycle(code,ws,line,baseTarget){
   const r=readAxis(ws,'R')??cycle.R??(s.z+2); const depth=readAxis(ws,'Z')??cycle.Z??s.z; const q=Math.abs(readAxis(ws,'Q')??cycle.Q??Math.max(.5,Math.abs(depth-r)/4));
   const start=axisPoint(s), top={...start,x:baseTarget.x,y:baseTarget.y,z:r}, bottom={...top,z:depth}; display(start,top,'G00',line,{cycle:code,phase:'position'});
   if(['G83','G73'].includes(code)){
     let z=r;let guard=0;while((depth<r?z>depth+EPS:z<depth-EPS)&&guard++<10000){const nz=depth<r?Math.max(depth,z-q):Math.min(depth,z+q);display({...top,z},{...top,z:nz},'G01',line,{cycle:code,phase:'peck'});if(!near(nz,depth))display({...top,z:nz},{...top,z:r},'G00',line,{cycle:code,phase:'retract'});z=nz}
   }else display(top,bottom,'G01',line,{cycle:code,phase:'cut'});
   if(code==='G82'||code==='G89')diag(line,'info',`${code}: dwell P được ghi nhận trong trạng thái mô phỏng.`,code);
   display(bottom,top,'G00',line,{cycle:code,phase:s.retractMode==='G98'?'initial-return':'R-return'});
 }
 function parseLatheCycle(code,ws,line,target){
   if(code==='G70'){if(profileStart&&profileEnd){display(profileStart,profileEnd,'G01',line,{cycle:'G70',phase:'finish'})}else diag(line,'warning','G70 cần profile đã xác định bằng P/Q hoặc đoạn profile trước đó.','G70');return}
   if(code==='G90'||code==='G94'){if(has(ws,'X')||has(ws,'Z')){display(axisPoint(s),target,'G01',line,{cycle:code,phase:'turning'})}return}
   if(code==='G92'){display(axisPoint(s),target,'G01',line,{cycle:'G92',phase:'thread'}) ; return}
   if(code==='G75'||code==='G74'){const q=Math.abs(readAxis(ws,'Q')??2);let z0=s.z,z1=target.z,dir=z1<z0?-1:1;for(let z=z0;dir*z<dir*z1-EPS;z+=dir*q)display({...axisPoint(s),z},{...target,z},'G01',line,{cycle:code,phase:'groove'});return}
   if(code==='G76'){display(axisPoint(s),target,'G01',line,{cycle:'G76',phase:'thread'});diag(line,'info','G76: preview centerline; bước/chiều sâu được giữ trong metadata, không thay thế bộ điều khiển.','G76');return}
   if(code==='G71'||code==='G72'||code==='G73'){
     if(profileStart&&profileEnd){display(profileStart,profileEnd,'G01',line,{cycle:code,phase:'rough-profile'})}
     else diag(line,'warning',`${code}: chưa có profile P/Q để roughing; chỉ ghi nhận chu kỳ.`,code);return;
   }
 }
 for(let i=0;i<lines.length;i++){
   const raw=lines[i], clean=expandCR(stripComments(raw)); if(!clean||clean==='%')continue;
   const ws=tokenize(raw); if(!ws.length)continue; const line=i+1;
   const ns=word(ws,'N'); if(ns!==null)result.events.push({line,type:'sequence',value:ns});
   if(clean.startsWith('/')||s.skip){result.events.push({line,type:'block-skip'});continue}
   // Macro assignment: #100=10, #<DEPTH>=#100-2
   const assign=clean.match(/^#<?([A-Za-z0-9_]+)>?\s*=\s*(.+)$/);
   if(assign){const val=evalExpr(assign[2],vars);setVar(assign[1],val);result.events.push({line,type:'variable',name:assign[1],value:val});continue}
   const gs=gCodes(ws), ms=mCodes(ws);
   for(const g of gs){
     if(!KNOWN_G.has(g))diag(line,'warning',`G-code ${g} chưa có mô hình riêng.`,g);
     if(MOTION.has(g))s.motion=g;
     if(DIST.has(g) && !(mode==='turning'&&profile.latheG90Cycle&&g==='G90'))s.distance=g;
     if(ARC_DIST.has(g))s.arcDistance=g;
     if(PLANES.has(g))s.plane=g;
     if(UNITS.has(g))s.units=g;
     if(FEED.has(g))s.feedMode=g;
     if(g==='G96')s.spindleMode='G96'; if(g==='G97')s.spindleMode='G97';
     if(g==='G7')s.diameterMode=true; if(g==='G8')s.diameterMode=false;
     if(['G40','G41','G42','G41.1','G42.1'].includes(g))s.toolComp=g;
     if(g==='G43'||g==='G43.1'||g==='G43.2')s.toolLength=true;if(g==='G49')s.toolLength=false;
     if(/^G5[4-9](?:\.\d)?$/.test(g))s.coordSystem=g;
     if(g==='G98'||g==='G99')s.retractMode=g;
     if(g==='G80')s.canned=null;
     if(g==='G69')s.rotation=null;
     if(g==='G100')s.mirrorX=false,s.mirrorY=false;
     if(g==='G101')s.mirrorX=true;
     if(g==='G61'||g==='G61.1'||g==='G64')s.pathControl=g;
     if(g==='G28'||g==='G30')diag(line,'info',`${g}: reference move được ghi nhận; machine zero không được mô phỏng.`,g);
     if(g==='G41'||g==='G42')diag(line,'info',`${g}: preview centerline; bù bán kính thực được cảnh báo thay vì âm thầm dịch đường chạy.`,g);
     if(['G51','G52','G92','G92.1','G92.2','G92.3'].includes(g))diag(line,'info',`${g}: coordinate transform/offset được xử lý ở mức preview.`,g);
   }
   for(const m of ms){
     if(!KNOWN_M.has(m))diag(line,'warning',`M-code ${m} chưa có mô hình riêng.`,m);
     if(['M03','M04','M05'].includes(m))s.spindleCode=m;
     if(['M07','M08','M09'].includes(m))s.coolant=m;
     if(m==='M06'&&has(ws,'T'))s.tool=readAxis(ws,'T');
     if(m==='M98'||m==='M99')diag(line,'info',`${m}: subprogram được ghi nhận; preview không tự nạp file ngoài.`,m);
   }
   const f=readAxis(ws,'F'),sp=readAxis(ws,'S'),tt=readAxis(ws,'T'); if(f!==null)s.f=f;if(sp!==null)s.spindle=sp;if(tt!==null)s.tool=tt;
   // Transform commands.
   const activeG=gs[gs.length-1]||'';
   if(gs.includes('G68')){const cx=readAxis(ws,'X')??0,cy=readAxis(ws,'Y')??0,deg=readAxis(ws,'R')??0;s.rotation={center:{x:cx,y:cy,z:0},deg};}
   if(gs.includes('G51')){const p=readAxis(ws,'P');if(p!==null)s.scale=p;}
   if(gs.includes('G52')){s.localOffset.x=readAxis(ws,'X')??s.localOffset.x;s.localOffset.y=readAxis(ws,'Y')??s.localOffset.y;s.localOffset.z=readAxis(ws,'Z')??s.localOffset.z;}
   if(gs.includes('G92')){s.g92Offset.x=readAxis(ws,'X')??s.g92Offset.x;s.g92Offset.y=readAxis(ws,'Y')??s.g92Offset.y;s.g92Offset.z=readAxis(ws,'Z')??s.g92Offset.z;}
   if(gs.includes('G92.1'))s.g92Offset={x:0,y:0,z:0};
   if(gs.includes('G10')){const L=readAxis(ws,'L'),P=readAxis(ws,'P');if((L===2||L===20)&&P!=null){const k='G'+(53+P);if(s.coordOffsets[k]){s.coordOffsets[k].x=readAxis(ws,'X')??s.coordOffsets[k].x;s.coordOffsets[k].y=readAxis(ws,'Y')??s.coordOffsets[k].y;s.coordOffsets[k].z=readAxis(ws,'Z')??s.coordOffsets[k].z;}}}
   if(gs.includes('G90.1')||gs.includes('G91.1'))s.arcDistance=gs.includes('G90.1')?'G90.1':'G91.1';
   // Haas/FANUC lathe G90/G94 are cycles; LinuxCNC remains distance/feed mode.
   const latheCycle=mode==='turning'&&profile.latheG90Cycle&&gs.find(g=>LATHE_CYCLES.has(g));
   const cycleCode=gs.find(g=>CANNED.has(g));
   if(cycleCode){s.canned=cycleCode;for(const k of ['R','Q','P','L','K','I','J','H','D','E']){const v=readAxis(ws,k);if(v!==null)cycle[k]=v}}
   if(gs.includes('G80'))s.canned=null;
   const activeCycle=cycleCode||s.canned;
   if(latheCycle && ['G70','G71','G72','G73'].includes(latheCycle)){const p=readAxis(ws,'P'),q=readAxis(ws,'Q');if(p!==null)profileStartLine=p;if(q!==null)profileEndLine=q;}
   const target=machineTarget(ws), hasXYZ=['X','Y','Z'].some(a=>has(ws,a)), a0=axisPoint(s);
   // Profile capture for lathe cycles using N sequence labels.
   if(mode==='turning'&&hasXYZ&&(s.motion==='G00'||s.motion==='G01')){if(profileStart===null)profileStart={...a0};profileEnd={...target}}
   if(activeCycle && mode==='milling' && hasXYZ){drillCycle(activeCycle,ws,line,target);}
   else if(latheCycle){parseLatheCycle(latheCycle,ws,line,target);}
   else if(hasXYZ || gs.some(g=>MOTION.has(g))){
     const g=s.motion;
     if(g==='G02'||g==='G03')executeArc(a0,target,ws,g==='G02',g,line,{controller,mode});
     else if(g==='G33'||g==='G33.1'){executeLinear(a0,target,'G01',line,{synchronized:g});diag(line,'info',`${g}: spindle-synchronized preview as linear path.`,g)}
     else if(/^G38\./.test(g)){executeLinear(a0,target,'G01',line,{probe:g});diag(line,'info',`${g}: probe motion shown as feed line.`,g)}
     else executeLinear(a0,target,g,line,{controller,mode});
   }
   Object.assign(s,target);
   result.modalHistory.push({line,g:gs,m:ms,state:{motion:s.motion,distance:s.distance,plane:s.plane,units:s.units,feed:s.f,spindle:s.spindle,tool:s.tool}});
 }
 // Calculate geometry metrics.
 if(result.segments.length){
   const pts=[[0,0]];for(const q of result.segments){pts.push([q.x,q.y],[q.x2,q.y2])}
   result.bounds={minX:Math.min(...pts.map(p=>p[0])),maxX:Math.max(...pts.map(p=>p[0])),minY:Math.min(...pts.map(p=>p[1])),maxY:Math.max(...pts.map(p=>p[1]))};
 } else if(lines.some(l=>stripComments(l).replace('%','').trim()))diag(1,'info','Chưa có chuyển động X/Y/Z hợp lệ để vẽ.','');
 result.totalLength=result.segments.reduce((sum,q)=>sum+len2(q,q),0);
 // len2(q,q) is intentionally not used; calculate explicitly to keep segment shape obvious.
 result.totalLength=result.segments.reduce((sum,q)=>sum+Math.hypot(q.x2-q.x,q.y2-q.y),0);
 result.state=clone(s); result.variables=clone(vars);
 return result;
}
global.CNCEngine={parse,PROFILES,words:tokenize,version:'3.0.0'};
})(window);

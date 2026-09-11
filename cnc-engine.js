/* CNC Studio geometry engine v4
   Supports G00/G01/G02/G03, G17/G18/G19, G90/G91, I/J/K and R/CR=.
*/
(function(global){
'use strict';
const EPS=1e-9, TAU=Math.PI*2;
const MOTION=new Set(['G00','G01','G02','G03']);
const PLANES=new Set(['G17','G18','G19']);

function cleanNum(s){return Number(s)}
function stripComments(s){return s.replace(/\([^)]*\)/g,'').replace(/;.*$/,'').trim()}
function expandCR(s){
  return s.replace(/\bCR\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)/gi,'R$1');
}
function tokenize(s){
  const out=[], re=/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)/gi;
  let m; while((m=re.exec(s))) out.push({letter:m[1].toUpperCase(),value:Number(m[2]),raw:m[0]});
  return out;
}
function word(ws,l){const a=ws.filter(x=>x.letter===l);return a.length?a[a.length-1].value:null}
function has(ws,l){return ws.some(x=>x.letter===l)}
function gs(ws){return ws.filter(x=>x.letter==='G').map(x=>'G'+String(x.value).replace(/\.0+$/,''))}
function modalG(ws){
  return gs(ws).find(g=>MOTION.has(g)) || null;
}
function pointForPlane(p,plane){
  if(plane==='G18') return {a:p.x,b:p.z,other:p.y};
  if(plane==='G19') return {a:p.y,b:p.z,other:p.x};
  return {a:p.x,b:p.y,other:p.z};
}
function setPlanePoint(base,plane,a,b){
  const p={...base};
  if(plane==='G18'){p.x=a;p.z=b}
  else if(plane==='G19'){p.y=a;p.z=b}
  else {p.x=a;p.y=b}
  return p;
}
function axisTarget(s,ws){
  const t={...s};
  const abs=s.distance==='G90';
  for(const k of ['X','Y','Z']){
    const v=word(ws,k);
    if(v!==null)t[k]=abs?v:s[k]+v;
  }
  return t;
}
function centerFromIJ(start,ws,plane,incMode){
  let c={...start};
  if(plane==='G17'){
    const i=word(ws,'I')||0,j=word(ws,'J')||0;
    c.x=incMode?start.x+i:i;c.y=incMode?start.y+j:j;
  }else if(plane==='G18'){
    const i=word(ws,'I')||0,k=word(ws,'K')||0;
    c.x=incMode?start.x+i:i;c.z=incMode?start.z+k:k;
  }else{
    const j=word(ws,'J')||0,k=word(ws,'K')||0;
    c.y=incMode?start.y+j:j;c.z=incMode?start.z+k:k;
  }
  return c;
}
function arcByRadius(start,end,r,cw,plane){
  const A=pointForPlane(start,plane), B=pointForPlane(end,plane);
  const dx=B.a-A.a,dy=B.b-A.b,d=Math.hypot(dx,dy),rr=Math.abs(r);
  if(d<EPS) return {error:'Cung có điểm đầu và cuối trùng nhau; CR/R cần thêm quy định góc.'};
  if(rr < d/2-EPS) return {error:`Bán kính ${r} không đủ: khoảng cách hai điểm là ${d.toFixed(3)}, cần |R| ≥ ${(d/2).toFixed(3)}.`};
  const mx=(A.a+B.a)/2,my=(A.b+B.b)/2;
  const h=Math.sqrt(Math.max(0,rr*rr-d*d/4));
  const nx=-dy/d,ny=dx/d;
  const cands=[{a:mx+nx*h,b:my+ny*h},{a:mx-nx*h,b:my-ny*h}];

  function sweep(c){
    let s=Math.atan2(A.b-c.b,A.a-c.a),e=Math.atan2(B.b-c.b,B.a-c.a),sw=e-s;
    if(cw){if(sw>=0)sw-=TAU}else{if(sw<=0)sw+=TAU}
    return sw;
  }
  const scored=cands.map(c=>({...c,sw:sweep(c)}));
  const wantMajor=r<0;
  let best=scored[0];
  for(const c of scored){
    const major=Math.abs(c.sw)>Math.PI+1e-7;
    const bestMajor=Math.abs(best.sw)>Math.PI+1e-7;
    if(wantMajor!==bestMajor){
      if(major===wantMajor)best=c;
    }else{
      if(Math.abs(c.sw)<Math.abs(best.sw))best=c;
    }
  }
  return {center:setPlanePoint({x:start.x,y:start.y,z:start.z},plane,best.a,best.b),sweep:best.sw,radius:rr,start,end,plane};
}
function arcByIJ(start,end,center,plane,cw){
  const A=pointForPlane(start,plane),B=pointForPlane(end,plane),C=pointForPlane(center,plane);
  const r=Math.hypot(A.a-C.a,A.b-C.b);
  if(r<EPS)return {error:'I/J/K tạo bán kính bằng 0.'};
  let s=Math.atan2(A.b-C.b,A.a-C.a),e=Math.atan2(B.b-C.b,B.a-C.a),sw=e-s;
  if(cw){if(sw>=0)sw-=TAU}else{if(sw<=0)sw+=TAU}
  return {center,radius:r,sweep:sw,start,end,plane};
}
function makeSegment(a,b,g,line,meta){
  return {x:a.x,y:a.y,z:a.z,x2:b.x,y2:b.y,z2:b.z,g,line,rapid:g==='G00',meta:meta||{}};
}
function arcLength(a){return Math.abs(a.sweep)*a.radius}
function parse(text,opt){
  const mode=opt?.mode||'milling', controller=opt?.controller||'FANUC';
  const lines=text.replace(/\r/g,'').split('\n');
  const s={x:0,y:0,z:5,f:0,spindle:0,tool:1,distance:'G90',plane:mode==='turning'?'G18':'G17',units:'G21',motion:'G00',arcDistance:'G91.1'};
  const result={segments:[],diagnostics:[],errors:[],events:[],state:null,totalLength:0,bounds:null};
  function diag(line,severity,message,code=''){const d={line,severity,message,code};result.diagnostics.push(d);if(severity==='error')result.errors.push(d)}
  function addLinear(a,b,g,line){if(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)>EPS)result.segments.push(makeSegment(a,b,g,line))}
  function addArc(a,b,arc,g,line){
    if(arc.error){diag(line,'error',arc.error,g);return}
    const meta={arc:true,arcCenter:arc.center,arcRadius:arc.radius,arcSweep:arc.sweep,arcStart:Math.atan2(
      pointForPlane(a,arc.plane).b-pointForPlane(arc.center,arc.plane).b,
      pointForPlane(a,arc.plane).a-pointForPlane(arc.center,arc.plane).a
    ),arcStartPoint:a,plane:arc.plane};
    result.segments.push(makeSegment(a,b,g,line,meta));
  }

  for(let i=0;i<lines.length;i++){
    const line=i+1,raw=lines[i],stripped=stripComments(raw);
    if(!stripped||stripped==='%')continue;
    if(/\bCR\s*(?!\=)/i.test(stripped)){
      diag(line,'error','Cú pháp CR phải có dấu =, ví dụ CR=20. CR20 và CR-20 không hợp lệ.','CR=');
      continue;
    }
    const clean=expandCR(stripped),ws=tokenize(clean);
    if(!ws.length)continue;

    const motion=modalG(ws); if(motion)s.motion=motion;
    for(const g of gs(ws)){
      if(PLANES.has(g))s.plane=g;
      if(g==='G90'||g==='G91')s.distance=g;
      if(g==='G20'||g==='G21')s.units=g;
      if(g==='G96'||g==='G97')s.spindleMode=g;
      if(g==='G17'||g==='G18'||g==='G19')s.plane=g;
    }
    const f=word(ws,'F'),sp=word(ws,'S'),t=word(ws,'T');
    if(f!==null)s.f=f;if(sp!==null)s.spindle=sp;if(t!==null)s.tool=t;

    const start={...s}, target=axisTarget(s,ws);
    const g=s.motion;
    const hasAxis=['X','Y','Z'].some(k=>has(ws,k));

    if(hasAxis||MOTION.has(motion)){
      if(g==='G02'||g==='G03'){
        const cw=g==='G02';
        let arc=null;
        const rv=word(ws,'R');
        if(rv!==null){
          arc=arcByRadius(start,target,rv,cw,s.plane);
        }else if(has(ws,'I')||has(ws,'J')||has(ws,'K')){
          const inc=s.arcDistance!=='G90.1';
          const c=centerFromIJ(start,ws,s.plane,inc);
          arc=arcByIJ(start,target,c,s.plane,cw);
        }else{
          diag(line,'error',`${g} cần CR=, R hoặc I/J/K để xác định tâm cung.`,g);
        }
        if(arc)addArc(start,target,arc,g,line);
      }else{
        addLinear(start,target,g,line);
      }
    }
    Object.assign(s,target);
  }

  const pts=[];
  for(const q of result.segments){
    pts.push([q.x,q.y],[q.x2,q.y2]);
    if(q.meta?.arc && q.meta.arcCenter){
      // Include arc extrema in the fit bounds.
      const m=q.meta, c=m.arcCenter, r=m.arcRadius, st=m.arcStart, sw=m.arcSweep;
      const samples=128;
      for(let k=0;k<=samples;k++){
        const a=st+sw*k/samples;
        const qx=c.x+Math.cos(a)*r,qy=c.y+Math.sin(a)*r;
        if(m.plane==='G17')pts.push([qx,qy]);
        else if(m.plane==='G18')pts.push([qx,qy]);
        else pts.push([qx,qy]);
      }
    }
  }
  if(pts.length)result.bounds={minX:Math.min(...pts.map(p=>p[0])),maxX:Math.max(...pts.map(p=>p[0])),minY:Math.min(...pts.map(p=>p[1])),maxY:Math.max(...pts.map(p=>p[1]))};
  result.totalLength=result.segments.reduce((sum,q)=>sum+(q.meta?.arc?arcLength(q.meta):Math.hypot(q.x2-q.x,q.y2-q.y)),0);
  result.state={...s};
  return result;
}
global.CNCEngine={parse,version:'4.0.0'};
})(window);

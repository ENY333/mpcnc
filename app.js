(()=>{
'use strict';
const $=s=>document.querySelector(s), code=$('#code'),canvas=$('#canvas'),ctx=canvas.getContext('2d');
const state={mode:'milling',controller:'FANUC',result:null,panX:0,panY:0,grid:false,step:0,running:false,paused:false,timer:null,autoFit:true,selectedLine:null};
const COLORS={G00:'#f87171',G01:'#38a9ff',G02:'#34d399',G03:'#f5c451'};
const unitName=()=>state.result?.state?.units==='G20'?'inch':'mm';
function lines(){return code.value.replace(/\r/g,'').split('\n')}
function updateLines(){const ls=lines();$('#lineNumbers').innerHTML=ls.map((_,i)=>`<div>${i+1}</div>`).join('');$('#metricLines').textContent=ls.length;cursor()}
function cursor(){const n=code.value.slice(0,code.selectionStart).split('\n').length;$('#cursorInfo').textContent=`Dòng ${n} / ${lines().length}`}
function fmt(v){return Number(v||0).toFixed(3)}
function fmtTime(sec){return !isFinite(sec)||sec<=0?'0:00':`${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`}
function parse(){
 clearInterval(state.timer);state.running=false;state.paused=false;state.result=CNCEngine.parse(code.value,{mode:state.mode,controller:state.controller});state.step=0;
 if(state.autoFit){state.zoom=1;state.panX=0;state.panY=0}
 const r=state.result,s=r.state,u=unitName();$('#metricLength').textContent=fmt(r.totalLength)+' '+u;$('#metricTime').textContent=s.f>0?fmtTime(r.totalLength/s.f*60):'0:00';
 ['x','y','z'].forEach(k=>{$('#m'+k).textContent=fmt(s[k]);$('#'+k+'Pos').textContent=fmt(s[k])});$('#mf').textContent=fmt(s.f);$('#ms').textContent=fmt(s.spindle);$('#mt').textContent=s.tool;
 $('#modeBadge').textContent=`${state.mode==='turning'?'TIỆN':'PHAY'} • ${s.plane} • ${s.distance} • ${u}`;$('#controllerBadge').textContent=state.controller;$('#statusText').textContent=r.errors.length?`Có ${r.errors.length} lỗi • xem Kiểm tra G-code`:`Sẵn sàng • ${r.segments.length} đoạn`;draw();diagnostics();
}
function diagnostics(){const d=state.result?.diagnostics||[];$('#diagCount').textContent=d.length;$('#diagList').innerHTML=d.length?d.slice(-40).map(x=>`<button class="diag ${x.severity}" data-line="${x.line}"><b>L${x.line}</b> ${escapeHtml(x.message)} ${x.code?`<span>${x.code}</span>`:''}</button>`).join(''):'<div class="diag empty">Không có cảnh báo</div>';$('#diagList').querySelectorAll('[data-line]').forEach(b=>b.onclick=()=>gotoLine(Number(b.dataset.line)))}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function gotoLine(n){const ls=lines();let pos=0;for(let i=1;i<n;i++)pos+=ls[i-1].length+1;code.focus();code.setSelectionRange(pos,pos+ls[n-1]?.length||pos);const lh=parseFloat(getComputedStyle(code).lineHeight)||18;code.scrollTop=Math.max(0,(n-4)*lh);$('#lineNumbers').scrollTop=code.scrollTop;state.selectedLine=n;draw()}
function resize(){const r=canvas.getBoundingClientRect(),d=devicePixelRatio||1;canvas.width=Math.max(1,r.width*d);canvas.height=Math.max(1,r.height*d);ctx.setTransform(d,0,0,d,0,0);draw()}
function world(x,y){
  const w=canvas.clientWidth,h=canvas.clientHeight,b=state.result?.bounds;
  if(!b)return[70,h-55];
  // Reserve a clean drafting border for dimensions: top and left for
  // overall dimensions, while keeping the real X0/Y0 visible.
  const padL=Math.min(92,Math.max(58,w*.13)), padR=24, padT=64, padB=54;
  const sx=Math.max(1,b.maxX-b.minX),sy=Math.max(1,b.maxY-b.minY);
  const scale=Math.max(.001,Math.min((w-padL-padR)/sx,(h-padT-padB)/sy));
  const usedW=sx*scale,usedH=sy*scale;
  const left=padL+(w-padL-padR-usedW)/2;
  const top=padT+(h-padT-padB-usedH)/2;
  return[left+(x-b.minX)*scale,top+usedH-(y-b.minY)*scale];
}
function niceStep(span){
  const target=Math.max(1,span/7);
  const p=Math.pow(10,Math.floor(Math.log10(target)));
  const n=target/p;
  return (n<=1?1:n<=2?2:n<=5?5:10)*p;
}
function trimNum(v){
  if(Math.abs(v)<1e-9)v=0;
  return Number(v.toFixed(3)).toString();
}
function collectAxisTicks(axis){
  const r=state.result,b=r?.bounds;if(!r||!b)return[0];
  const lo=Math.min(0,axis==='x'?b.minX:b.minY),hi=Math.max(0,axis==='x'?b.maxX:b.maxY);
  const step=niceStep(Math.max(1,hi-lo)),out=[];
  for(let v=Math.ceil(lo/step)*step;v<=hi+step*.001;v+=step)out.push(Number(v.toFixed(6)));
  if(!out.some(v=>Math.abs(v)<1e-8))out.unshift(0);
  return[...new Set(out)].sort((a,b)=>a-b);
}
function drawArrowHead(x,y,angle,size=5){
  ctx.beginPath();ctx.moveTo(x,y);
  ctx.lineTo(x-size*Math.cos(angle-Math.PI/6),y-size*Math.sin(angle-Math.PI/6));
  ctx.lineTo(x-size*Math.cos(angle+Math.PI/6),y-size*Math.sin(angle+Math.PI/6));
  ctx.closePath();ctx.fill();
}
function measureTextBox(text,x,y,angle=0,font='10px Consolas, monospace'){
  ctx.save();ctx.font=font;const m=ctx.measureText(text),w=m.width+8,h=16;
  ctx.restore();
  // conservative AABB for rotated text
  const c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
  return{x:x-(w*c+h*s)/2,y:y-(w*s+h*c)/2,w:w*c+h*s,h:w*s+h*c};
}
function drawDimText(text,x,y,angle=0){
  ctx.save();ctx.font='10px Consolas, monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.translate(x,y);ctx.rotate(angle);
  const m=ctx.measureText(text),w=m.width+8,h=16;
  ctx.fillStyle='rgba(8,13,18,.96)';ctx.fillRect(-w/2,-h/2,w,h);
  ctx.fillStyle='#e1e8ef';ctx.fillText(text,0,0);ctx.restore();
  return measureTextBox(text,x,y,angle);
}
function rectOverlap(a,b,g=5){return !(a.x+a.w+g<b.x||b.x+b.w+g<a.x||a.y+a.h+g<b.y||b.y+b.h+g<a.y)}
function draftDim(x1,y1,x2,y2,label,offset=18,vertical=false){
  const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(len<18)return null;
  const nx=-dy/len,ny=dx/len;
  const ax=x1+nx*offset,ay=y1+ny*offset,bx=x2+nx*offset,by=y2+ny*offset;
  ctx.save();ctx.strokeStyle='rgba(213,222,231,.72)';ctx.fillStyle='#dbe4ec';ctx.lineWidth=1;ctx.setLineDash([]);
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(ax,ay);ctx.moveTo(x2,y2);ctx.lineTo(bx,by);ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
  const ang=Math.atan2(by-ay,bx-ax);drawArrowHead(ax,ay,ang,4.5);drawArrowHead(bx,by,ang+Math.PI,4.5);
  const textAngle=vertical?-Math.PI/2:0;
  const box=drawDimText(label,(ax+bx)/2,(ay+by)/2,textAngle);
  ctx.restore();return box;
}
function drawDimensions(w,h){
  const r=state.result,b=r?.bounds;if(!r||!b)return;
  const spanX=b.maxX-b.minX,spanY=b.maxY-b.minY;if(spanX<=0&&spanY<=0)return;
  ctx.save();ctx.setLineDash([]);ctx.font='10px Consolas, monospace';
  const origin=world(0,0);
  // Axes get clean coordinate ticks only; feature dimensions live outside the contour.
  const xVals=collectAxisTicks('x'),yVals=collectAxisTicks('y');
  const ox=Math.max(10,Math.min(w-10,origin[0])),oy=Math.max(10,Math.min(h-10,origin[1]));
  ctx.strokeStyle='#536577';ctx.fillStyle='#899bad';
  for(const v of xVals){const q=world(v,0)[0];if(q<12||q>w-12)continue;ctx.beginPath();ctx.moveTo(q,oy-3);ctx.lineTo(q,oy+3);ctx.stroke();ctx.textAlign='center';ctx.fillText(trimNum(v),q,Math.min(h-3,oy+14));}
  for(const v of yVals){const q=world(0,v)[1];if(q<12||q>h-12)continue;ctx.beginPath();ctx.moveTo(ox-3,q);ctx.lineTo(ox+3,q);ctx.stroke();ctx.textAlign='left';ctx.fillText(trimNum(v),Math.min(w-28,ox+7),q-4);}

  // Engineering drawing style: dimensions are arranged in separate lanes,
  // never stacked on the contour itself.
  const occupied=[];
  const place=(box)=>{if(!box)return false;if(box.x<2||box.y<2||box.x+box.w>w-2||box.y+box.h>h-2)return false;if(occupied.some(o=>rectOverlap(o,box)))return false;occupied.push(box);return true};
  const topBase=world(b.minX,b.maxY)[1];
  const leftBase=world(b.minX,b.minY)[0];

  if(spanX>1e-7){
    const p1=world(b.minX,b.maxY),p2=world(b.maxX,b.maxY);
    for(const off of [-26,-40,-54,-68]){
      const box=draftDim(p1[0],p1[1],p2[0],p2[1],`X ${trimNum(spanX)}`,off,false);if(place(box))break;
    }
  }
  if(spanY>1e-7){
    const p1=world(b.minX,b.minY),p2=world(b.minX,b.maxY);
    for(const off of [-28,-44,-60,-76]){
      const box=draftDim(p1[0],p1[1],p2[0],p2[1],`Y ${trimNum(spanY)}`,off,true);if(place(box))break;
    }
  }

  const segments=r.segments||[];let count=0;
  // Track dimension lanes separately. This is much closer to conventional drafting:
  // horizontal dimensions use horizontal lanes, vertical dimensions use vertical lanes.
  let hLane=0,vLane=0,arcLane=0;
  for(const s of segments){
    if(count>=80||s.rapid||s.g==='G00')continue;
    const dx=Number(s.x2)-Number(s.x),dy=Number(s.y2)-Number(s.y);
    const px=Math.abs(dx),py=Math.abs(dy);if(!Number.isFinite(px)||!Number.isFinite(py)||(px<1e-7&&py<1e-7))continue;
    const a=world(s.x,s.y),bb=world(s.x2,s.y2);
    if(s.meta?.arc){
      const m=s.meta,rr=Number(m.arcRadius);if(!Number.isFinite(rr)||rr<=0)continue;
      const c=m.arcCenter,sp=m.arcStartPoint,sw=Number(m.arcSweep)||0;
      const st=Number(m.arcStart)||Math.atan2(sp.y-c.y,sp.x-c.x),mid=st+sw/2;
      const q=world(c.x+Math.cos(mid)*rr,c.y+Math.sin(mid)*rr);
      const cp=world(c.x,c.y),ang=Math.atan2(q[1]-cp[1],q[0]-cp[0]);
      const ex=q[0]+Math.cos(ang)*(20+arcLane*16),ey=q[1]+Math.sin(ang)*(20+arcLane*16);
      ctx.strokeStyle='rgba(213,222,231,.72)';ctx.fillStyle='#dbe4ec';ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(ex,ey);ctx.stroke();drawArrowHead(q[0],q[1],ang+Math.PI,4.5);
      const box=drawDimText(`R ${trimNum(rr)}`,ex,ey,0);if(place(box))arcLane++;continue;
    }
    let placed=false;
    if(py<1e-7&&px>=2){
      const off=(dx>=0?-1:1)*(18+(hLane%4)*16);
      const box=draftDim(a[0],a[1],bb[0],bb[1],`X ${trimNum(px)}`,off,false);if(place(box)){placed=true;hLane++;}
    }else if(px<1e-7&&py>=2){
      const off=(dx>=0?1:-1)*(18+(vLane%4)*16);
      const box=draftDim(a[0],a[1],bb[0],bb[1],`Y ${trimNum(py)}`,off,true);if(place(box)){placed=true;vLane++;}
    }else{
      // Diagonal = two orthogonal projections, not a diagonal length.
      if(px>=2){
        const yy=Math.max(a[1],bb[1])+14+(hLane%4)*16;
        const box=draftDim(a[0],yy,bb[0],yy,`X ${trimNum(px)}`,0,false);if(place(box)){placed=true;hLane++;}
      }
      if(py>=2){
        const xx=Math.max(a[0],bb[0])+14+(vLane%4)*16;
        const box=draftDim(xx,a[1],xx,bb[1],`Y ${trimNum(py)}`,0,true);if(place(box)){placed=true;vLane++;}
      }
    }
    if(placed)count++;
  }
  ctx.restore();
}
function axes(w,h){
  const p=world(0,0),b=state.result?.bounds;if(!b)return;
  ctx.save();ctx.strokeStyle='#344656';ctx.fillStyle='#718398';ctx.lineWidth=1;ctx.setLineDash([]);ctx.font='9px Consolas, monospace';
  if(p[1]>=0&&p[1]<=h){ctx.beginPath();ctx.moveTo(0,p[1]);ctx.lineTo(w,p[1]);ctx.stroke()}
  if(p[0]>=0&&p[0]<=w){ctx.beginPath();ctx.moveTo(p[0],0);ctx.lineTo(p[0],h);ctx.stroke()}
  if(p[0]>=0&&p[0]<=w&&p[1]>=0&&p[1]<=h){
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p[0],p[1],4,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#38a9ff';ctx.beginPath();ctx.moveTo(p[0]-9,p[1]);ctx.lineTo(p[0]+9,p[1]);ctx.moveTo(p[0],p[1]-9);ctx.lineTo(p[0],p[1]+9);ctx.stroke();
    ctx.fillStyle='#b8c7d5';ctx.fillText(state.mode==='turning'?'X0 Z0':'X0 Y0',p[0]+9,p[1]-8);
  }
  ctx.fillStyle='#8da0b4';ctx.fillText('X',w-18,Math.max(12,Math.min(h-5,p[1]-6)));ctx.fillText(state.mode==='turning'?'Z':'Y',Math.min(w-12,Math.max(4,p[0]+6)),12);
  ctx.restore();
}
function draw(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle='#080d12';ctx.fillRect(0,0,w,h);
  const r=state.result;
  if(!r){return}

  // Render each CNC move. Arcs are reconstructed from the CNC engine's
  // machine-space center/start/sweep and then projected point-by-point.
  // This avoids Canvas clockwise/anticlockwise ambiguity caused by the
  // screen Y axis being inverted relative to CNC coordinates.
  let i=0;
  while(i<r.segments.length){
    const s=r.segments[i];
    const selected=state.selectedLine===s.line;
    ctx.strokeStyle=selected?'#ffffff':(COLORS[s.g]||'#8290a1');
    ctx.lineWidth=selected?2.7:1.65;
    ctx.setLineDash(s.rapid?[6,5]:[]);

    if(s.meta?.arc && s.meta.arcCenter && s.meta.arcStartPoint){
      const m=s.meta;
      const radius=Number(m.arcRadius)||Math.hypot(m.arcStartPoint.x-m.arcCenter.x,m.arcStartPoint.y-m.arcCenter.y);
      const sweep=Number(m.arcSweep)||0;
      const start=Number(m.arcStart)||Math.atan2(m.arcStartPoint.y-m.arcCenter.y,m.arcStartPoint.x-m.arcCenter.x);
      const steps=Math.max(12,Math.min(720,Math.ceil(Math.abs(sweep)*radius/1.5)));

      ctx.beginPath();
      for(let k=0;k<=steps;k++){
        const a=start+sweep*(k/steps);
        const wx=m.arcCenter.x+Math.cos(a)*radius;
        const wy=m.arcCenter.y+Math.sin(a)*radius;
        const q=world(wx,wy);
        if(k===0)ctx.moveTo(q[0],q[1]); else ctx.lineTo(q[0],q[1]);
      }
      ctx.stroke();

      // Consume all engine segments belonging to this same arc move.
      const line=s.line;
      while(i<r.segments.length && r.segments[i].line===line && r.segments[i].meta?.arc)i++;
      continue;
    }

    const a=world(s.x,s.y),b=world(s.x2,s.y2);
    ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
    if(i===state.step-1){
      ctx.setLineDash([]);ctx.fillStyle='#fff';
      ctx.beginPath();ctx.arc(b[0],b[1],4,0,Math.PI*2);ctx.fill();
    }
    i++;
  }
  ctx.setLineDash([]);
  axes(w,h);
  drawDimensions(w,h);
}
function setMode(m){state.mode=m;state.autoFit=true;$('#millingBtn').classList.toggle('active',m==='milling');$('#turningBtn').classList.toggle('active',m==='turning');$('#viewTitle').textContent=m==='turning'?'2D • LATHE VIEW (X-Z)':'2D • TOP VIEW (X-Y)';$('#viewSub').textContent=m==='turning'?'Biên dạng tiện X/Z • controller-aware':'Toolpath X/Y • live parser';$('#coordYLabel').textContent=m==='turning'?'Z':'Y';parse()}
function reset(){clearInterval(state.timer);state.running=false;state.paused=false;state.step=0;state.selectedLine=null;$('#metricState').textContent='Sẵn sàng';$('#statusText').textContent='Sẵn sàng • CNC Studio Web v3';draw()}
function keepCodeLineVisible(n){
  if(!n)return;
  const lh=parseFloat(getComputedStyle(code).lineHeight)||19;
  const top=(n-1)*lh;
  const bottom=top+lh;
  const viewTop=code.scrollTop;
  const viewBottom=viewTop+code.clientHeight;
  const margin=lh*3;
  if(top<viewTop+margin) code.scrollTop=Math.max(0,top-margin);
  else if(bottom>viewBottom-margin) code.scrollTop=Math.max(0,bottom-code.clientHeight+margin);
  $('#lineNumbers').scrollTop=code.scrollTop;
}
function run(){parse();if(!state.result.segments.length)return;state.running=true;state.paused=false;state.step=0;state.selectedLine=null;$('#metricState').textContent='Đang chạy';$('#statusText').textContent='Đang mô phỏng G-code';clearInterval(state.timer);state.timer=setInterval(()=>{if(state.paused)return;state.step++;const seg=state.result.segments[state.step-1];state.selectedLine=seg?.line||null;if(state.selectedLine)keepCodeLineVisible(state.selectedLine);draw();if(state.step>=state.result.segments.length){clearInterval(state.timer);state.running=false;$('#metricState').textContent='Hoàn tất';$('#statusText').textContent='Mô phỏng hoàn tất'}},30)}
function dl(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
code.addEventListener('input',()=>{state.autoFit=true;updateLines();$('#dirty').textContent='● Chưa lưu';parse()});code.addEventListener('keyup',cursor);code.addEventListener('click',cursor);code.addEventListener('scroll',()=>$('#lineNumbers').scrollTop=code.scrollTop);
$('#controller').onchange=e=>{state.controller=e.target.value;state.autoFit=true;parse()};$('#runBtn').onclick=run;$('#pauseBtn').onclick=()=>{state.paused=!state.paused;$('#metricState').textContent=state.paused?'Tạm dừng':'Đang chạy'};$('#stopBtn').onclick=reset;$('#resetBtn').onclick=reset;$('#stepBtn').onclick=()=>{if(!state.result)parse();state.step=Math.min(state.step+1,state.result.segments.length);state.selectedLine=state.result.segments[state.step-1]?.line||null;if(state.selectedLine)keepCodeLineVisible(state.selectedLine);$('#metricState').textContent='Bước';draw()};$('#millingBtn').onclick=()=>setMode('milling');$('#turningBtn').onclick=()=>setMode('turning');$('#fitBtn').onclick=()=>{state.autoFit=true;state.panX=0;state.panY=0;parse()};$('#newBtn').onclick=()=>{code.value='';updateLines();reset();state.autoFit=true;parse()};$('#saveBtn').onclick=()=>dl(state.mode==='turning'?'turning.nc':'program.nc',code.value);$('#openBtn').onclick=()=>$('#fileInput').click();$('#fileInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{code.value=r.result;updateLines();state.autoFit=true;parse();$('#dirty').textContent='● Đã tải '+f.name};r.readAsText(f)};
let drag=false,lx=0,ly=0;canvas.addEventListener('pointerdown',e=>{if(!(e.button===1||e.button===2||e.shiftKey||e.ctrlKey))return;e.preventDefault();state.autoFit=false;drag=true;lx=e.clientX;ly=e.clientY;canvas.classList.add('panning')});window.addEventListener('pointerup',()=>{drag=false;canvas.classList.remove('panning')});window.addEventListener('pointermove',e=>{if(!drag)return;state.panX+=e.clientX-lx;state.panY+=e.clientY-ly;lx=e.clientX;ly=e.clientY;draw()});canvas.oncontextmenu=e=>e.preventDefault();canvas.addEventListener('dblclick',()=>{$('#fitBtn').click()});window.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();$('#saveBtn').click()}if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();run()}if(e.key==='F5'){e.preventDefault();parse()}});new ResizeObserver(resize).observe($('.canvas-wrap'));updateLines();parse();resize();
})();

// Menu-only UI: map menu actions to the existing simulator controls.
(()=>{
  const q=s=>document.querySelector(s);
  const map=(a,b)=>{const x=q(a),y=q(b);if(x&&y)x.onclick=()=>y.click()};
  map('#mNew','#newBtn');map('#mOpen','#openBtn');map('#mSave','#saveBtn');map('#mClear','#newBtn');
  map('#mReset','#resetBtn');map('#mFit','#fitBtn');map('#mMilling','#millingBtn');map('#mTurning','#turningBtn');
  map('#mRun','#runBtn');map('#mPause','#pauseBtn');map('#mStop','#stopBtn');map('#mStep','#stepBtn');map('#mCheck','#mFit');
  const btns=[...document.querySelectorAll('.menu-btn')],drops=[...document.querySelectorAll('.dropdown')];
  btns.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const id='menu-'+b.dataset.menu;drops.forEach(d=>d.classList.toggle('open',d.id===id&&!d.classList.contains('open')));btns.forEach(x=>x.classList.toggle('active',x===b&&q('#'+id)?.classList.contains('open')))}));
  document.addEventListener('click',()=>{drops.forEach(d=>d.classList.remove('open'));btns.forEach(b=>b.classList.remove('active'))});
})();

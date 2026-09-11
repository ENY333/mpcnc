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
function world(x,y){const w=canvas.clientWidth,h=canvas.clientHeight,b=state.result?.bounds;if(!b)return[30,h-30];const pad=46,sx=Math.max(1,b.maxX-b.minX),sy=Math.max(1,b.maxY-b.minY),scale=Math.max(.001,Math.min((w-pad*2)/sx,(h-pad*2)/sy));return[pad+(x-b.minX)*scale+state.panX,h-pad-(y-b.minY)*scale+state.panY]}
function niceStep(span){
  const target=Math.max(1,span/8);
  const p=Math.pow(10,Math.floor(Math.log10(target)));
  const n=target/p;
  return (n<=1?1:n<=2?2:n<=5?5:10)*p;
}
function trimNum(v){
  if(Math.abs(v)<1e-9)v=0;
  return Number(v.toFixed(3)).toString();
}
function collectAxisTicks(axis){
  const r=state.result, b=r?.bounds;
  if(!r||!b) return [0];
  const lo=axis==='x'?Math.min(0,b.minX):Math.min(0,b.minY);
  const hi=axis==='x'?Math.max(0,b.maxX):Math.max(0,b.maxY);
  const span=Math.max(1,hi-lo), step=niceStep(span/7);
  const out=[];
  const first=Math.ceil(lo/step)*step;
  for(let v=first;v<=hi+step*.001;v+=step) out.push(Number(v.toFixed(6)));
  if(!out.some(v=>Math.abs(v)<1e-8)) out.unshift(0);
  return [...new Set(out.map(v=>Number(v.toFixed(6))))].sort((a,b)=>a-b);
}
function drawArrowHead(x,y,angle,size=5){
  ctx.beginPath();
  ctx.moveTo(x,y);
  ctx.lineTo(x-size*Math.cos(angle-Math.PI/6),y-size*Math.sin(angle-Math.PI/6));
  ctx.lineTo(x-size*Math.cos(angle+Math.PI/6),y-size*Math.sin(angle+Math.PI/6));
  ctx.closePath();ctx.fill();
}
function labelBox(text,x,y,angle=0,small=false){
  ctx.save();
  ctx.font=(small?'9px':'10px')+' Consolas, monospace';
  const m=ctx.measureText(text), padX=4,padY=3;
  ctx.translate(x,y);ctx.rotate(angle);
  ctx.fillStyle='rgba(8,13,18,.94)';
  ctx.fillRect(-m.width/2-padX,-7-padY,m.width+padX*2,14+padY*2);
  ctx.fillStyle='#d4dde7';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,0,0);
  ctx.restore();
  return {x:x-m.width/2-padX,y:y-7-padY,w:m.width+padX*2,h:14+padY*2};
}
function rectOverlap(a,b,g=4){
  return !(a.x+a.w+g<b.x||b.x+b.w+g<a.x||a.y+a.h+g<b.y||b.y+b.h+g<a.y);
}
function drawDimLine(x1,y1,x2,y2,label,offset=14,verticalText=false){
  const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
  if(len<24)return null;
  const nx=-dy/len,ny=dx/len;
  const ax=x1+nx*offset,ay=y1+ny*offset,bx=x2+nx*offset,by=y2+ny*offset;
  ctx.strokeStyle='rgba(195,208,221,.72)';ctx.fillStyle='#cbd6e1';ctx.lineWidth=1;ctx.setLineDash([]);
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(ax,ay);ctx.moveTo(x2,y2);ctx.lineTo(bx,by);ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
  const ang=Math.atan2(by-ay,bx-ax);
  drawArrowHead(ax,ay,ang,4.5);drawArrowHead(bx,by,ang+Math.PI,4.5);
  let textAng=0;
  if(verticalText) textAng=-Math.PI/2;
  return labelBox(label,(ax+bx)/2,(ay+by)/2,textAng,true);
}
function drawDimensions(w,h){
  const r=state.result,b=r?.bounds;if(!r||!b)return;
  ctx.save();ctx.setLineDash([]);
  const origin=world(0,0);
  ctx.font='9px Consolas, monospace';

  // Clean axis dimensions: a small number of engineering-style ticks rather than
  // printing every coordinate value on top of one another.
  const xVals=collectAxisTicks('x'),yVals=collectAxisTicks('y');
  const ox=(origin[0]>=0&&origin[0]<=w)?origin[0]:Math.max(24,Math.min(w-24,46));
  const oy=(origin[1]>=0&&origin[1]<=h)?origin[1]:Math.max(24,Math.min(h-24,h-30));
  for(const v of xVals){
    const q=world(v,0)[0]; if(q<14||q>w-14)continue;
    const base=oy;ctx.strokeStyle='#536577';ctx.fillStyle='#93a4b6';
    ctx.beginPath();ctx.moveTo(q,base-4);ctx.lineTo(q,base+4);ctx.stroke();
    const txt=trimNum(v),tw=ctx.measureText(txt).width;
    ctx.fillText(txt,Math.max(2,Math.min(w-tw-2,q-tw/2)),Math.min(h-4,base+15));
  }
  for(const v of yVals){
    const q=world(0,v)[1]; if(q<14||q>h-14)continue;
    const base=ox;ctx.strokeStyle='#536577';ctx.fillStyle='#93a4b6';
    ctx.beginPath();ctx.moveTo(base-4,q);ctx.lineTo(base+4,q);ctx.stroke();
    const txt=trimNum(v),tw=ctx.measureText(txt).width;
    ctx.fillText(txt,Math.min(w-tw-2,base+8),Math.max(10,q-5));
  }

  // Dimension labels are collision-checked and placed outside the toolpath.
  const occupied=[];
  const place=(box)=>{if(!box)return false;if(box.x<2||box.y<2||box.x+box.w>w-2||box.y+box.h>h-2)return false;if(occupied.some(o=>rectOverlap(o,box)))return false;occupied.push(box);return true};

  // Overall X/Y dimensions. These are always the first/most important labels.
  if(b.maxX-b.minX>1e-7){
    const p1=world(b.minX,b.maxY),p2=world(b.maxX,b.maxY);
    for(const off of [22,34,46]){const box=drawDimLine(p1[0],p1[1],p2[0],p2[1],`X ${trimNum(b.maxX-b.minX)}`,off);if(place(box))break;}
  }
  if(b.maxY-b.minY>1e-7){
    const p1=world(b.minX,b.minY),p2=world(b.minX,b.maxY);
    for(const off of [22,34,46]){const box=drawDimLine(p1[0],p1[1],p2[0],p2[1],`Y ${trimNum(b.maxY-b.minY)}`,off,true);if(place(box))break;}
  }

  let shown=0;
  for(const s of r.segments){
    if(shown>80)break;
    if(s.rapid||s.g==='G00')continue;
    const dx=Number(s.x2)-Number(s.x),dy=Number(s.y2)-Number(s.y),len=Math.hypot(dx,dy);
    if(!Number.isFinite(len)||len<1e-7)continue;
    const a=world(s.x,s.y),bb=world(s.x2,s.y2);
    if(a[0]<-30||a[0]>w+30||a[1]<-30||a[1]>h+30||bb[0]<-30||bb[0]>w+30||bb[1]<-30||bb[1]>h+30)continue;

    if(s.meta?.arc){
      const m=s.meta, rr=Number(m.arcRadius);
      if(!Number.isFinite(rr))continue;
      const center=m.arcCenter;
      const start=Number(m.arcStart)||Math.atan2(m.arcStartPoint.y-center.y,m.arcStartPoint.x-center.x);
      const sweep=Number(m.arcSweep)||0;
      const mid=start+sweep/2;
      const q=world(center.x+Math.cos(mid)*rr,center.y+Math.sin(mid)*rr);
      const label=`R ${trimNum(rr)}`;
      let placed=false;
      for(const off of [0,16,28]){
        const angle=Math.atan2(q[1]-world(center.x,center.y)[1],q[0]-world(center.x,center.y)[0]);
        const x=q[0]+Math.cos(angle)*off,y=q[1]+Math.sin(angle)*off;
        const box=labelBox(label,x,y,0,true); if(place(box)){placed=true;break;}
      }
      if(placed)shown++;
      continue;
    }

    // For straight moves use the conventional X/Y dimension for axis-aligned
    // cuts. Diagonal cuts get one uncluttered true-length dimension.
    const px=Math.abs(dx),py=Math.abs(dy);
    if(Math.max(px,py)<2)continue;
    let placed=false;
    if(px>1e-7&&py<1e-7){
      for(const off of [12,20,30]){const box=drawDimLine(a[0],a[1],bb[0],bb[1],`X ${trimNum(px)}`,off);if(place(box)){placed=true;break;}}
    }else if(py>1e-7&&px<1e-7){
      for(const off of [12,20,30]){const box=drawDimLine(a[0],a[1],bb[0],bb[1],`Y ${trimNum(py)}`,off,true);if(place(box)){placed=true;break;}}
    }else if(len>12){
      // Diagonal moves are NOT dimensioned by their diagonal length.
      // Show the horizontal and vertical components, like a technical drawing.
      // This keeps the dimension tied to the actual X/Y travel in the G-code.
      const x1=a[0], y1=a[1], x2=bb[0], y2=bb[1];
      const minX=Math.min(x1,x2), maxX=Math.max(x1,x2);
      const minY=Math.min(y1,y2), maxY=Math.max(y1,y2);
      if(px>=2){
        const yy=Math.max(y1,y2)+12;
        const box=drawDimLine(minX,yy,maxX,yy,`X ${trimNum(px)}`,0);
        if(place(box)) placed=true;
      }
      if(py>=2){
        const xx=Math.max(x1,x2)+12;
        const box=drawDimLine(xx,minY,xx,maxY,`Y ${trimNum(py)}`,0,true);
        if(place(box)) placed=true;
      }
    }
    if(placed)shown++;
  }
  ctx.restore();
}
function axes(w,h){
  const p=world(0,0);
  const b=state.result?.bounds;
  if(!b)return;
  ctx.save();
  ctx.strokeStyle='#344656';ctx.fillStyle='#718398';ctx.lineWidth=1;ctx.setLineDash([]);ctx.font='9px Consolas, monospace';
  if(p[1]>=0&&p[1]<=h){ctx.beginPath();ctx.moveTo(0,p[1]);ctx.lineTo(w,p[1]);ctx.stroke()}
  if(p[0]>=0&&p[0]<=w){ctx.beginPath();ctx.moveTo(p[0],0);ctx.lineTo(p[0],h);ctx.stroke()}
  if(p[0]>=0&&p[0]<=w&&p[1]>=0&&p[1]<=h){
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(p[0],p[1],3,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#38a9ff';ctx.beginPath();ctx.moveTo(p[0]-9,p[1]);ctx.lineTo(p[0]+9,p[1]);ctx.moveTo(p[0],p[1]-9);ctx.lineTo(p[0],p[1]+9);ctx.stroke();
    ctx.fillStyle='#a3b3c3';ctx.fillText(state.mode==='turning'?'X0 Z0':'X0 Y0',p[0]+9,p[1]-8);
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

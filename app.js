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
function collectAxisValues(axis){
  const r=state.result;
  if(!r) return [0];
  const vals=[0];
  for(const s of r.segments||[]){
    const a=axis==='x' ? s.x : s.y;
    const b=axis==='x' ? s.x2 : s.y2;
    if(Number.isFinite(a)) vals.push(a);
    if(Number.isFinite(b)) vals.push(b);
    if(s.meta?.arc && s.meta.arcCenter){
      const c=axis==='x' ? s.meta.arcCenter.x : s.meta.arcCenter.y;
      if(Number.isFinite(c)) vals.push(c);
    }
  }
  return [...new Set(vals.map(v=>Number(v.toFixed(6))))].sort((a,b)=>a-b);
}
function drawArrowHead(x,y,angle,size=5){
  ctx.beginPath();
  ctx.moveTo(x,y);
  ctx.lineTo(x-size*Math.cos(angle-Math.PI/6),y-size*Math.sin(angle-Math.PI/6));
  ctx.lineTo(x-size*Math.cos(angle+Math.PI/6),y-size*Math.sin(angle+Math.PI/6));
  ctx.closePath();ctx.fill();
}
function drawDimLine(x1,y1,x2,y2,label,offset=14){
  const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);
  if(len<8)return;
  const nx=-dy/len,ny=dx/len;
  const ax=x1+nx*offset,ay=y1+ny*offset,bx=x2+nx*offset,by=y2+ny*offset;
  ctx.strokeStyle='rgba(190,205,220,.72)';ctx.fillStyle='#c8d3df';ctx.lineWidth=1;ctx.setLineDash([]);
  ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(ax,ay);ctx.moveTo(x2,y2);ctx.lineTo(bx,by);ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
  const ang=Math.atan2(by-ay,bx-ax);
  drawArrowHead(ax,ay,ang,4);drawArrowHead(bx,by,ang+Math.PI,4);
  ctx.font='9px Consolas, monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  const tx=(ax+bx)/2,ty=(ay+by)/2;
  const pad=3;
  const m=ctx.measureText(label);ctx.fillStyle='#080d12';ctx.fillRect(tx-m.width/2-pad,ty-6-pad,m.width+pad*2,12+pad*2);
  ctx.fillStyle='#c8d3df';ctx.fillText(label,tx,ty);
  ctx.textAlign='start';ctx.textBaseline='alphabetic';
}
function drawDimensions(w,h){
  const r=state.result,b=r?.bounds;if(!r||!b)return;
  ctx.save();
  ctx.setLineDash([]);
  // Show every coordinate value actually present in the G-code on the axes.
  const xVals=collectAxisValues('x'),yVals=collectAxisValues('y');
  const origin=world(0,0);
  ctx.font='9px Consolas, monospace';
  for(const v of xVals){
    const q=world(v,0)[0];
    if(q<8||q>w-8)continue;
    const base=(origin[1]>=8&&origin[1]<=h-8)?origin[1]:h-22;
    ctx.strokeStyle='#536577';ctx.fillStyle='#93a4b6';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(q,base-4);ctx.lineTo(q,base+4);ctx.stroke();
    const txt=trimNum(v),tw=ctx.measureText(txt).width;
    ctx.fillText(txt,Math.max(2,Math.min(w-tw-2,q-tw/2)),Math.min(h-3,base+15));
  }
  for(const v of yVals){
    const q=world(0,v)[1];
    if(q<8||q>h-8)continue;
    const base=(origin[0]>=8&&origin[0]<=w-8)?origin[0]:22;
    ctx.strokeStyle='#536577';ctx.fillStyle='#93a4b6';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(base-4,q);ctx.lineTo(base+4,q);ctx.stroke();
    const txt=trimNum(v);ctx.fillText(txt,Math.min(w-30,base+8),Math.max(10,q-5));
  }

  // Dimension every actual XY move from the program. Linear moves get their
  // signed axis delta/length; arcs get their programmed radius (R or CR=).
  let shown=0;
  for(const s of r.segments){
    if(shown>120)break;
    const dx=Number(s.x2)-Number(s.x),dy=Number(s.y2)-Number(s.y);
    const adx=Math.abs(dx),ady=Math.abs(dy),len=Math.hypot(dx,dy);
    if(!Number.isFinite(len)||len<1e-7)continue;
    const a=world(s.x,s.y),bb=world(s.x2,s.y2);
    if(a[0]<-40||a[0]>w+40||a[1]<-40||a[1]>h+40||bb[0]<-40||bb[0]>w+40||bb[1]<-40||bb[1]>h+40)continue;
    if(s.meta?.arc){
      const rr=Number(s.meta.arcRadius);
      if(Number.isFinite(rr)){
        const mx=(a[0]+bb[0])/2,my=(a[1]+bb[1])/2;
        ctx.fillStyle='#c8d3df';ctx.font='9px Consolas, monospace';ctx.textAlign='center';ctx.textBaseline='middle';
        const label=`R${trimNum(rr)}`;
        const mw=ctx.measureText(label).width;ctx.fillStyle='#080d12';ctx.fillRect(mx-mw/2-3,my-7,mw+6,14);
        ctx.fillStyle='#c8d3df';ctx.fillText(label,mx,my);ctx.textAlign='start';ctx.textBaseline='alphabetic';shown++;
      }
      continue;
    }
    if(s.g==='G00')continue;
    // Avoid painting text on top of tiny moves; the coordinate ticks still show them.
    if(adx>=2 || ady>=2){
      if(adx>=2 && ady<0.0001) drawDimLine(a[0],a[1],bb[0],bb[1],`X ${trimNum(adx)}`,14);
      else if(ady>=2 && adx<0.0001) drawDimLine(a[0],a[1],bb[0],bb[1],`Y ${trimNum(ady)}`,14);
      else {
        const mx=(a[0]+bb[0])/2,my=(a[1]+bb[1])/2;
        ctx.fillStyle='#080d12';ctx.font='9px Consolas, monospace';
        const label=`ΔX ${trimNum(dx)}  ΔY ${trimNum(dy)}  L ${trimNum(len)}`;
        const mw=ctx.measureText(label).width;ctx.fillRect(mx-mw/2-3,my-7,mw+6,14);
        ctx.fillStyle='#c8d3df';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,mx,my);ctx.textAlign='start';ctx.textBaseline='alphabetic';
      }
      shown++;
    }
  }

  // Overall programmed extents, automatically derived from the actual path.
  const minX=b.minX,maxX=b.maxX,minY=b.minY,maxY=b.maxY;
  if(maxX-minX>0.0001){
    const p1=world(minX,maxY),p2=world(maxX,maxY);
    drawDimLine(p1[0],p1[1],p2[0],p2[1],trimNum(maxX-minX),26);
  }
  if(maxY-minY>0.0001){
    const p1=world(minX,minY),p2=world(minX,maxY);
    drawDimLine(p1[0],p1[1],p2[0],p2[1],trimNum(maxY-minY),26);
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

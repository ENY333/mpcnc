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
function viewBounds(){const b=state.result?.bounds;if(!b)return null;return {minX:Math.min(0,b.minX),maxX:Math.max(0,b.maxX),minY:Math.min(0,b.minY),maxY:Math.max(0,b.maxY)}}
function world(x,y){const w=canvas.clientWidth,h=canvas.clientHeight,b=viewBounds();if(!b)return[30,h-30];const pad=46,sx=Math.max(1e-9,b.maxX-b.minX),sy=Math.max(1e-9,b.maxY-b.minY),scale=Math.max(.001,Math.min((w-pad*2)/sx,(h-pad*2)/sy));return[pad+(x-b.minX)*scale+state.panX,h-pad-(y-b.minY)*scale+state.panY]}
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
function axes(w,h){
  const p=world(0,0);
  const b=viewBounds();
  if(!b)return;

  ctx.save();
  ctx.strokeStyle='#344656';
  ctx.fillStyle='#718398';
  ctx.lineWidth=1;
  ctx.setLineDash([]);
  ctx.font='9px Consolas, monospace';

  // Main CNC axes
  if(p[1]>=0&&p[1]<=h){
    ctx.beginPath();ctx.moveTo(0,p[1]);ctx.lineTo(w,p[1]);ctx.stroke();
  }
  if(p[0]>=0&&p[0]<=w){
    ctx.beginPath();ctx.moveTo(p[0],0);ctx.lineTo(p[0],h);ctx.stroke();
  }

  // Dimension ticks and numeric values on X axis.
  const xStep=niceStep(Math.max(1,b.maxX-b.minX));
  const x0=Math.ceil(b.minX/xStep)*xStep;
  for(let v=x0;v<=b.maxX+1e-9;v+=xStep){
    const q=world(v,0)[0];
    if(q<0||q>w)continue;
    if(p[1]>=0&&p[1]<=h){
      ctx.strokeStyle='#526576';
      ctx.beginPath();ctx.moveTo(q,p[1]-4);ctx.lineTo(q,p[1]+4);ctx.stroke();
      ctx.fillStyle='#718398';
      ctx.fillText(trimNum(v),Math.min(w-28,Math.max(2,q-8)),Math.min(h-4,p[1]+14));
    }
  }

  // Dimension ticks and numeric values on Y/Z axis.
  const yStep=niceStep(Math.max(1,b.maxY-b.minY));
  const y0=Math.ceil(b.minY/yStep)*yStep;
  for(let v=y0;v<=b.maxY+1e-9;v+=yStep){
    const q=world(0,v)[1];
    if(q<0||q>h)continue;
    if(p[0]>=0&&p[0]<=w){
      ctx.strokeStyle='#526576';
      ctx.beginPath();ctx.moveTo(p[0]-4,q);ctx.lineTo(p[0]+4,q);ctx.stroke();
      ctx.fillStyle='#718398';
      ctx.fillText(trimNum(v),Math.min(w-34,Math.max(2,p[0]+7)),Math.max(10,q-5));
    }
  }

  // Actual CNC origin marker.
  if(p[0]>=0&&p[0]<=w&&p[1]>=0&&p[1]<=h){
    ctx.fillStyle='#fff';
    ctx.beginPath();ctx.arc(p[0],p[1],3,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#38a9ff';
    ctx.beginPath();
    ctx.moveTo(p[0]-9,p[1]);ctx.lineTo(p[0]+9,p[1]);
    ctx.moveTo(p[0],p[1]-9);ctx.lineTo(p[0],p[1]+9);
    ctx.stroke();
    ctx.fillStyle='#a3b3c3';
    ctx.fillText(state.mode==='turning'?'X0 Z0':'X0 Y0',p[0]+9,p[1]-8);
  }

  ctx.fillStyle='#8da0b4';
  ctx.fillText('X',w-18,Math.max(12,Math.min(h-5,p[1]-6)));
  ctx.fillText(state.mode==='turning'?'Z':'Y',Math.min(w-12,Math.max(4,p[0]+6)),12);
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
}
function setMode(m){state.mode=m;state.autoFit=true;$('#millingBtn').classList.toggle('active',m==='milling');$('#turningBtn').classList.toggle('active',m==='turning');$('#viewTitle').textContent='2D';$('#coordYLabel').textContent=m==='turning'?'Z':'Y';parse()}
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
let drag=false,lx=0,ly=0;canvas.addEventListener('pointerdown',e=>{if(!(e.button===1||e.button===2||e.shiftKey||e.ctrlKey))return;e.preventDefault();state.autoFit=false;drag=true;lx=e.clientX;ly=e.clientY;canvas.classList.add('panning')});window.addEventListener('pointerup',()=>{drag=false;canvas.classList.remove('panning')});window.addEventListener('pointermove',e=>{if(!drag)return;state.panX+=e.clientX-lx;state.panY+=e.clientY-ly;lx=e.clientX;ly=e.clientY;draw()});canvas.oncontextmenu=e=>e.preventDefault();canvas.addEventListener('dblclick',()=>{$('#fitBtn').click()});window.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();$('#saveBtn').click()}if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();run()}if(e.key==='F5'){e.preventDefault();parse()}});new ResizeObserver(resize).observe($('.canvas-wrap'));

// Menu-driven UI: toolbar controls are intentionally hidden, but their
// original actions remain available through the compact top menu.
function closeMenus(){document.querySelectorAll('.menu-popover.open').forEach(x=>x.classList.remove('open'));document.querySelectorAll('.menu-trigger.open').forEach(x=>x.classList.remove('open'))}
document.querySelectorAll('.menu-trigger').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const id=btn.dataset.menu,box=document.getElementById(id),was=box.classList.contains('open');closeMenus();if(!was){box.classList.add('open');btn.classList.add('open')}}));
document.addEventListener('click',closeMenus);
document.querySelectorAll('.menu-popover').forEach(box=>box.addEventListener('click',e=>e.stopPropagation()));
document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>{
  const a=btn.dataset.action;
  closeMenus();
  if(a==='new') return $('#newBtn').click();
  if(a==='open') return $('#openBtn').click();
  if(a==='save') return $('#saveBtn').click();
  if(a==='selectAll'){code.focus();code.select();return}
  if(a==='clear'){code.value='';updateLines();state.autoFit=true;parse();return}
  if(a==='fit'||a==='resetView'){state.autoFit=true;state.panX=0;state.panY=0;parse();return}
  if(a==='run') return run();
  if(a==='pause') return $('#pauseBtn').click();
  if(a==='stop'||a==='reset') return reset();
  if(a==='step') return $('#stepBtn').click();
  if(a==='milling') return setMode('milling');
  if(a==='turning') return setMode('turning');
  if(a==='check'){parse();return}
  if(a==='focusError'){const d=state.result?.diagnostics||[];if(d[0]?.line)gotoLine(d[0].line);return}
  if(a==='help'){alert('G02/G03: nội suy cung. R: bán kính. CR=20: bán kính theo cú pháp CR=. I/J/K: tâm cung tương đối theo mặt phẳng đang dùng.');return}
  if(a==='shortcuts'){alert('Ctrl+S: tải G-code\nCtrl+Enter: chạy mô phỏng\nF5: phân tích lại G-code\nShift + kéo: pan khung 2D');return}
}));
updateLines();parse();resize();
})();

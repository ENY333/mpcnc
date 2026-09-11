(()=>{
'use strict';
const $=s=>document.querySelector(s),code=$('#code'),canvas=$('#canvas'),ctx=canvas.getContext('2d');
const state={mode:'milling',controller:'FANUC',result:null,step:0,autoFit:true,panX:0,panY:0,timer:null,paused:false};
const COLORS={G00:'#f87171',G01:'#38a9ff',G02:'#34d399',G03:'#f5c451'};
function lines(){return code.value.replace(/\r/g,'').split('\n')}
function fmt(v){return Number(v||0).toFixed(3)}
function updateLines(){$('#lineNumbers').innerHTML=lines().map((_,i)=>`<div>${i+1}</div>`).join('');$('#metricLines').textContent=lines().length;cursor()}
function cursor(){$('#cursorInfo').textContent=`Dòng ${code.value.slice(0,code.selectionStart).split('\n').length} / ${lines().length}`}
function parse(){
 clearInterval(state.timer);state.result=CNCEngine.parse(code.value,{mode:state.mode,controller:state.controller});
 state.step=0;const r=state.result,s=r.state;
 $('#metricLength').textContent=fmt(r.totalLength)+' '+(s.units==='G20'?'inch':'mm');
 $('#metricTime').textContent=s.f>0?`${Math.floor(r.totalLength/s.f)}:${String(Math.floor((r.totalLength/s.f*60)%60)).padStart(2,'0')}`:'0:00';
 $('#modeBadge').textContent=`${state.mode==='turning'?'TIỆN':'PHAY'} • ${s.plane} • ${s.distance} • ${s.units==='G20'?'inch':'mm'}`;
 $('#xPos').textContent=fmt(s.x);$('#yPos').textContent=fmt(state.mode==='turning'?s.z:s.y);$('#zPos').textContent=fmt(s.z);
 $('#mx').textContent=fmt(s.x);$('#my').textContent=fmt(s.y);$('#mz').textContent=fmt(s.z);$('#mf').textContent=fmt(s.f);$('#ms').textContent=fmt(s.spindle);$('#mt').textContent=s.tool;
 $('#statusText').textContent=r.errors.length?`Có ${r.errors.length} lỗi • xem Kiểm tra G-code`:`Sẵn sàng • ${r.segments.length} đoạn`;
 diagnostics();draw();
}
function diagnostics(){
 const d=state.result?.diagnostics||[];$('#diagCount').textContent=d.length;
 $('#diagList').innerHTML=d.length?d.map(x=>`<div class="diag ${x.severity}"><b>L${x.line}</b> ${x.message}</div>`).join(''):'<div class="diag empty">Không có cảnh báo</div>';
}
function resize(){const r=canvas.getBoundingClientRect(),d=devicePixelRatio||1;canvas.width=Math.max(1,r.width*d);canvas.height=Math.max(1,r.height*d);ctx.setTransform(d,0,0,d,0,0);draw()}
function world(x,y){
 const w=canvas.clientWidth,h=canvas.clientHeight,b=state.result?.bounds;if(!b)return[30,h-30];
 const spanX=Math.max(1,b.maxX-b.minX),spanY=Math.max(1,b.maxY-b.minY),scale=Math.min((w-70)/spanX,(h-70)/spanY);
 return[35+(x-b.minX)*scale+state.panX,h-35-(y-b.minY)*scale+state.panY]
}
function draw(){
 const w=canvas.clientWidth,h=canvas.clientHeight;ctx.clearRect(0,0,w,h);ctx.fillStyle='#080d12';ctx.fillRect(0,0,w,h);
 const r=state.result;if(!r)return;
 const o=world(0,0);ctx.strokeStyle='#344656';ctx.lineWidth=1;
 if(o[1]>=0&&o[1]<=h){ctx.beginPath();ctx.moveTo(0,o[1]);ctx.lineTo(w,o[1]);ctx.stroke()}
 if(o[0]>=0&&o[0]<=w){ctx.beginPath();ctx.moveTo(o[0],0);ctx.lineTo(o[0],h);ctx.stroke()}
 ctx.font='9px Consolas,monospace';ctx.fillStyle='#718398';
 const b=r.bounds||{minX:0,maxX:100,minY:0,maxY:100},sx=Math.max(1,(b.maxX-b.minX)/8),sy=Math.max(1,(b.maxY-b.minY)/8);
 for(let x=Math.ceil(b.minX/sx)*sx;x<=b.maxX;x+=sx){const q=world(x,0)[0];if(q>=0&&q<=w)ctx.fillText(Number(x.toFixed(2)),q-8,Math.min(h-4,o[1]+14))}
 for(let y=Math.ceil(b.minY/sy)*sy;y<=b.maxY;y+=sy){const q=world(0,y)[1];if(q>=0&&q<=h)ctx.fillText(Number(y.toFixed(2)),Math.min(w-30,o[0]+7),q-5)}
 ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(o[0],o[1],3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#9fb0c2';ctx.fillText(state.mode==='turning'?'X0 Z0':'X0 Y0',o[0]+8,o[1]-8);
 for(let i=0;i<r.segments.length;i++){
   const s=r.segments[i],selected=i===state.step-1;ctx.strokeStyle=selected?'#fff':(COLORS[s.g]||'#8290a1');ctx.lineWidth=selected?2.7:1.7;ctx.setLineDash(s.rapid?[6,5]:[]);
   if(s.meta?.arc){
     const m=s.meta,c=m.arcCenter,rad=m.arcRadius,start=m.arcStart,sw=m.arcSweep,steps=Math.max(16,Math.ceil(Math.abs(sw)*rad/1.5));
     ctx.beginPath();
     for(let k=0;k<=steps;k++){const a=start+sw*k/steps,q=world(c.x+Math.cos(a)*rad,c.y+Math.sin(a)*rad);if(k===0)ctx.moveTo(q[0],q[1]);else ctx.lineTo(q[0],q[1])}
     ctx.stroke();
   }else{const a=world(s.x,s.y),b2=world(s.x2,s.y2);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b2[0],b2[1]);ctx.stroke()}
 }
 ctx.setLineDash([]);
}
function setMode(m){state.mode=m;$('#millingBtn').classList.toggle('active',m==='milling');$('#turningBtn').classList.toggle('active',m==='turning');$('#viewTitle').textContent=m==='turning'?'2D • LATHE VIEW (X-Z)':'2D • TOP VIEW (X-Y)';$('#coordYLabel').textContent=m==='turning'?'Z':'Y';parse()}
function reset(){clearInterval(state.timer);state.step=0;state.paused=false;$('#metricState').textContent='Sẵn sàng';draw()}
function run(){parse();state.step=0;$('#metricState').textContent='Đang chạy';clearInterval(state.timer);state.timer=setInterval(()=>{state.step++;draw();if(state.step>=state.result.segments.length){clearInterval(state.timer);$('#metricState').textContent='Hoàn tất'}},40)}
code.addEventListener('input',()=>{$('#dirty').textContent='● Chưa lưu';updateLines();parse()});
code.addEventListener('keyup',cursor);code.addEventListener('click',cursor);code.addEventListener('scroll',()=>$('#lineNumbers').scrollTop=code.scrollTop);
$('#runBtn').onclick=run;$('#pauseBtn').onclick=()=>{state.paused=!state.paused;$('#metricState').textContent=state.paused?'Tạm dừng':'Đang chạy'};$('#stopBtn').onclick=reset;$('#resetBtn').onclick=reset;
$('#stepBtn').onclick=()=>{if(!state.result)parse();state.step=Math.min(state.step+1,state.result.segments.length);draw()};
$('#millingBtn').onclick=()=>setMode('milling');$('#turningBtn').onclick=()=>setMode('turning');$('#fitBtn').onclick=()=>{state.panX=0;state.panY=0;parse()};
$('#controller').onchange=e=>{state.controller=e.target.value;parse()};
$('#newBtn').onclick=()=>{code.value='';updateLines();parse()};
$('#saveBtn').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([code.value],{type:'text/plain'}));a.download='program.nc';a.click()};
$('#openBtn').onclick=()=>$('#fileInput').click();
$('#fileInput').onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{code.value=rd.result;updateLines();parse();};rd.readAsText(f)};
window.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();$('#saveBtn').click()}if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();run()}});
new ResizeObserver(resize).observe($('.canvas-wrap'));
updateLines();
code.value=`%
N01 G90 G54
N02 M03 S1200
N03 G00 X40 Y40 Z5 F300
N04 G01 Z-2
N05 G01 X140 Y40
N06 G01 X140 Y120
N07 G02 X140 Y80 I0 J-20
N08 G03 X140 Y40 I0 J-20
N09 G01 X40 Y40
N10 G00 Z5
N11 M05
N12 M30
%`;
updateLines();parse();resize();
})();

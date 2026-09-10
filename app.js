(() => {
"use strict";
const $ = s => document.querySelector(s);
const code = $("#code"), canvas = $("#canvas"), ctx = canvas.getContext("2d");
const state = {
  mode:"milling", zoom:1, panX:0, panY:0, grid:true, running:false, paused:false,
  step:0, segments:[], bounds:null, machine:{x:0,y:0,z:5,f:0,s:0,t:1}, timer:null
};
const colors = {G00:"#f87171",G01:"#38a9ff",G02:"#34d399",G03:"#f5c451"};

function lines(){ return code.value.replace(/\r/g,"").split("\n"); }
function updateLines(){
  const ls=lines(), box=$("#lineNumbers");
  box.innerHTML=ls.map((_,i)=>`<div>${i+1}</div>`).join("");
  $("#metricLines").textContent=ls.length;
  $("#cursorInfo").textContent=`Dòng 1 / ${ls.length}`;
}
function resizeCanvas(){
  const r=canvas.getBoundingClientRect(), d=devicePixelRatio||1;
  canvas.width=Math.max(1,r.width*d); canvas.height=Math.max(1,r.height*d); ctx.setTransform(d,0,0,d,0,0); draw();
}
function parseNum(s,k,old){
  const m=s.match(new RegExp(k+"\\s*([-+]?\\d*\\.?\\d+(?:[Ee][-+]?\\d+)?)","i"));
  return m ? parseFloat(m[1]) : old;
}
function parseProgram(){
  let x=0,y=0,z=5,f=0,s=0,t=1, mode="G90", motion="G00", total=0;
  const segs=[], warnings=[];
  for(let i=0;i<lines().length;i++){
    let raw=lines()[i], line=raw.replace(/\(.*?\)/g,"").toUpperCase();
    if(!line.trim()||line.trim()==="%") continue;
    const gm=[...line.matchAll(/\bG0*([0-3])\b/g)].map(m=>"G"+String(+m[1]).padStart(2,"0"));
    if(line.includes("G90")) mode="G90"; if(line.includes("G91")) mode="G91";
    const fm=line.match(/\bF\s*([-+]?\d*\.?\d+)/); if(fm) f=parseFloat(fm[1]);
    const sm=line.match(/\bS\s*([-+]?\d*\.?\d+)/); if(sm) s=parseFloat(sm[1]);
    const tm=line.match(/\bT\s*0*(\d+)/); if(tm) t=parseInt(tm[1]);
    if(gm.length) motion=gm[gm.length-1];
    const nx0=parseNum(line,"X",x), ny0=parseNum(line,"Y",y), nz0=parseNum(line,"Z",z);
    let nx=mode==="G91"?x+(nx0-x):nx0, ny=mode==="G91"?y+(ny0-y):ny0, nz=mode==="G91"?z+(nz0-z):nz0;
    const hasXYZ=/[XYZ]/.test(line), arc=/G0[23]/.test(line);
    if(!hasXYZ) continue;
    if(state.mode==="turning"){
      // Lathe preview uses X/Z. Y is ignored.
      ny=y; 
    }
    if(arc){
      const I=parseNum(line,"I",0), J=parseNum(line,"J",0), Rm=/\bR\s*([-+]?\d*\.?\d+)/.exec(line);
      const cx=x+I, cy=y+J, radius=Math.hypot(x-cx,y-cy);
      const start=Math.atan2(y-cy,x-cx), end=Math.atan2(ny-cy,nx-cx);
      let delta=end-start;
      if(motion==="G02" && delta>=0) delta-=Math.PI*2;
      if(motion==="G03" && delta<=0) delta+=Math.PI*2;
      const steps=Math.max(8,Math.ceil(Math.abs(delta)*radius/2));
      let px=x,py=y;
      for(let q=1;q<=steps;q++){const a=start+delta*q/steps, xx=cx+Math.cos(a)*radius, yy=cy+Math.sin(a)*radius;segs.push({x:px,y:py,x2:xx,y2:yy,z:nz,g:motion,line:i+1});total+=Math.hypot(xx-px,yy-py);px=xx;py=yy}
    }else if(hasXYZ){
      total+=Math.hypot(nx-x,ny-y,nz-z); segs.push({x,y,x2:nx,y2:ny,z:nz,g:motion,line:i+1});
    }
    x=nx;y=ny;z=nz;
  }
  state.segments=segs; state.machine={x,y,z,f,s,t}; state.bounds=getBounds(segs);
  $("#metricLength").textContent=total.toFixed(3)+" mm";
  $("#metricTime").textContent=f>0?fmtTime(total/f*60):"0:00";
  updateMachine();
  $("#emptyHint").classList.toggle("hidden",segs.length>0);
  draw();
}
function getBounds(segs){
  if(!segs.length)return null;
  const a=[]; segs.forEach(s=>a.push([s.x,s.y],[s.x2,s.y2]));
  return {minX:Math.min(...a.map(p=>p[0])),maxX:Math.max(...a.map(p=>p[0])),minY:Math.min(...a.map(p=>p[1])),maxY:Math.max(...a.map(p=>p[1]))};
}
function fmtTime(sec){if(!isFinite(sec)||sec<=0)return"0:00";return`${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,"0")}`}
function updateMachine(){
 const m=state.machine; ["x","y","z"].forEach(k=>{ $("#m"+k).textContent=m[k].toFixed(3); $("#"+k+"Pos").textContent=m[k].toFixed(3);});
 $("#mf").textContent=m.f.toFixed(0);$("#ms").textContent=m.s.toFixed(0);$("#mt").textContent=m.t;
}
function worldToScreen(x,y){
 const w=canvas.clientWidth,h=canvas.clientHeight,b=state.bounds;
 if(!b)return [w/2,h/2];
 const spanX=Math.max(10,b.maxX-b.minX), spanY=Math.max(10,b.maxY-b.minY);
 const scale=Math.min(w/(spanX*1.18),h/(spanY*1.18))*state.zoom;
 return [w/2+(x-(b.minX+b.maxX)/2)*scale+state.panX,h/2-(y-(b.minY+b.maxY)/2)*scale+state.panY];
}
function draw(){
 const w=canvas.clientWidth,h=canvas.clientHeight; ctx.clearRect(0,0,w,h);
 ctx.fillStyle="#080d12";ctx.fillRect(0,0,w,h);
 if(state.grid) drawGrid(w,h);
 if(!state.segments.length)return;
 ctx.lineWidth=1.6;
 state.segments.forEach((s,i)=>{
   const [a,b]=[worldToScreen(s.x,s.y),worldToScreen(s.x2,s.y2)];
   ctx.beginPath();ctx.strokeStyle=colors[s.g]||"#7f8c9b";ctx.setLineDash(s.g==="G00"?[5,4]:[]);
   ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
   if(i===state.step-1){ctx.setLineDash([]);ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(b[0],b[1],4,0,Math.PI*2);ctx.fill();}
 });
 ctx.setLineDash([]);
 drawAxes(w,h);
}
function drawGrid(w,h){
 const step=40;ctx.strokeStyle="#121b24";ctx.lineWidth=1;
 for(let x=0;x<w;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
 for(let y=0;y<h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
}
function drawAxes(w,h){
 ctx.strokeStyle="#273747";ctx.lineWidth=1;
 ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.stroke();
 ctx.fillStyle="#506174";ctx.font="9px Consolas";ctx.fillText(state.mode==="turning"?"Z":"X",w-14,h/2-5);ctx.fillText("Y",w/2+5,12);
}
function setMode(mode){
 state.mode=mode; $("#millingBtn").classList.toggle("active",mode==="milling");$("#turningBtn").classList.toggle("active",mode==="turning");
 $("#turningCard").style.display=mode==="turning"?"block":""; $("#viewTitle").textContent=mode==="turning"?"2D • LATHE VIEW (X-Z)":"2D • TOP VIEW (X-Y)";
 $("#viewSub").textContent=mode==="turning"?"Biên dạng tiện theo X/Z":"Toolpath theo G-code";
 $("#modeBadge").textContent=mode==="turning"?"TIỆN • G18 • G90":"PHAY • G17 • G90";
 parseProgram();
}
function download(name,text){
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/plain"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
function reset(){state.step=0;state.running=false;state.paused=false;clearInterval(state.timer);$("#metricState").textContent="Sẵn sàng";$("#statusText").textContent="Sẵn sàng • CNC Studio Web";draw()}
function run(){
 parseProgram(); if(!state.segments.length)return; state.running=true;state.paused=false;state.step=0;$("#metricState").textContent="Đang chạy";$("#statusText").textContent="Đang mô phỏng G-code";
 clearInterval(state.timer); state.timer=setInterval(()=>{if(state.paused)return;state.step++;if(state.step>state.segments.length){clearInterval(state.timer);state.running=false;$("#metricState").textContent="Hoàn tất";$("#statusText").textContent="Mô phỏng hoàn tất"}draw()},70);
}
$("#code").addEventListener("input",()=>{
  updateLines();
  $("#dirty").textContent="● Chưa lưu";
  $("#dirty").style.color="var(--yellow)";
  parseProgram(); // ĐỒNG BỘ 2D TỨC THÌ — không delay
});
$("#code").addEventListener("scroll",()=>$("#lineNumbers").scrollTop=code.scrollTop);
$("#code").addEventListener("keyup",()=>{const n=code.value.slice(0,code.selectionStart).split("\n").length;$("#cursorInfo").textContent=`Dòng ${n} / ${lines().length}`});
$("#runBtn").onclick=run;$("#pauseBtn").onclick=()=>{state.paused=!state.paused;$("#metricState").textContent=state.paused?"Tạm dừng":"Đang chạy"};
$("#stopBtn").onclick=reset;$("#resetBtn").onclick=reset;$("#stepBtn").onclick=()=>{parseProgram();state.step=Math.min(state.step+1,state.segments.length);$("#metricState").textContent="Bước";draw()};
$("#millingBtn").onclick=()=>setMode("milling");$("#turningBtn").onclick=()=>setMode("turning");
$("#fitBtn").onclick=()=>{state.zoom=1;state.panX=0;state.panY=0;draw();$("#zoomText").textContent="100%"};
$("#gridBtn").onclick=e=>{state.grid=!state.grid;e.currentTarget.classList.toggle("active",state.grid);draw()};
$("#clearBtn").onclick=()=>{state.segments=[];state.bounds=null;$("#emptyHint").classList.remove("hidden");draw()};
$("#zoomIn").onclick=()=>{state.zoom=Math.min(5,state.zoom*1.2);$("#zoomText").textContent=Math.round(state.zoom*100)+"%";draw()};
$("#zoomOut").onclick=()=>{state.zoom=Math.max(.2,state.zoom/1.2);$("#zoomText").textContent=Math.round(state.zoom*100)+"%";draw()};
$("#newBtn").onclick=()=>{code.value="%\nO0001 (New Program)\nG21\nG90\nG54\nG00 X0 Y0 Z5\nM05\nM30\n%";updateLines();reset();parseProgram()};
$("#saveBtn").onclick=()=>download("program.nc",code.value);
$("#saveAsBtn").onclick=()=>download(state.mode==="turning"?"turning.nc":"milling.nc",code.value);
$("#openBtn").onclick=()=>$("#fileInput").click();
$("#fileInput").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{code.value=r.result;updateLines();parseProgram();$("#dirty").textContent="● Đã tải "+f.name;$("#dirty").style.color="var(--green)"};r.readAsText(f)};
$("#addTab").onclick=()=>alert("Bản web hiện dùng một chương trình chính. Có thể mở rộng nhiều tab ở phiên bản sau.");
canvas.addEventListener("wheel",e=>{e.preventDefault();state.zoom=Math.max(.2,Math.min(5,state.zoom*(e.deltaY<0?1.1:.9)));$("#zoomText").textContent=Math.round(state.zoom*100)+"%";draw()},{passive:false});
let drag=false,lx=0,ly=0;
canvas.addEventListener("pointerdown",e=>{drag=true;lx=e.clientX;ly=e.clientY;canvas.classList.add("panning")});
window.addEventListener("pointerup",()=>{drag=false;canvas.classList.remove("panning")});
window.addEventListener("pointermove",e=>{if(!drag)return;state.panX+=e.clientX-lx;state.panY+=e.clientY-ly;lx=e.clientX;ly=e.clientY;draw()});
window.addEventListener("keydown",e=>{if(e.ctrlKey&&e.key.toLowerCase()==="s"){e.preventDefault();download("program.nc",code.value)}if(e.ctrlKey&&e.key==="Enter"){e.preventDefault();run()}if(e.ctrlKey&&e.key.toLowerCase()==="n"){e.preventDefault();$("#newBtn").click()}});
new ResizeObserver(resizeCanvas).observe($(".canvas-wrap"));
updateLines();setMode("milling");resizeCanvas();
})();
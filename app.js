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
  // LIVE SYNC: luôn bỏ kết quả cũ trước khi đọc code hiện tại.
  state.segments = [];
  state.bounds = null;
  state.step = 0;

  let x=0,y=0,z=5,f=0,s=0,t=1;
  let distanceMode="G90";
  let plane=state.mode==="turning" ? "G18" : "G17";
  let motion="G00", total=0;

  const segs=lines();
  for(let i=0;i<segs.length;i++){
    let line=segs[i].replace(/\(.*?\)/g,"").toUpperCase().trim();
    if(!line || line==="%") continue;

    const allG=[...line.matchAll(/\bG\s*0*([0-9]+)\b/g)].map(m=>"G"+String(+m[1]).padStart(2,"0"));
    for(const g of allG){
      if(g==="G90"||g==="G91") distanceMode=g;
      if(g==="G17"||g==="G18"||g==="G19") plane=g;
      if(["G00","G01","G02","G03"].includes(g)) motion=g;
    }

    const fm=line.match(/\bF\s*([-+]?\d*\.?\d+)/); if(fm) f=parseFloat(fm[1]);
    const sm=line.match(/\bS\s*([-+]?\d*\.?\d+)/); if(sm) s=parseFloat(sm[1]);
    const tm=line.match(/\bT\s*0*(\d+)/); if(tm) t=parseInt(tm[1]);

    const hasX=/\bX\s*[-+]?\d/.test(line);
    const hasY=/\bY\s*[-+]?\d/.test(line);
    const hasZ=/\bZ\s*[-+]?\d/.test(line);
    if(!hasX&&!hasY&&!hasZ) continue;

    const rawX=parseNum(line,"X",x);
    const rawY=parseNum(line,"Y",y);
    const rawZ=parseNum(line,"Z",z);

    const nx=distanceMode==="G91" ? x+(hasX?rawX:0) : (hasX?rawX:x);
    const ny=distanceMode==="G91" ? y+(hasY?rawY:0) : (hasY?rawY:y);
    const nz=distanceMode==="G91" ? z+(hasZ?rawZ:0) : (hasZ?rawZ:z);

    // The displayed plane is chosen from the actual CNC mode:
    // milling = X/Y (G17), turning = X/Z (G18).
    const isLathe = state.mode==="turning";
    const ax=x, ay=isLathe?z:y;
    const bx=nx, by=isLathe?nz:ny;
    const hasDisplayAxis = isLathe ? (hasX||hasZ) : (hasX||hasY);

    if(hasDisplayAxis){
      if(["G02","G03"].includes(motion)){
        // Arc preview. Milling uses I/J; lathe uses I/K.
        const ic=parseNum(line,"I",0);
        const jc=isLathe ? parseNum(line,"K",0) : parseNum(line,"J",0);
        const cx=ax+ic, cy=ay+jc;
        const radius=Math.hypot(ax-cx,ay-cy);
        if(radius>0.000001){
          const startA=Math.atan2(ay-cy,ax-cx);
          const endA=Math.atan2(by-cy,bx-cx);
          let delta=endA-startA;
          if(motion==="G02" && delta>=0) delta-=Math.PI*2;
          if(motion==="G03" && delta<=0) delta+=Math.PI*2;
          const steps=Math.max(8,Math.ceil(Math.abs(delta)*radius/2));
          let px=ax,py=ay;
          for(let q=1;q<=steps;q++){
            const a=startA+delta*q/steps;
            const xx=cx+Math.cos(a)*radius, yy=cy+Math.sin(a)*radius;
            // push one display segment
            state.segments.push({x:px,y:py,x2:xx,y2:yy,z:nz,g:motion,line:i+1});
            total+=Math.hypot(xx-px,yy-py);
            px=xx;py=yy;
          }
        }else{
          state.segments.push({x:ax,y:ay,x2:bx,y2:by,z:nz,g:motion,line:i+1});
          total+=Math.hypot(bx-ax,by-ay);
        }
      }else{
        state.segments.push({x:ax,y:ay,x2:bx,y2:by,z:nz,g:motion,line:i+1});
        total+=Math.hypot(bx-ax,by-ay);
      }
    }

    x=nx;y=ny;z=nz;
  }

  state.machine={x,y,z,f,s,t};
  state.bounds=getBounds(state.segments);

  // Modal state shown in the badge comes from the code, not a hard-coded G90/G17.
  const shownPlane = state.mode==="turning" ? "G18" : "G17";
  const actualPlane = lines().join("\n").match(/\bG\s*(17|18|19)\b/i)?.[1];
  const actualDist = lines().join("\n").match(/\bG\s*(90|91)\b/i)?.[1];
  const finalPlane = actualPlane ? "G"+actualPlane : shownPlane;
  const finalDist = actualDist ? "G"+actualDist : "G90";
  $("#modeBadge").textContent=(state.mode==="turning"?"TIỆN":"PHAY")+" • "+finalPlane+" • "+finalDist;

  $("#metricLength").textContent=total.toFixed(3)+" mm";
  $("#metricTime").textContent=f>0?fmtTime(total/f*60):"0:00";
  updateMachine();
  $("#emptyHint").classList.toggle("hidden",state.segments.length>0);

  // Fit the drawing to the available viewport after every code change.
  state.zoom=1;
  state.panX=0;
  state.panY=0;
  $("#zoomText").textContent="100%";
  draw();
}
function getBounds(segs){
  if(!segs.length)return null;
  const a=[];
  segs.forEach(s=>a.push([s.x,s.y],[s.x2,s.y2]));
  return {
    minX:Math.min(...a.map(p=>p[0])),
    maxX:Math.max(...a.map(p=>p[0])),
    minY:Math.min(...a.map(p=>p[1])),
    maxY:Math.max(...a.map(p=>p[1]))
  };
}
function fmtTime(sec){if(!isFinite(sec)||sec<=0)return"0:00";return`${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,"0")}`}
function updateMachine(){
 const m=state.machine; ["x","y","z"].forEach(k=>{ $("#m"+k).textContent=m[k].toFixed(3); $("#"+k+"Pos").textContent=m[k].toFixed(3);});
 $("#mf").textContent=m.f.toFixed(0);$("#ms").textContent=m.s.toFixed(0);$("#mt").textContent=m.t;
}
function worldToScreen(x,y){
  const w=canvas.clientWidth,h=canvas.clientHeight,b=state.bounds;
  if(!b)return [30,30];

  const pad=42;
  const spanX=Math.max(1,b.maxX-b.minX);
  const spanY=Math.max(1,b.maxY-b.minY);
  const scale=Math.min(
    (w-pad*2)/spanX,
    (h-pad*2)/spanY
  )*state.zoom;

  // Drawing frame is automatically fitted.
  // Its minimum X/Z-Y coordinate starts near the upper-left.
  return [
    pad+(x-b.minX)*scale+state.panX,
    pad+(y-b.minY)*scale+state.panY
  ];
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
  if(!state.bounds)return;
  const p=worldToScreen(0,0);

  ctx.lineWidth=1;
  ctx.strokeStyle="#314454";
  ctx.setLineDash([]);

  // X axis
  if(p[1]>=0&&p[1]<=h){
    ctx.beginPath();ctx.moveTo(0,p[1]);ctx.lineTo(w,p[1]);ctx.stroke();
  }
  // Display vertical axis:
  // milling: Y, turning: Z
  if(p[0]>=0&&p[0]<=w){
    ctx.beginPath();ctx.moveTo(p[0],0);ctx.lineTo(p[0],h);ctx.stroke();
  }

  ctx.fillStyle="#627487";
  ctx.font="9px Consolas";
  ctx.fillText(state.mode==="turning"?"Z":"Y",w-14,Math.max(11,Math.min(h-4,p[1]-5)));
  ctx.fillText("X",Math.min(w-12,Math.max(3,p[0]+5)),11);

  // Exact origin marker
  if(p[0]>=0&&p[0]<=w&&p[1]>=0&&p[1]<=h){
    ctx.fillStyle="#dbeafe";
    ctx.beginPath();ctx.arc(p[0],p[1],2.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#8290a1";ctx.fillText("0",p[0]+5,p[1]-5);
  }
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
  // Cập nhật editor ngay
  updateLines();

  // Trạng thái lưu
  $("#dirty").textContent="● Chưa lưu";
  $("#dirty").style.color="var(--yellow)";

  // Xóa kết quả cũ + phân tích code hiện tại + vẽ lại NGAY
  parseProgram();
  draw();
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
canvas.addEventListener("pointerdown",e=>{
  const canPan=e.button===1||e.button===2||e.shiftKey||e.ctrlKey;
  if(!canPan)return;
  e.preventDefault();
  drag=true;lx=e.clientX;ly=e.clientY;
  canvas.classList.add("panning");
});
window.addEventListener("pointerup",()=>{drag=false;canvas.classList.remove("panning")});
window.addEventListener("pointermove",e=>{
  if(!drag)return;
  state.panX+=e.clientX-lx;
  state.panY+=e.clientY-ly;
  lx=e.clientX;ly=e.clientY;
  draw();
});
canvas.addEventListener("contextmenu",e=>e.preventDefault());
window.addEventListener("keydown",e=>{if(e.ctrlKey&&e.key.toLowerCase()==="s"){e.preventDefault();download("program.nc",code.value)}if(e.ctrlKey&&e.key==="Enter"){e.preventDefault();run()}if(e.ctrlKey&&e.key.toLowerCase()==="n"){e.preventDefault();$("#newBtn").click()}});
new ResizeObserver(resizeCanvas).observe($(".canvas-wrap"));
updateLines();reset();setMode("milling");parseProgram();resizeCanvas();
})();
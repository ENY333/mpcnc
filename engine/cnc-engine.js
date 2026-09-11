(() => {

const $ = id => document.getElementById(id);

const code = $("code");
const lineNumbers = $("lineNumbers");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

const controller = $("controller");

let mode = "milling";
let parsed = null;
let running = false;
let paused = false;
let currentLine = 0;
let timer = null;

let view = {
  minX:0,
  maxX:100,
  minY:0,
  maxY:100,
  scale:1,
  ox:0,
  oy:0,
  panX:0,
  panY:0
};

let dragging = false;
let dragStart = null;

const defaultCode = `%\nN01 G90 G54\nN02 M03 S1200\nN03 G00 X60 Y60 Z5 F300\nN04 G01 Z-2\nN05 G01 X160 Y60\nN06 G01 X160 Y160\nN07 G01 X60 Y160\nN08 G01 X60 Y60\nN09 G01 Z5\nG01 X80 Y80\nN11 G01 Z-2\nN11 G91 G01 X30 Y10\nN12 G01 X30 Y-10\nN13 G01 X10 Y10\nN14 G01 X-10 Y20\nN15 G01 X0 Y20\nN16 G01 X-10 Y10\nN17 G02 X-40 Y0 CR=20\nN18 G01 X-10 Y-10\nN19 G01 X0 Y-20\nN20 G01 X-10 Y-20\nN21 G01 X10 Y-10\nN22 G90 G00 Z5\nN23 M05\nN24 M30\n%`;

code.value = defaultCode;

function resizeCanvas(){

  const rect = canvas.getBoundingClientRect();

  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  ctx.setTransform(dpr,0,0,dpr,0,0);

  draw();
}

function updateLineNumbers(){

  const lines = code.value.split(/\r?\n/);

  lineNumbers.innerHTML = "";

  lines.forEach((_,i)=>{

    const div = document.createElement("div");

    div.textContent = i + 1;

    if(i + 1 === currentLine){
      div.className = "active";
    }

    lineNumbers.appendChild(div);

  });

  syncLineScroll();
}

function syncLineScroll(){

  lineNumbers.scrollTop = code.scrollTop;
}

function markDirty(){

  $("dirty").textContent = "● Chưa lưu";
  $("dirty").style.color = "#f5c451";

}

function parseProgram(){

  try{

    parsed = window.CNCEngine.parse(
      code.value,
      {
        controller:controller.value,
        mode
      }
    );

  }catch(err){

    console.error(err);

    parsed = {
      segments:[],
      diagnostics:[
        {
          line:1,
          severity:"error",
          message:err.message || "Lỗi parser"
        }
      ],
      totalLength:0
    };

  }

  updateDiagnostics();
  updateMetrics();

  fitView();

  draw();

}

function updateDiagnostics(){

  const list = $("diagList");

  list.innerHTML = "";

  const diagnostics = parsed?.diagnostics || [];

  $("diagCount").textContent = diagnostics.length;

  if(!diagnostics.length){

    const empty = document.createElement("div");

    empty.className = "diag empty";
    empty.textContent = "Không có cảnh báo";

    list.appendChild(empty);

    return;
  }

  diagnostics.forEach(d=>{

    const el = document.createElement("div");

    el.className = `diag ${d.severity || "warning"}`;

    el.textContent =
      `L${d.line || "?"}  ${d.message || ""}`;

    el.addEventListener("click",()=>{

      jumpToLine(d.line || 1);

    });

    list.appendChild(el);

  });

}

function jumpToLine(line){

  const lines = code.value.split(/\r?\n/);

  let pos = 0;

  for(let i=0;i<line-1 && i<lines.length;i++){

    pos += lines[i].length + 1;

  }

  code.focus();

  code.setSelectionRange(
    pos,
    pos + (lines[line-1] || "").length
  );

  const lineHeight = 19;

  code.scrollTop =
    Math.max(
      0,
      (line - 4) * lineHeight
    );

  currentLine = line;

  updateLineNumbers();

  draw();

}

function updateMetrics(){

  const lines = code.value.split(/\r?\n/);

  $("metricLines").textContent = lines.length;

  const length =
    parsed?.totalLength || 0;

  $("metricLength").textContent =
    `${length.toFixed(3)} mm`;

  $("metricState").textContent =
    parsed?.diagnostics?.some(
      d => d.severity === "error"
    )
      ? "Có lỗi"
      : running
        ? "Đang chạy"
        : "Sẵn sàng";

}

function updatePosition(x,y,z){

  $("xPos").textContent =
    Number(x || 0).toFixed(3);

  $("yPos").textContent =
    Number(y || 0).toFixed(3);

  $("zPos").textContent =
    Number(z || 0).toFixed(3);

  $("mx").textContent =
    Number(x || 0).toFixed(3);

  $("my").textContent =
    Number(y || 0).toFixed(3);

  $("mz").textContent =
    Number(z || 0).toFixed(3);

}

function fitView(){

  const segs = parsed?.segments || [];

  if(!segs.length){

    view = {
      minX:0,
      maxX:100,
      minY:0,
      maxY:100,
      scale:1,
      ox:0,
      oy:0,
      panX:0,
      panY:0
    };

    return;

  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  segs.forEach(s=>{

    minX = Math.min(
      minX,
      s.x,
      s.x2
    );

    maxX = Math.max(
      maxX,
      s.x,
      s.x2
    );

    minY = Math.min(
      minY,
      s.y,
      s.y2
    );

    maxY = Math.max(
      maxY,
      s.y,
      s.y2
    );

  });

  if(!isFinite(minX)) return;

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const dx = Math.max(1,maxX-minX);
  const dy = Math.max(1,maxY-minY);

  const padding = 45;

  const scale = Math.min(
    (w-padding*2)/dx,
    (h-padding*2)/dy
  );

  view = {
    minX,
    maxX,
    minY,
    maxY,
    scale:Math.max(.01,scale),
    ox:padding,
    oy:h-padding,
    panX:0,
    panY:0
  };

}

function worldToScreen(x,y){

  const sx =
    view.ox +
    (x-view.minX) * view.scale +
    view.panX;

  const sy =
    view.oy -
    (y-view.minY) * view.scale +
    view.panY;

  return {
    x:sx,
    y:sy
  };

}

function drawAxis(){

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  ctx.save();

  ctx.strokeStyle = "#24313e";
  ctx.lineWidth = 1;

  const zeroX =
    worldToScreen(0,0).x;

  const zeroY =
    worldToScreen(0,0).y;

  if(zeroX >= 0 && zeroX <= w){

    ctx.beginPath();
    ctx.moveTo(zeroX,0);
    ctx.lineTo(zeroX,h);
    ctx.stroke();

  }

  if(zeroY >= 0 && zeroY <= h){

    ctx.beginPath();
    ctx.moveTo(0,zeroY);
    ctx.lineTo(w,zeroY);
    ctx.stroke();

  }

  drawAxisLabels();

  ctx.restore();

}

function niceStep(range){

  if(range <= 0) return 10;

  const raw = range / 8;

  const power =
    Math.pow(
      10,
      Math.floor(Math.log10(raw))
    );

  const n = raw / power;

  let step;

  if(n <= 1) step = 1;
  else if(n <= 2) step = 2;
  else if(n <= 5) step = 5;
  else step = 10;

  return step * power;

}

function drawAxisLabels(){

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  const rangeX =
    Math.max(
      1,
      view.maxX-view.minX
    );

  const rangeY =
    Math.max(
      1,
      view.maxY-view.minY
    );

  const stepX = niceStep(rangeX);
  const stepY = niceStep(rangeY);

  ctx.fillStyle = "#657487";
  ctx.font = "9px Consolas,monospace";

  const startX =
    Math.floor(view.minX / stepX) * stepX;

  for(
    let x=startX;
    x<=view.maxX+stepX;
    x+=stepX
  ){

    const p =
      worldToScreen(x,0);

    if(
      p.x < 0 ||
      p.x > w
    ) continue;

    ctx.strokeStyle = "#30404f";

    ctx.beginPath();
    ctx.moveTo(p.x,h-12);
    ctx.lineTo(p.x,h-5);
    ctx.stroke();

    ctx.fillText(
      String(
        Number(x.toFixed(6))
      ),
      p.x-8,
      h-15
    );

  }

  const startY =
    Math.floor(view.minY / stepY) * stepY;

  for(
    let y=startY;
    y<=view.maxY+stepY;
    y+=stepY
  ){

    const p =
      worldToScreen(0,y);

    if(
      p.y < 0 ||
      p.y > h
    ) continue;

    ctx.strokeStyle = "#30404f";

    ctx.beginPath();
    ctx.moveTo(7,p.y);
    ctx.lineTo(14,p.y);
    ctx.stroke();

    ctx.fillText(
      String(
        Number(y.toFixed(6))
      ),
      16,
      p.y+3
    );

  }

  ctx.fillStyle = "#708094";

  ctx.fillText(
    mode === "turning" ? "Z" : "X",
    w-14,
    h-8
  );

  ctx.fillText(
    mode === "turning" ? "X" : "Y",
    16,
    14
  );

  const origin =
    worldToScreen(0,0);

  if(
    origin.x >= 0 &&
    origin.x <= w &&
    origin.y >= 0 &&
    origin.y <= h
  ){

    ctx.fillStyle = "#8ea1b5";

    ctx.fillText(
      mode === "turning"
        ? "X0 Z0"
        : "X0 Y0",
      origin.x+7,
      origin.y-7
    );

  }

}

function drawSegment(s){

  const a =
    worldToScreen(
      s.x,
      s.y
    );

  const b =
    worldToScreen(
      s.x2,
      s.y2
    );

  let color = "#38a9ff";

  if(s.g === "G00"){
    color = "#f87171";
  }

  if(s.g === "G02"){
    color = "#34d399";
  }

  if(s.g === "G03"){
    color = "#f5c451";
  }

  ctx.strokeStyle = color;

  ctx.lineWidth =
    s.line === currentLine
      ? 2.5
      : 1.8;

  if(s.g === "G00"){

    ctx.setLineDash([7,5]);

  }else{

    ctx.setLineDash([]);

  }

  ctx.beginPath();

  ctx.moveTo(a.x,a.y);
  ctx.lineTo(b.x,b.y);

  ctx.stroke();

  ctx.setLineDash([]);

}

function draw(){

  if(!canvas.clientWidth || !canvas.clientHeight)
    return;

  ctx.clearRect(
    0,
    0,
    canvas.clientWidth,
    canvas.clientHeight
  );

  drawAxis();

  const segs =
    parsed?.segments || [];

  segs.forEach(drawSegment);

  if(
    running &&
    currentLine
  ){

    const lineSegs =
      segs.filter(
        s => s.line === currentLine
      );

    if(lineSegs.length){

      const last =
        lineSegs[lineSegs.length-1];

      const p =
        worldToScreen(
          last.x2,
          last.y2
        );

      ctx.fillStyle = "#ffffff";

      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        4,
        0,
        Math.PI*2
      );

      ctx.fill();

    }

  }

}

function setMode(newMode){

  mode = newMode;

  $("millingBtn")
    .classList.toggle(
      "active",
      mode === "milling"
    );

  $("turningBtn")
    .classList.toggle(
      "active",
      mode === "turning"
    );

  $("viewTitle").textContent =
    mode === "turning"
      ? "2D • LATHE VIEW (X-Z)"
      : "2D • TOP VIEW (X-Y)";

  $("coordYLabel").textContent =
    mode === "turning"
      ? "Z"
      : "Y";

  parseProgram();

}

function run(){

  if(running && !paused)
    return;

  if(!parsed)
    parseProgram();

  running = true;
  paused = false;

  $("statusText").textContent =
    "Đang chạy • CNC Simulator";

  const lines =
    code.value.split(/\r?\n/);

  if(currentLine >= lines.length)
    currentLine = 1;

  clearInterval(timer);

  timer = setInterval(()=>{

    if(paused)
      return;

    currentLine++;

    if(currentLine > lines.length){

      stop();

      return;

    }

    jumpRunLine(currentLine);

  },100);

  updateMetrics();

}

function jumpRunLine(line){

  const lineHeight = 19;

  currentLine = line;

  code.scrollTop =
    Math.max(
      0,
      (line-4)*lineHeight
    );

  lineNumbers.scrollTop =
    code.scrollTop;

  updateLineNumbers();

  const seg =
    parsed?.segments?.find(
      s => s.line === line
    );

  if(seg){

    updatePosition(
      seg.x2,
      seg.y2,
      seg.z2
    );

  }

  draw();

}

function pause(){

  if(!running)
    return;

  paused = !paused;

  $("pauseBtn").innerHTML =
    paused
      ? "▶<span>Tiếp</span>"
      : "Ⅱ<span>Dừng</span>";

  $("statusText").textContent =
    paused
      ? "Tạm dừng"
      : "Đang chạy";

}

function stop(){

  running = false;
  paused = false;

  clearInterval(timer);
  timer = null;

  $("pauseBtn").innerHTML =
    "Ⅱ<span>Dừng</span>";

  $("statusText").textContent =
    "Sẵn sàng";

  updateMetrics();
  draw();

}

function reset(){

  stop();

  currentLine = 0;

  updateLineNumbers();

  parseProgram();

  updatePosition(
    0,
    0,
    5
  );

}

function step(){

  if(!parsed)
    parseProgram();

  const lines =
    code.value.split(/\r?\n/);

  currentLine =
    Math.min(
      lines.length,
      currentLine + 1
    );

  jumpRunLine(currentLine);

}

function saveFile(){

  const blob =
    new Blob(
      [code.value],
      {
        type:"text/plain;charset=utf-8"
      }
    );

  const a =
    document.createElement("a");

  a.href =
    URL.createObjectURL(blob);

  a.download =
    "program.nc";

  a.click();

  URL.revokeObjectURL(a.href);

  $("dirty").textContent =
    "● Đã lưu";

  $("dirty").style.color =
    "#34d399";

}

function openFile(){

  $("fileInput").click();

}

$("fileInput").addEventListener(
  "change",
  e=>{

    const file =
      e.target.files[0];

    if(!file)
      return;

    const reader =
      new FileReader();

    reader.onload = ()=>{

      code.value =
        String(reader.result || "");

      currentLine = 0;

      updateLineNumbers();
      parseProgram();

    };

    reader.readAsText(file);

  }
);

function newProgram(){

  stop();

  code.value = "%\n%\n";

  currentLine = 0;

  updateLineNumbers();
  parseProgram();

}

code.addEventListener(
  "input",
  ()=>{

    markDirty();
    updateLineNumbers();
    parseProgram();

  }
);

code.addEventListener(
  "scroll",
  syncLineScroll
);

code.addEventListener(
  "click",
  ()=>{

    const before =
      code.value
        .slice(0,code.selectionStart);

    currentLine =
      before.split("\n").length;

    updateLineNumbers();

  }
);

code.addEventListener(
  "keyup",
  ()=>{

    const before =
      code.value
        .slice(0,code.selectionStart);

    currentLine =
      before.split("\n").length;

    updateLineNumbers();

  }
);

$("runBtn").addEventListener(
  "click",
  run
);

$("pauseBtn").addEventListener(
  "click",
  pause
);

$("stopBtn").addEventListener(
  "click",
  stop
);

$("stepBtn").addEventListener(
  "click",
  step
);

$("resetBtn").addEventListener(
  "click",
  reset
);

$("saveBtn").addEventListener(
  "click",
  saveFile
);

$("openBtn").addEventListener(
  "click",
  openFile
);

$("newBtn").addEventListener(
  "click",
  newProgram
);

$("fitBtn").addEventListener(
  "click",
  ()=>{
    fitView();
    draw();
  }
);

$("millingBtn").addEventListener(
  "click",
  ()=>setMode("milling")
);

$("turningBtn").addEventListener(
  "click",
  ()=>setMode("turning")
);

controller.addEventListener(
  "change",
  ()=>{

    $("controllerBadge").textContent =
      controller.value;

    parseProgram();

  }
);

canvas.addEventListener(
  "mousedown",
  e=>{

    if(!e.shiftKey)
      return;

    dragging = true;

    canvas.classList.add("panning");

    dragStart = {
      x:e.clientX,
      y:e.clientY,
      px:view.panX,
      py:view.panY
    };

  }
);

window.addEventListener(
  "mousemove",
  e=>{

    if(!dragging)
      return;

    view.panX =
      dragStart.px +
      e.clientX -
      dragStart.x;

    view.panY =
      dragStart.py +
      e.clientY -
      dragStart.y;

    draw();

  }
);

window.addEventListener(
  "mouseup",
  ()=>{

    dragging = false;

    canvas.classList.remove(
      "panning"
    );

  }
);

window.addEventListener(
  "resize",
  resizeCanvas
);

window.addEventListener(
  "keydown",
  e=>{

    if(
      e.ctrlKey &&
      e.key.toLowerCase() === "s"
    ){

      e.preventDefault();
      saveFile();

    }

    if(
      e.ctrlKey &&
      e.key === "Enter"
    ){

      e.preventDefault();
      run();

    }

  }
);

updateLineNumbers();

requestAnimationFrame(()=>{
  parseProgram();
  resizeCanvas();
});

})();

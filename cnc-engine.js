(function(global){

"use strict";

const EPS = 1e-9;

const PROFILES = {

  FANUC:{
    name:"FANUC",
    latheG90Cycle:true
  },

  HAAS:{
    name:"HAAS",
    latheG90Cycle:true
  },

  LINUXCNC:{
    name:"LinuxCNC",
    latheG90Cycle:false
  }

};

const MOTION = new Set([
  "G00",
  "G01",
  "G02",
  "G03",
  "G33",
  "G33.1",
  "G38.2",
  "G38.3",
  "G38.4",
  "G38.5"
]);

const DIST = new Set([
  "G90",
  "G91"
]);

const ARC_DIST = new Set([
  "G90.1",
  "G91.1"
]);

const PLANES = new Set([
  "G17",
  "G18",
  "G19"
]);

const UNITS = new Set([
  "G20",
  "G21"
]);

const FEED = new Set([
  "G93",
  "G94",
  "G95"
]);

const CANNED = new Set([
  "G73",
  "G74",
  "G76",
  "G77",
  "G81",
  "G82",
  "G83",
  "G84",
  "G85",
  "G86",
  "G87",
  "G88",
  "G89"
]);

const LATHE_CYCLES = new Set([
  "G70",
  "G71",
  "G72",
  "G73",
  "G74",
  "G75",
  "G76",
  "G90",
  "G92",
  "G94"
]);

const KNOWN_G = new Set([
  ...MOTION,
  ...DIST,
  ...ARC_DIST,
  ...PLANES,
  ...UNITS,
  ...FEED,

  "G04",
  "G09",

  "G28",
  "G29",
  "G30",

  "G31",
  "G32",

  "G40",
  "G41",
  "G42",
  "G41.1",
  "G42.1",

  "G43",
  "G43.1",
  "G43.2",
  "G44",
  "G49",

  "G50",
  "G51",
  "G52",
  "G53",

  "G54",
  "G55",
  "G56",
  "G57",
  "G58",
  "G59",

  "G60",
  "G61",
  "G61.1",
  "G64",

  "G65",
  "G68",
  "G69",

  "G70",
  "G71",
  "G72",
  "G73",
  "G74",
  "G75",
  "G76",
  "G77",

  "G80",
  "G81",
  "G82",
  "G83",
  "G84",
  "G85",
  "G86",
  "G87",
  "G88",
  "G89",

  "G90",
  "G91",
  "G92",
  "G92.1",
  "G92.2",
  "G92.3",

  "G93",
  "G94",
  "G95",
  "G96",
  "G97",
  "G98",
  "G99",

  "G100",
  "G101"
]);

const KNOWN_M = new Set([
  "M00",
  "M01",
  "M02",
  "M03",
  "M04",
  "M05",
  "M06",
  "M07",
  "M08",
  "M09",
  "M10",
  "M11",
  "M12",
  "M13",
  "M14",
  "M15",
  "M16",
  "M17",
  "M18",
  "M19",
  "M21",
  "M22",
  "M23",
  "M24",
  "M30",
  "M31",
  "M32",
  "M33",
  "M34",
  "M98",
  "M99"
]);

function clone(v){
  return JSON.parse(JSON.stringify(v));
}

function near(a,b){
  return Math.abs(a-b) < EPS;
}

function stripComments(line){

  return line
    .replace(/\([^)]*\)/g,"")
    .replace(/;.*$/,"")
    .trim();

}

function expandCR(line){

  /*
   * CR=20 là cú pháp hợp lệ riêng.
   *
   * CR20 / CR-20 KHÔNG được chuyển thành R.
   *
   * Chỉ:
   *
   * CR=20
   * CR = 20
   * CR=-20
   *
   * mới được chuyển thành R để dùng chung
   * geometry solver.
   */

  return line.replace(
    /\bCR\s*=\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)/gi,
    "R$1"
  );

}

function tokenize(line){

  const out = [];

  const re =
    /([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)/gi;

  let m;

  while((m = re.exec(line))){

    out.push({
      letter:m[1].toUpperCase(),
      value:Number(m[2]),
      raw:m[0]
    });

  }

  return out;

}

function words(ws,letter){

  return ws
    .filter(w=>w.letter === letter)
    .map(w=>w.value);

}

function word(ws,letter){

  const x =
    ws.find(w=>w.letter === letter);

  return x ? x.value : null;

}

function has(ws,letter){

  return ws.some(
    w=>w.letter === letter
  );

}

function readAxis(ws,letter){

  return word(ws,letter);

}

function gCodes(ws){

  return ws
    .filter(w=>w.letter === "G")
    .map(w=>{

      const n = Number(w.value);

      return Number.isInteger(n)
        ? `G${n}`
        : `G${n}`;

    });

}

function mCodes(ws){

  return ws
    .filter(w=>w.letter === "M")
    .map(w=>{

      const n = Number(w.value);

      return Number.isInteger(n)
        ? `M${n}`
        : `M${n}`;

    });

}

function rotatePoint(p,c,deg){

  const a =
    deg * Math.PI / 180;

  const cos = Math.cos(a);
  const sin = Math.sin(a);

  const x = p.x-c.x;
  const y = p.y-c.y;

  return {
    x:c.x + x*cos-y*sin,
    y:c.y + x*sin+y*cos,
    z:p.z
  };

}

function project(p,plane){

  if(plane === "G18"){

    return {
      x:p.z,
      y:p.x
    };

  }

  if(plane === "G19"){

    return {
      x:p.y,
      y:p.z
    };

  }

  return {
    x:p.x,
    y:p.y
  };

}

function axisPoint(s){

  return {
    x:s.x,
    y:s.y,
    z:s.z
  };

}

function machineTarget(ws){

  return {
    x:readAxis(ws,"X"),
    y:readAxis(ws,"Y"),
    z:readAxis(ws,"Z")
  };

}

function resolveTarget(s,ws){

  const t = axisPoint(s);

  const axes = ["X","Y","Z"];

  axes.forEach(axis=>{

    const v =
      readAxis(ws,axis);

    if(v === null)
      return;

    if(s.distance === "G91"){

      t[axis.toLowerCase()] += v;

    }else{

      t[axis.toLowerCase()] = v;

    }

  });

  return t;

}

function arcCenterR(a,b,r,cw){

  const dx=b.x-a.x;
  const dy=b.y-a.y;

  const d=Math.hypot(dx,dy);

  if(
    d < EPS ||
    Math.abs(r) < EPS ||
    d > 2*Math.abs(r)+EPS
  ){

    return null;

  }

  const rr=Math.abs(r);

  const mx=(a.x+b.x)/2;
  const my=(a.y+b.y)/2;

  const h=Math.sqrt(
    Math.max(
      0,
      rr*rr-d*d/4
    )
  );

  const nx=-dy/d;
  const ny=dx/d;

  const c1={
    x:mx+nx*h,
    y:my+ny*h
  };

  const c2={
    x:mx-nx*h,
    y:my-ny*h
  };

  function sweep(c){

    let a0=Math.atan2(
      a.y-c.y,
      a.x-c.x
    );

    let a1=Math.atan2(
      b.y-c.y,
      b.x-c.x
    );

    let delta=a1-a0;

    if(cw){

      while(delta >= 0)
        delta-=Math.PI*2;

    }else{

      while(delta <= 0)
        delta+=Math.PI*2;

    }

    return Math.abs(delta);

  }

  const s1=sweep(c1);
  const s2=sweep(c2);

  /*
   * R dương:
   * chọn cung <= 180°.
   *
   * R âm:
   * chọn cung > 180°.
   */

  const wantLarge = r < 0;

  const candidates = [
    {
      c:c1,
      sweep:s1
    },
    {
      c:c2,
      sweep:s2
    }
  ];

  candidates.sort((u,v)=>{

    const ul =
      u.sweep > Math.PI+EPS;

    const vl =
      v.sweep > Math.PI+EPS;

    if(wantLarge){

      return Number(vl)-Number(ul);

    }

    return Number(ul)-Number(vl);

  });

  return candidates[0].c;

}

function arcCenterIJK(
  a,
  b,
  ws,
  plane,
  arcDistance,
  start
){

  let c={
    x:a.x,
    y:a.y
  };

  if(plane === "G17"){

    const i=readAxis(ws,"I");
    const j=readAxis(ws,"J");

    if(i === null && j === null)
      return null;

    if(arcDistance === "G91.1"){

      c.x += i || 0;
      c.y += j || 0;

    }else{

      c.x = i !== null ? i : a.x;
      c.y = j !== null ? j : a.y;

    }

  }

  else if(plane === "G18"){

    const i=readAxis(ws,"I");
    const k=readAxis(ws,"K");

    if(i === null && k === null)
      return null;

    c.x =
      k !== null
        ? k
        : a.z;

    c.y =
      i !== null
        ? i
        : a.x;

  }

  else if(plane === "G19"){

    const j=readAxis(ws,"J");
    const k=readAxis(ws,"K");

    if(j === null && k === null)
      return null;

    c.x =
      j !== null
        ? j
        : a.y;

    c.y =
      k !== null
        ? k
        : a.z;

  }

  return c;

}

function arc(
  segments,
  a,
  b,
  c,
  cw,
  g,
  line,
  meta={}
){

  const r =
    Math.hypot(
      a.x-c.x,
      a.y-c.y
    );

  if(r < EPS){

    segments.push({
      x:a.x,
      y:a.y,
      x2:b.x,
      y2:b.y,
      g,
      line,
      ...meta
    });

    return;

  }

  let a0 =
    Math.atan2(
      a.y-c.y,
      a.x-c.x
    );

  let a1 =
    Math.atan2(
      b.y-c.y,
      b.x-c.x
    );

  let delta=a1-a0;

  if(cw){

    while(delta >= 0)
      delta-=Math.PI*2;

  }else{

    while(delta <= 0)
      delta+=Math.PI*2;

  }

  /*
   * Tính số đoạn chỉ để phục vụ simulation.
   * Renderer có thể dùng các segment này
   * nhưng hình học vẫn là cung thật.
   */

  const count =
    Math.max(
      8,
      Math.ceil(
        Math.abs(delta) * r / 2
      )
    );

  let px=a.x;
  let py=a.y;

  for(let i=1;i<=count;i++){

    const t=i/count;

    const ang =
      a0 + delta*t;

    const x =
      c.x + r*Math.cos(ang);

    const y =
      c.y + r*Math.sin(ang);

    segments.push({

      x:px,
      y:py,

      x2:
        i === count
          ? b.x
          : x,

      y2:
        i === count
          ? b.y
          : y,

      g,
      line,

      arc:true,

      center:{
        x:c.x,
        y:c.y
      },

      radius:r,

      startAngle:a0,
      delta,

      clockwise:cw,

      ...meta

    });

    px=x;
    py=y;

  }

}

function diag(
  line,
  severity,
  message,
  code
){

  result.diagnostics.push({
    line,
    severity,
    message,
    code
  });

}

let result=null;

function parse(
  source,
  options={}
){

  const controller =
    options.controller || "FANUC";

  const mode =
    options.mode || "milling";

  const profile =
    PROFILES[controller] ||
    PROFILES.FANUC;

  const lines =
    String(source || "")
      .split(/\r?\n/);

  result = {

    segments:[],
    diagnostics:[],
    events:[],
    modalHistory:[],
    totalLength:0,
    bounds:null,
    state:null,
    variables:{}

  };

  const s = {

    x:0,
    y:0,
    z:5,

    motion:"G00",
    distance:"G90",

    plane:
      mode === "turning"
        ? "G18"
        : "G17",

    units:"G21",

    feedMode:"G94",

    arcDistance:"G91.1",

    feed:0,
    spindle:0,
    tool:1,

    coordSystem:"G54",

    localOffset:{
      x:0,
      y:0,
      z:0
    },

    g92Offset:{
      x:0,
      y:0,
      z:0
    },

    coordOffsets:{
      G54:{x:0,y:0,z:0},
      G55:{x:0,y:0,z:0},
      G56:{x:0,y:0,z:0},
      G57:{x:0,y:0,z:0},
      G58:{x:0,y:0,z:0},
      G59:{x:0,y:0,z:0}
    },

    rotation:null,

    scale:1,

    mirrorX:false,
    mirrorY:false,

    spindleMode:"G97",
    spindleCode:"M05",

    coolant:"M09",

    toolComp:"G40",

    toolLength:false,

    retractMode:"G98",

    canned:null,

    pathControl:"G64",

    diameterMode:false

  };

  const vars={};
  const cycle={};

  let profileStart=null;
  let profileEnd=null;

  let profileStartLine=null;
  let profileEndLine=null;

  function evalExpr(expr){

    let str=String(expr)
      .replace(/\[/g,"(")
      .replace(/\]/g,")");

    str=str.replace(
      /#<?([A-Za-z0-9_]+)>?/g,
      (_,name)=>{
        return vars[name] ?? 0;
      }
    );

    try{

      if(
        !/^[0-9+\-*/().\s]+$/.test(str)
      ){

        return NaN;

      }

      return Function(
        `"use strict";return (${str})`
      )();

    }catch{

      return NaN;

    }

  }

  function setVar(name,value){

    vars[name]=value;

  }

  function transform(p){

    let q={
      x:p.x*s.scale,
      y:p.y*s.scale,
      z:p.z*s.scale
    };

    if(s.mirrorX)
      q.x=-q.x;

    if(s.mirrorY)
      q.y=-q.y;

    if(s.rotation)
      q=rotatePoint(
        q,
        s.rotation.center,
        s.rotation.deg
      );

    const off =
      s.coordOffsets[s.coordSystem] ||
      {x:0,y:0,z:0};

    q.x +=
      off.x +
      s.localOffset.x +
      s.g92Offset.x;

    q.y +=
      off.y +
      s.localOffset.y +
      s.g92Offset.y;

    q.z +=
      off.z +
      s.localOffset.z +
      s.g92Offset.z;

    return q;

  }

  function display(
    a,
    b,
    g,
    line,
    meta={}
  ){

    const pa=transform(a);
    const pb=transform(b);

    const qa=project(
      pa,
      s.plane
    );

    const qb=project(
      pb,
      s.plane
    );

    result.segments.push({

      x:qa.x,
      y:qa.y,

      x2:qb.x,
      y2:qb.y,

      z:a.z,
      z2:b.z,

      g,
      line,

      ...meta,

      rawStart:{
        ...a
      },

      rawEnd:{
        ...b
      },

      state:{
        plane:s.plane,
        units:s.units,
        feed:s.f,
        spindle:s.spindle,
        tool:s.tool
      }

    });

  }

  function executeLinear(
    a,
    b,
    g,
    line,
    meta={}
  ){

    display(
      a,
      b,
      g,
      line,
      meta
    );

  }

  function executeArc(
    a,
    b,
    ws,
    cw,
    g,
    line,
    meta={}
  ){

    const pa=transform(a);
    const pb=transform(b);

    const qa=project(
      pa,
      s.plane
    );

    const qb=project(
      pb,
      s.plane
    );

    let c =
      arcCenterIJK(
        pa,
        pb,
        ws,
        s.plane,
        s.arcDistance,
        pa
      );

    const rv =
      readAxis(ws,"R");

    if(
      !c &&
      rv !== null
    ){

      c =
        arcCenterR(
          qa,
          qb,
          rv,
          cw
        );

    }

    if(!c){

      diag(
        line,
        "warning",
        "Không xác định được tâm cung; hiển thị thành đoạn thẳng.",
        g
      );

      result.segments.push({

        x:qa.x,
        y:qa.y,
        x2:qb.x,
        y2:qb.y,

        z:a.z,
        z2:b.z,

        g,
        line,

        arcFallback:true,

        ...meta

      });

      return;

    }

    arc(
      result.segments,
      qa,
      qb,
      c,
      cw,
      g,
      line,
      {
        ...meta,

        rawStart:{
          ...a
        },

        rawEnd:{
          ...b
        }

      }
    );

  }

  function drillCycle(
    code,
    ws,
    line,
    baseTarget
  ){

    const r =
      readAxis(ws,"R") ??
      cycle.R ??
      (s.z+2);

    const depth =
      readAxis(ws,"Z") ??
      cycle.Z ??
      s.z;

    const q =
      Math.abs(
        readAxis(ws,"Q") ??
        cycle.Q ??
        Math.max(
          .5,
          Math.abs(depth-r)/4
        )
      );

    const start=axisPoint(s);

    const top={
      ...start,
      x:baseTarget.x,
      y:baseTarget.y,
      z:r
    };

    const bottom={
      ...top,
      z:depth
    };

    display(
      start,
      top,
      "G00",
      line,
      {
        cycle:code,
        phase:"position"
      }
    );

    if(
      ["G83","G73"].includes(code)
    ){

      let z=r;
      let guard=0;

      while(
        (
          depth<r
            ? z>depth+EPS
            : z<depth-EPS
        ) &&
        guard++<10000
      ){

        const nz =
          depth<r
            ? Math.max(
                depth,
                z-q
              )
            : Math.min(
                depth,
                z+q
              );

        display(
          {
            ...top,
            z
          },
          {
            ...top,
            z:nz
          },
          "G01",
          line,
          {
            cycle:code,
            phase:"peck"
          }
        );

        if(
          !near(nz,depth)
        ){

          display(
            {
              ...top,
              z:nz
            },
            {
              ...top,
              z:r
            },
            "G00",
            line,
            {
              cycle:code,
              phase:"retract"
            }
          );

        }

        z=nz;

      }

    }else{

      display(
        top,
        bottom,
        "G01",
        line,
        {
          cycle:code,
          phase:"cut"
        }
      );

    }

    if(
      code==="G82" ||
      code==="G89"
    ){

      diag(
        line,
        "info",
        `${code}: dwell P được ghi nhận trong trạng thái mô phỏng.`,
        code
      );

    }

    display(
      bottom,
      top,
      "G00",
      line,
      {
        cycle:code,
        phase:
          s.retractMode === "G98"
            ? "initial-return"
            : "R-return"
      }
    );

  }

  function parseLatheCycle(
    code,
    ws,
    line,
    target
  ){

    if(code==="G70"){

      if(
        profileStart &&
        profileEnd
      ){

        display(
          profileStart,
          profileEnd,
          "G01",
          line,
          {
            cycle:"G70",
            phase:"finish"
          }
        );

      }else{

        diag(
          line,
          "warning",
          "G70 cần profile đã xác định bằng P/Q hoặc đoạn profile trước đó.",
          "G70"
        );

      }

      return;

    }

    if(
      code==="G90" ||
      code==="G94"
    ){

      if(
        has(ws,"X") ||
        has(ws,"Z")
      ){

        display(
          axisPoint(s),
          target,
          "G01",
          line,
          {
            cycle:code,
            phase:"turning"
          }
        );

      }

      return;

    }

    if(code==="G92"){

      display(
        axisPoint(s),
        target,
        "G01",
        line,
        {
          cycle:"G92",
          phase:"thread"
        }
      );

      return;

    }

    if(
      code==="G75" ||
      code==="G74"
    ){

      const q =
        Math.abs(
          readAxis(ws,"Q") ?? 2
        );

      let z0=s.z;
      let z1=target.z;

      let dir =
        z1<z0
          ? -1
          : 1;

      for(
        let z=z0;
        dir*z <
          dir*z1-EPS;
        z+=dir*q
      ){

        display(
          {
            ...axisPoint(s),
            z
          },
          {
            ...target,
            z
          },
          "G01",
          line,
          {
            cycle:code,
            phase:"groove"
          }
        );

      }

      return;

    }

    if(code==="G76"){

      display(
        axisPoint(s),
        target,
        "G01",
        line,
        {
          cycle:"G76",
          phase:"thread"
        }
      );

      diag(
        line,
        "info",
        "G76: preview centerline; bước/chiều sâu được giữ trong metadata, không thay thế bộ điều khiển.",
        "G76"
      );

      return;

    }

    if(
      code==="G71" ||
      code==="G72" ||
      code==="G73"
    ){

      if(
        profileStart &&
        profileEnd
      ){

        display(
          profileStart,
          profileEnd,
          "G01",
          line,
          {
            cycle:code,
            phase:"rough-profile"
          }
        );

      }else{

        diag(
          line,
          "warning",
          `${code}: chưa có profile P/Q để roughing; chỉ ghi nhận chu kỳ.`,
          code
        );

      }

      return;

    }

  }

  for(
    let i=0;
    i<lines.length;
    i++
  ){

    const raw=lines[i];

    const stripped =
      stripComments(raw);

    if(
      !stripped ||
      stripped === "%"
    ){

      continue;

    }

    const line=i+1;

    /*
     * QUAN TRỌNG:
     *
     * CR phải có dấu "=".
     *
     * CR=20     -> hợp lệ
     * CR=-20    -> hợp lệ
     *
     * CR20      -> lỗi
     * CR-20     -> lỗi
     */

    const malformedCR =
      /\bCR\s*(?!\=)/i
        .test(stripped);

    if(malformedCR){

      diag(
        line,
        "error",
        "Cú pháp CR phải có dấu =, ví dụ CR=20. CR20 và CR-20 không hợp lệ.",
        "CR="
      );

      continue;

    }

    /*
     * Chỉ sau khi kiểm tra cú pháp CR
     * mới chuyển CR=20 thành R20
     */

    const clean =
      expandCR(stripped);

    const ws =
      tokenize(clean);

    if(!ws.length)
      continue;

    const ns =
      word(ws,"N");

    if(ns !== null){

      result.events.push({
        line,
        type:"sequence",
        value:ns
      });

    }

    const gs =
      gCodes(ws);

    const ms =
      mCodes(ws);

    /*
     * Macro assignment
     *
     * #100=10
     * #<DEPTH>=#100-2
     */

    const assign =
      clean.match(
        /^#<?([A-Za-z0-9_]+)>?\s*=\s*(.+)$/
      );

    if(assign){

      const val =
        evalExpr(assign[2]);

      setVar(
        assign[1],
        val
      );

      result.events.push({
        line,
        type:"variable",
        name:assign[1],
        value:val
      });

      continue;

    }

    if(
      clean.startsWith("/") ||
      s.skip
    ){

      result.events.push({
        line,
        type:"block-skip"
      });

      continue;

    }

    for(const g of gs){

      if(!KNOWN_G.has(g)){

        diag(
          line,
          "warning",
          `G-code ${g} chưa có mô hình riêng.`,
          g
        );

      }

      if(MOTION.has(g))
        s.motion=g;

      if(
        DIST.has(g) &&
        !(
          mode==="turning" &&
          profile.latheG90Cycle &&
          g==="G90"
        )
      ){

        s.distance=g;

      }

      if(ARC_DIST.has(g))
        s.arcDistance=g;

      if(PLANES.has(g))
        s.plane=g;

      if(UNITS.has(g))
        s.units=g;

      if(FEED.has(g))
        s.feedMode=g;

      if(g==="G96")
        s.spindleMode="G96";

      if(g==="G97")
        s.spindleMode="G97";

      if(g==="G7")
        s.diameterMode=true;

      if(g==="G8")
        s.diameterMode=false;

      if(
        [
          "G40",
          "G41",
          "G42",
          "G41.1",
          "G42.1"
        ].includes(g)
      ){

        s.toolComp=g;

      }

      if(
        g==="G43" ||
        g==="G43.1" ||
        g==="G43.2"
      ){

        s.toolLength=true;

      }

      if(g==="G49")
        s.toolLength=false;

      if(
        /^G5[4-9](?:\.\d)?$/.test(g)
      ){

        s.coordSystem=g;

      }

      if(
        g==="G98" ||
        g==="G99"
      ){

        s.retractMode=g;

      }

      if(g==="G80")
        s.canned=null;

      if(g==="G69")
        s.rotation=null;

      if(g==="G100"){

        s.mirrorX=false;
        s.mirrorY=false;

      }

      if(g==="G101")
        s.mirrorX=true;

      if(
        g==="G61" ||
        g==="G61.1" ||
        g==="G64"
      ){

        s.pathControl=g;

      }

      if(
        g==="G28" ||
        g==="G30"
      ){

        diag(
          line,
          "info",
          `${g}: reference move được ghi nhận; machine zero không được mô phỏng.`,
          g
        );

      }

      if(
        g==="G41" ||
        g==="G42"
      ){

        diag(
          line,
          "info",
          `${g}: preview centerline; bù bán kính thực được cảnh báo thay vì âm thầm dịch đường chạy.`,
          g
        );

      }

      if(
        [
          "G51",
          "G52",
          "G92",
          "G92.1",
          "G92.2",
          "G92.3"
        ].includes(g)
      ){

        diag(
          line,
          "info",
          `${g}: coordinate transform/offset được xử lý ở mức preview.`,
          g
        );

      }

    }

    for(const m of ms){

      if(!KNOWN_M.has(m)){

        diag(
          line,
          "warning",
          `M-code ${m} chưa có mô hình riêng.`,
          m
        );

      }

      if(
        [
          "M03",
          "M04",
          "M05"
        ].includes(m)
      ){

        s.spindleCode=m;

      }

      if(
        [
          "M07",
          "M08",
          "M09"
        ].includes(m)
      ){

        s.coolant=m;

      }

      if(
        m==="M06" &&
        has(ws,"T")
      ){

        s.tool =
          readAxis(ws,"T");

      }

      if(
        m==="M98" ||
        m==="M99"
      ){

        diag(
          line,
          "info",
          `${m}: subprogram được ghi nhận; preview không tự nạp file ngoài.`,
          m
        );

      }

    }

    const f =
      readAxis(ws,"F");

    const sp =
      readAxis(ws,"S");

    const tt =
      readAxis(ws,"T");

    if(f !== null)
      s.f=f;

    if(sp !== null)
      s.spindle=sp;

    if(tt !== null)
      s.tool=tt;

    /*
     * Coordinate transformations
     */

    if(gs.includes("G68")){

      const cx =
        readAxis(ws,"X") ?? 0;

      const cy =
        readAxis(ws,"Y") ?? 0;

      const deg =
        readAxis(ws,"R") ?? 0;

      s.rotation={
        center:{
          x:cx,
          y:cy,
          z:0
        },
        deg
      };

    }

    if(gs.includes("G51")){

      const p =
        readAxis(ws,"P");

      if(p !== null)
        s.scale=p;

    }

    if(gs.includes("G52")){

      s.localOffset.x =
        readAxis(ws,"X") ??
        s.localOffset.x;

      s.localOffset.y =
        readAxis(ws,"Y") ??
        s.localOffset.y;

      s.localOffset.z =
        readAxis(ws,"Z") ??
        s.localOffset.z;

    }

    if(gs.includes("G92")){

      s.g92Offset.x =
        readAxis(ws,"X") ??
        s.g92Offset.x;

      s.g92Offset.y =
        readAxis(ws,"Y") ??
        s.g92Offset.y;

      s.g92Offset.z =
        readAxis(ws,"Z") ??
        s.g92Offset.z;

    }

    if(gs.includes("G92.1")){

      s.g92Offset={
        x:0,
        y:0,
        z:0
      };

    }

    if(gs.includes("G10")){

      const L =
        readAxis(ws,"L");

      const P =
        readAxis(ws,"P");

      if(
        (
          L===2 ||
          L===20
        ) &&
        P != null
      ){

        const k =
          "G" + (53+P);

        if(s.coordOffsets[k]){

          s.coordOffsets[k].x =
            readAxis(ws,"X") ??
            s.coordOffsets[k].x;

          s.coordOffsets[k].y =
            readAxis(ws,"Y") ??
            s.coordOffsets[k].y;

          s.coordOffsets[k].z =
            readAxis(ws,"Z") ??
            s.coordOffsets[k].z;

        }

      }

    }

    if(
      gs.includes("G90.1") ||
      gs.includes("G91.1")
    ){

      s.arcDistance =
        gs.includes("G90.1")
          ? "G90.1"
          : "G91.1";

    }

    /*
     * Haas/FANUC lathe G90/G94
     * được xử lý như cycle.
     */

    const latheCycle =
      mode==="turning" &&
      profile.latheG90Cycle &&
      gs.find(
        g=>LATHE_CYCLES.has(g)
      );

    const cycleCode =
      gs.find(
        g=>CANNED.has(g)
      );

    if(cycleCode){

      s.canned=cycleCode;

      for(
        const k of [
          "R",
          "Q",
          "P",
          "L",
          "K",
          "I",
          "J",
          "H",
          "D",
          "E"
        ]
      ){

        const v =
          readAxis(ws,k);

        if(v !== null)
          cycle[k]=v;

      }

    }

    if(gs.includes("G80"))
      s.canned=null;

    const activeCycle =
      cycleCode ||
      s.canned;

    if(
      latheCycle &&
      [
        "G70",
        "G71",
        "G72",
        "G73"
      ].includes(latheCycle)
    ){

      const p =
        readAxis(ws,"P");

      const q =
        readAxis(ws,"Q");

      if(p !== null)
        profileStartLine=p;

      if(q !== null)
        profileEndLine=q;

    }

    /*
     * Tính target theo G90/G91
     */

    const target =
      resolveTarget(
        s,
        ws
      );

    const hasXYZ =
      [
        "X",
        "Y",
        "Z"
      ].some(
        a=>has(ws,a)
      );

    const a0 =
      axisPoint(s);

    /*
     * Capture lathe profile
     */

    if(
      mode==="turning" &&
      hasXYZ &&
      (
        s.motion==="G00" ||
        s.motion==="G01"
      )
    ){

      if(profileStart===null)
        profileStart={
          ...a0
        };

      profileEnd={
        ...target
      };

    }

    if(
      activeCycle &&
      mode==="milling" &&
      hasXYZ
    ){

      drillCycle(
        activeCycle,
        ws,
        line,
        target
      );

    }

    else if(latheCycle){

      parseLatheCycle(
        latheCycle,
        ws,
        line,
        target
      );

    }

    else if(
      hasXYZ ||
      gs.some(
        g=>MOTION.has(g)
      )
    ){

      const g=s.motion;

      if(
        g==="G02" ||
        g==="G03"
      ){

        executeArc(
          a0,
          target,
          ws,
          g==="G02",
          g,
          line,
          {
            controller,
            mode
          }
        );

      }

      else if(
        g==="G33" ||
        g==="G33.1"
      ){

        executeLinear(
          a0,
          target,
          "G01",
          line,
          {
            synchronized:g
          }
        );

        diag(
          line,
          "info",
          `${g}: spindle-synchronized preview as linear path.`,
          g
        );

      }

      else if(
        /^G38\./.test(g)
      ){

        executeLinear(
          a0,
          target,
          "G01",
          line,
          {
            probe:g
          }
        );

        diag(
          line,
          "info",
          `${g}: probe motion shown as feed line.`,
          g
        );

      }

      else{

        executeLinear(
          a0,
          target,
          g,
          line,
          {
            controller,
            mode
          }
        );

      }

    }

    Object.assign(
      s,
      target
    );

    result.modalHistory.push({
      line,
      g:gs,
      m:ms,

      state:{
        motion:s.motion,
        distance:s.distance,
        plane:s.plane,
        units:s.units,
        feed:s.f,
        spindle:s.spindle,
        tool:s.tool
      }

    });

  }

  /*
   * Bounds
   */

  if(result.segments.length){

    const pts=[];

    for(
      const q of result.segments
    ){

      pts.push(
        [q.x,q.y],
        [q.x2,q.y2]
      );

    }

    result.bounds={

      minX:
        Math.min(
          ...pts.map(p=>p[0])
        ),

      maxX:
        Math.max(
          ...pts.map(p=>p[0])
        ),

      minY:
        Math.min(
          ...pts.map(p=>p[1])
        ),

      maxY:
        Math.max(
          ...pts.map(p=>p[1])
        )

    };

  }

  else if(
    lines.some(
      l=>
        stripComments(l)
          .replace("%","")
          .trim()
    )
  ){

    diag(
      1,
      "info",
      "Chưa có chuyển động X/Y/Z hợp lệ để vẽ.",
      ""
    );

  }

  /*
   * Length
   */

  result.totalLength =
    result.segments.reduce(
      (sum,q)=>
        sum +
        Math.hypot(
          q.x2-q.x,
          q.y2-q.y
        ),
      0
    );

  result.state =
    clone(s);

  result.variables =
    clone(vars);

  return result;

}

global.CNCEngine = {

  parse,

  PROFILES,

  words:tokenize,

  version:"3.0.0"

};

})(window);

global.window=global;
require('../engine/cnc-engine.js');
const assert=require('assert');
const sample=`%
N01 G90 G54
N02 M03 S12000
N03 G00 X60 Y60 Z5 F300
N04 G01 Z-2
N05 G01 X160 Y60
N06 G01 X160 Y160
N07 G01 X60 Y160
N08 G01 X60 Y60
N09 G01 Z5
G01 X80 Y80
N11 G01 Z-2
N12 G91 G01 X30 Y10
N13 G01 X30 Y-10
N14 G01 X-10 Y10
N15 G01 X0 Y20
N16 G01 X-10 Y10
N17 G02 X-40 Y20 CR-20
N18 G01 X-10 Y-10
N19 G01 X-20 Y-20
N20 G01 X-10 Y-20
N21 G01 X10 Y-10
N22 G90 G00 Z5
N23 M05
N24 M30
%`;
const r=window.CNCEngine.parse(sample,{mode:'milling',controller:'FANUC'});
assert(r.segments.length>10);
assert(r.bounds.minX===0 && r.bounds.minY===0);
assert(r.segments.some(s=>s.g==='G02'));
const drill=window.CNCEngine.parse('G90 G00 X10 Y10 Z5\nG81 X10 Y10 Z-10 R2\nX20 Y10\nG80',{mode:'milling',controller:'HAAS'});
assert(drill.segments.some(s=>s.meta.cycle==='G81'));
const lathe=window.CNCEngine.parse('G21 G18 G90\nG00 X50 Z5\nG01 X40 Z0 F.2\nG01 X30 Z-20\nG76 X28 Z-40 P100 Q1 F2',{mode:'turning',controller:'HAAS'});
assert(lathe.segments.length>2);
const linux=window.CNCEngine.parse('G90 G00 X0 Y0\nG91 G01 X10 Y10\nG90 G01 X20 Y20',{mode:'milling',controller:'LINUXCNC'});
assert(Math.abs(linux.state.x-20)<1e-9 && Math.abs(linux.state.y-20)<1e-9);
console.log('CNC Studio v3 smoke tests: PASS');
console.log(JSON.stringify({sampleSegments:r.segments.length,drillSegments:drill.segments.length,latheSegments:lathe.segments.length,diagnostics:r.diagnostics.length},null,2));

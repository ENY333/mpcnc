global.window=global;
require('../engine/cnc-engine.js');
require('./generated-validation.js');
let pass=0,fail=0;
for(const c of global.CNC_GENERATED_CASES||[]){
  try{const r=global.CNCEngine.parse(c.gcode,{mode:c.mode,controller:c.controller});if(!r||!Array.isArray(r.segments)||!r.state)throw new Error('invalid result');pass++}
  catch(e){fail++;if(fail<5)console.error('FAIL',c.id,e.message)}
}
console.log(`Generated corpus: ${pass} pass / ${fail} fail`);
if(fail)process.exit(1);

'use strict';
// Server-side xAI API. No tools, financial writes or outbound messages in Phase 2.
const {instructions}=require('./baa-instructions');
const ALIASES=Object.freeze({report:'reporter'});
async function ask(role,content){
 const actual=ALIASES[role]||role;
 if(!Object.hasOwn(instructions,actual))throw Error('Unknown BAA role');
 if(typeof content!=='string'||content.length>60000)throw Error('Invalid prompt');
 const token=process.env.XAI_API_KEY;if(!token)throw Error('XAI_API_KEY not configured');
 const r=await fetch('https://api.x.ai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.PAL_XAI_MODEL||'grok-4',temperature:0,messages:[{role:'system',content:instructions[actual]},{role:'user',content}]}),signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error(`xAI HTTP ${r.status}`);
 const data=await r.json();return data.choices?.[0]?.message?.content||'';
}
module.exports={instructions,ask};

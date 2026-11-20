'use strict';
// Safety-first worker: claims jobs atomically; unimplemented operations are held,
// never silently marked successful or allowed to modify customer data.
const crypto=require('node:crypto');
const a=require('./core');
const reader=require('./reader');
const roles=require('./role-executor');
const workerId=`pal-${crypto.randomUUID()}`;
// A single scheduler tick is intentionally bounded to one claimed job.
async function rpc(name,body){return a.db(`rpc/${name}`,{method:'POST',body});}
async function runOnce(tenant='born-again-air'){
 const jobs=await rpc('pal_claim_automation_job',{p_tenant:tenant,p_worker:workerId,p_lease_seconds:900});
 const job=jobs?.[0];if(!job)return {claimed:false};
 // A heartbeat extends the job lease during slow xAI/storage operations.
 // Failure stops the worker from committing a completed job.
 let lostLease=false;let heartbeatBusy=false;
 const heartbeat=async()=>{if(heartbeatBusy||lostLease)return;heartbeatBusy=true;try{const ok=await rpc('pal_heartbeat_automation_job',{p_id:job.id,p_worker:workerId,p_lease_seconds:900});if(ok!==true)lostLease=true;}catch{lostLease=true;}finally{heartbeatBusy=false;}};
 const timer=setInterval(()=>{void heartbeat();},30000);timer.unref?.();
 let status='held',result={reason:'Role executor not activated; no external action performed',role:job.role};
 try{
  // No financial, messaging, document deletion or AI activity until role-specific
  // implementation and approval are complete. A held job remains auditable.
  if(['born-again-air','newstart'].includes(tenant) && job.role==='reader' && job.job_key.startsWith('reader:') && process.env.PAL_READER_EXECUTION==='true'){
   result=await reader.scan({tenant});
   // Each continuation has a unique deterministic key. Enqueue before completing
   // the current job so crashes cannot strand the remaining files.
   if(lostLease)throw Error('Worker lease lost during Reader processing');
   if(result.remaining>0){
    const batch=Number(job.payload?.batch||0);
    if(batch>=999)throw Error('Reader continuation safety limit reached');
    await a.enqueue(tenant,'reader',`${job.job_key.replace(/:batch:\d+$/,'')}:batch:${batch+1}`,{source:'documents',batch:batch+1,parentJob:job.id});
   }
   status='completed';
  } else if(['ceo','bookkeeper','banker','negotiator','reporter'].includes(job.role) && process.env.PAL_ADVISORY_EXECUTION==='true'){
   result=await roles.execute({tenant,job});
   status=result.mode==='held'?'held':'completed';
  }
  if(lostLease)throw Error('Worker lease lost; refusing completion');
  await a.event(tenant,job.id,status==='completed'?'job_completed':'job_held',result);
 }catch(e){status='queued';result={reason:'Audit unavailable; retry',error:e.message};}
 clearInterval(timer);
 if(lostLease)throw Error('Worker lease lost; job will be recovered after expiry');
 const finished=await rpc('pal_finish_automation_job',{p_id:job.id,p_worker:workerId,p_status:status,p_result:result});
 if(finished!==true)throw Error('Job lease expired or finish rejected');
 return {claimed:true,id:job.id,role:job.role,status};
}
module.exports={runOnce};

'use strict';
// Safe, idempotent schedule catch-up. Invoked by a frequent external cron trigger.
// Daily keys make repeated calls harmless; never execute customer-facing actions here.
const a=require('./core');
const TENANTS=['born-again-air','newstart'];
const ZONE='America/Chicago';
function localParts(now){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {day:`${parts.year}-${parts.month}-${parts.day}`,minutes:Number(parts.hour)*60+Number(parts.minute)};
}
async function scheduleTenant(tenant,now=new Date()){
 if(!TENANTS.includes(tenant))throw Error('Invalid schedule tenant');
 const TENANT=tenant;
 const {day,minutes}=localParts(now);const settings=await a.setting(TENANT);
 if(!settings.enabled)return {paused:true,day,created:[],watchdog:'paused'};
 const created=[];
 // Cron can be delayed or miss a minute. Enqueue due jobs on every subsequent tick.
 const due=[{minute:0,role:'reader',key:`reader:${day}`,payload:{source:'documents',date:day}},
 {minute:60,role:'banker',key:`banker-daily:${day}`,payload:{source:'qbo-daily',date:day}},
 {minute:240,role:'cleanup',key:`cleanup:${day}`,payload:{date:day,deleteEnabled:false}},
 {minute:360,role:'ceo',key:`daily-report:${day}`,payload:{date:day,sendEmail:false}}];
 for(const item of due){if(minutes<item.minute)continue;
   const job=await a.enqueue(TENANT,item.role,item.key,item.payload);
   if(job)created.push({role:item.role,id:job.id});
 }
 let watchdog='not-due';
 if(minutes>=1){
  const jobs=await a.db('pal_automation_jobs',{query:`tenant=eq.${TENANT}&job_key=eq.${encodeURIComponent(`reader:${day}`)}&select=id,status,attempts,started_at`});
  const reader=jobs?.[0];
  if(!reader){watchdog='missing';await a.event(TENANT,null,'reader_watchdog_missing',{day});}
  else if(reader.status==='queued'){watchdog='pending';}
  else if(reader.status==='running'){watchdog='running';}
  else if(reader.status==='completed'){watchdog='completed';}
  else {watchdog=reader.status;}
 }
 return {paused:false,day,created,watchdog};
}
async function schedule(now=new Date()){const results={};for(const tenant of TENANTS)results[tenant]=await scheduleTenant(tenant,now);return results;}
module.exports={schedule,scheduleTenant,localParts};

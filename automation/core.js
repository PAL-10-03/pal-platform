'use strict';
const crypto=require('node:crypto');
const ROLES=Object.freeze(['ceo','reader','bookkeeper','banker','sales','negotiator','reporter']);
const supa=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const configured=()=>Boolean(supa&&key);
async function db(table,{method='GET',query='',body,prefer}={}){
 if(!configured())throw Error('Supabase credentials not configured');
 const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
 if(prefer)headers.Prefer=prefer;
 const response=await fetch(`${supa}/rest/v1/${table}${query?`?${query}`:''}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error(`Supabase database ${table}: HTTP ${response.status}`);
 const raw=await response.text();return raw?JSON.parse(raw):null;
}
async function event(tenant,jobId,eventType,details={}){await db('pal_automation_events',{method:'POST',body:{tenant,job_id:jobId||null,event_type:eventType,details}});}
async function setting(tenant){const r=await db('pal_automation_settings',{query:`tenant=eq.${encodeURIComponent(tenant)}&select=tenant,enabled`});return r?.[0]||{tenant,enabled:false};}
async function enqueue(tenant,role,jobKey,payload={}){
 if(!['born-again-air','newstart'].includes(tenant)||![...ROLES,'cleanup'].includes(role))throw Error('Invalid tenant or role');
 const r=await db('pal_automation_jobs',{method:'POST',query:'on_conflict=tenant,job_key',prefer:'resolution=ignore-duplicates,return=representation',body:{tenant,role,job_key:jobKey,payload}});
 return r?.[0]||null;
}
async function listJobs(tenant){return db('pal_automation_jobs',{query:`tenant=eq.${encodeURIComponent(tenant)}&select=id,tenant,role,job_key,status,attempts,run_after,started_at,completed_at,created_at,result&order=created_at.desc&limit=50`});}
async function setEnabled(tenant,enabled){return db('pal_automation_settings',{method:'POST',query:'on_conflict=tenant',prefer:'resolution=merge-duplicates,return=representation',body:{tenant,enabled}});}
function chicagoDay(date=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function chicagoTime(date=new Date()) {return new Intl.DateTimeFormat('en-GB',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);}
function schedulerSecret(req){const token=process.env.PAL_SCHEDULER_TOKEN;const incoming=req.headers['x-pal-scheduler-token'];return Boolean(token&&incoming&&Buffer.byteLength(token)===Buffer.byteLength(incoming)&&crypto.timingSafeEqual(Buffer.from(token),Buffer.from(incoming)));}
module.exports={ROLES,configured,db,event,setting,enqueue,listJobs,setEnabled,chicagoDay,chicagoTime,schedulerSecret};

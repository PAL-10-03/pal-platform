'use strict';
// Planning only: creates held negotiation jobs, never contacts a vendor.
const a=require('./core');
const TENANTS=new Set(['born-again-air','newstart']);
const DAY=86400000;
function dayUTC(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return null;const d=new Date(`${s}T00:00:00Z`);return Number.isNaN(d.getTime())?null:d;}
function reviewPlan(v,today){
 const todayDate=dayUTC(today);if(!todayDate)throw Error('Invalid review day');
 if(v.contract_status==='unknown'||v.contract_status==='expired')return {due:false,reason:'requires_manager_review'};
 if(v.contract_status==='noncontracted'){
  const last=v.last_review_at?new Date(v.last_review_at):null;
  if(last && !Number.isFinite(last.getTime()))return {due:false,reason:'invalid_last_review_date'};
  const next=dayUTC(v.next_review_at);
  if(v.next_review_at && !next)return {due:false,reason:'invalid_next_review_date'};
  const due=next?next<=todayDate:!last||last.getTime()+30*DAY<=todayDate.getTime();
  return {due,reason:'noncontracted_30_day_review'};
 }
 if(v.contract_status==='contracted'){
  const renewal=dayUTC(v.renewal_date),notice=dayUTC(v.notice_deadline);
  if(!renewal&&!notice)return {due:false,reason:'missing_contract_dates'};
  const reviewStart=new Date(Math.min(renewal?renewal.getTime()-42*DAY:Infinity,notice?notice.getTime()-42*DAY:Infinity));
  const last=v.last_review_at?new Date(v.last_review_at):null;
  if(last && !Number.isFinite(last.getTime()))return {due:false,reason:'invalid_last_review_date'};
  const due=todayDate>=reviewStart && (!last||last<reviewStart);
  return {due,reason:'contract_review_before_deadline',reviewStart:reviewStart.toISOString().slice(0,10)};
 }
 return {due:false,reason:'invalid_status'};
}
async function enqueueDue(tenant,today){
 if(!TENANTS.has(tenant))throw Error('Invalid tenant');
 const rows=await a.db('pal_vendors',{query:`tenant=eq.${encodeURIComponent(tenant)}&select=id,contract_status,renewal_date,notice_deadline,last_review_at,next_review_at&limit=1000`});
 const created=[];
 for(const vendor of rows||[]){const plan=reviewPlan(vendor,today);if(!plan.due)continue;
  const existing=await a.db('pal_automation_jobs',{query:`tenant=eq.${encodeURIComponent(tenant)}&job_key=like.${encodeURIComponent(`vendor-review:${vendor.id}:*`)}&status=in.(queued,running,held)&select=id&limit=1`});
  if(existing?.length)continue; // One pending review per vendor, even across scheduler days.
  const job=await a.enqueue(tenant,'negotiator',`vendor-review:${vendor.id}:${plan.reviewStart||today}`,{vendorId:vendor.id,reason:plan.reason,reviewDate:today,externalContactAllowed:false});
  if(job)created.push({vendorId:vendor.id,jobId:job.id});
 }
 return {checked:(rows||[]).length,created};
}
module.exports={reviewPlan,enqueueDue};

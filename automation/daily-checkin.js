'use strict';
// Automatic CEO daily check-in. Status-only: never invent QuickBooks figures or
// present this email as an accounting report. Triggered by authenticated cron tick.
const a=require('./core');
const {localParts}=require('./schedule');
const {configuration,deliver}=require('./ceo-email');
const xai=require('./xai');
const NAMES={'born-again-air':'Born Again Air',newstart:'Newstart'};
async function run(tenant,now=new Date()){
 if(!Object.hasOwn(NAMES,tenant))throw Error('Unknown tenant');
 const {day,minutes}=localParts(now);
 if(minutes<360)return {status:'not-due',day};
 if(!(await a.setting(tenant)).enabled)return {status:'paused',day};
 // Only explicitly configured customer recipients can receive emails.
 // Do not send to the demo tenant without its own explicit recipient.
 try{configuration(tenant);}catch(e){return {status:'not-configured',day,reason:e.message};}
 const jobs=await a.listJobs(tenant);
 const today=(jobs||[]).filter(j=>j.job_key===`reader:${day}`||j.job_key===`daily-report:${day}`||j.job_key===`cleanup:${day}`);
 const reader=today.find(j=>j.job_key===`reader:${day}`);
 const readerText=reader?.status==='completed'?'Completed scheduled intake scan (this does not imply documents were received).':reader?`Intake scan status: ${reader.status}.`:'Intake scan not confirmed.';
 const held=(jobs||[]).filter(j=>j.status==='held').length;
 const failed=(jobs||[]).filter(j=>['failed','exhausted'].includes(j.status)).length;
 const body=[`Good morning, ${NAMES[tenant]}.`,'',`PAL Daily Check-in — ${day}`,'',`Automated document intake: ${readerText}`,`Automation items currently held for review (recent queue): ${held}.`,`Failed or exhausted items visible in recent queue: ${failed}.`,'','QuickBooks financial balances and reconciliations: Not verified in this check-in.','No accounting figures are being reported as zero or as confirmed.','', 'This is an operational check-in, not a financial report. Formal reports are provided separately when verified.','', 'PAL Business Solutions'].join('\n');
 let outgoing=body;
 // Optional CEO composition: bounded by verified status; no QuickBooks figures or claims of activity.
 if(process.env.PAL_CEO_GROK_COMPOSE==='true'&&tenant==='born-again-air'){
  const prompt=`Write a concise customer-facing operational Daily Check-in using ONLY the verified facts below. Do not add new facts, transactions, financial balances, approvals or promises. Preserve the explicit QuickBooks-unverified warning. Output plain text only.\n\n${body}`;
  outgoing=await xai.ask('ceo',prompt);
  if(typeof outgoing!=='string'||outgoing.length<80||outgoing.length>12000||!outgoing.toLowerCase().includes('quickbooks'))throw Error('CEO generated content failed validation; email not sent');
 }
 const result=await deliver({tenant,dispatchKey:`daily-checkin:${day}`,subject:'Daily Check-in',body:outgoing});
 return {status:'provider-accepted',day,...result};
}
module.exports={run};

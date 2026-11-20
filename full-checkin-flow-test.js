'use strict';
// No network: verifies real daily-checkin orchestration and tenant-safe delivery contract.
const assert=require('node:assert/strict');
const path=require('node:path');
const dir=path.join(__dirname,'automation');
function stub(file,exports){const id=require.resolve(path.join(dir,file));require.cache[id]={id,filename:id,loaded:true,exports};}
let sent=[];let aiCalls=[];
stub('core.js',{setting:async()=>({enabled:true}),listJobs:async()=>[{job_key:'reader:2026-11-06',status:'completed'}]});
stub('schedule.js',{localParts:()=>({day:'2026-11-06',minutes:360})});
stub('ceo-email.js',{configuration:t=>{if(t==='newstart')throw Error('Demo recipient not configured');return {customer:'approved@example.com'};},deliver:async p=>{sent.push(p);return {customerAccepted:true,ownerCopyAccepted:true};}});
stub('xai.js',{ask:async(role,prompt)=>{aiCalls.push({role,prompt});return 'Good morning, Born Again Air. Automated intake scan completed. QuickBooks financial balances and reconciliations are not verified. This is an operational check-in, not a financial report. PAL Business Solutions.';}});
process.env.PAL_CEO_GROK_COMPOSE='true';
const checkin=require('./automation/daily-checkin');
(async()=>{
 const a=await checkin.run('born-again-air');
 assert.equal(a.status,'provider-accepted');assert.equal(sent.length,1);assert.equal(sent[0].subject,'Daily Check-in');assert.equal(sent[0].dispatchKey,'daily-checkin:2026-11-06');assert.equal(aiCalls[0].role,'ceo');
 const b=await checkin.run('newstart');assert.equal(b.status,'not-configured');assert.equal(sent.length,1);
 console.log('PASS: simulated CEO Grok composition -> customer/owner dispatch; demo tenant blocked; correct subject and daily key');
})().catch(e=>{console.error(e);process.exitCode=1;});

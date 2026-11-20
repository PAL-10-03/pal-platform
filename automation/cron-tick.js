'use strict';
// Render Cron Job command: node automation/cron-tick.js
// Render cron uses UTC; run every five minutes to handle DST automatically.
(async()=>{
 const url=(process.env.PAL_CRON_TARGET_URL||'https://palbiz.app').replace(/\/$/,'')+'/api/internal/scheduler/tick';
 const token=process.env.PAL_SCHEDULER_TOKEN;
 if(!token)throw Error('PAL_SCHEDULER_TOKEN missing');
 const r=await fetch(url,{method:'POST',headers:{'x-pal-scheduler-token':token},signal:AbortSignal.timeout(55000)});
 if(!r.ok)throw Error(`Scheduler HTTP ${r.status}`);
 const result=await r.json();if(!result.ok)throw Error('Scheduler did not confirm success');
 console.log('PAL scheduler tick completed');
})().catch(e=>{console.error('PAL scheduler:',e.message);process.exitCode=1;});

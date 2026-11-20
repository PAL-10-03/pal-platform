'use strict';
const assert=require('node:assert/strict');
const roles=require('./automation/role-executor');
const xai=require('./automation/xai');
const core=require('./automation/core');
(async()=>{
 const originalAsk=xai.ask,originalEvent=core.event;
 let calls=0,events=[];
 xai.ask=async(role,prompt)=>{calls++;assert.match(prompt,/No financial postings/);return `Internal recommendation for ${role}: require verification`;};
 core.event=async(...args)=>events.push(args);
 try{
  for(const role of ['bookkeeper','banker','negotiator','reporter','ceo']){
   const result=await roles.execute({tenant:'born-again-air',job:{id:'test',role,job_key:`test:${role}`,payload:{summary:'sample'}}});
   assert.equal(result.mode,'advisory');assert.equal(result.externalActions,false);
  }
  assert.equal(calls,5);assert.equal(events.length,5);
  const scheduled=await roles.execute({tenant:'born-again-air',job:{id:'test',role:'ceo',job_key:'daily-report:2026-11-06',payload:{}}});
  assert.equal(scheduled.mode,'scheduled-ceo-handoff');assert.equal(calls,5);
  const other=await roles.execute({tenant:'newstart',job:{id:'test',role:'banker',job_key:'sample',payload:{}}});
  assert.equal(other.mode,'held');assert.equal(calls,5);
  await assert.rejects(()=>roles.execute({tenant:'bad',job:{role:'banker'}}));
  console.log('PASS: five bot roles execute read-only; scheduled CEO avoids duplicate sends; Newstart isolated; invalid tenant blocked');
 }finally{xai.ask=originalAsk;core.event=originalEvent;}
})().catch(e=>{console.error(e);process.exitCode=1;});

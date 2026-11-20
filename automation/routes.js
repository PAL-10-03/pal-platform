'use strict';
const express=require('express');const a=require('./core');const worker=require('./worker');const scheduler=require('./schedule');const vendors=require('./vendor-scheduler');const checkin=require('./daily-checkin');
module.exports=function(app,requireOwner){
 const router=express.Router();router.use(requireOwner);router.use(express.json({limit:'8kb'}));
 router.get('/status',async(req,res)=>{try{const tenant=req.query.tenant||'born-again-air';if(!['born-again-air','newstart'].includes(tenant))return res.status(400).json({error:'Invalid tenant'});res.set('Cache-Control','no-store');const [setting,jobs]=await Promise.all([a.setting(tenant),a.listJobs(tenant)]);const summary={};for(const j of jobs||[])summary[j.status]=(summary[j.status]||0)+1;res.json({tenant,enabled:setting.enabled,xaiConfigured:Boolean(process.env.XAI_API_KEY),databaseConfigured:a.configured(),roles:a.ROLES,jobs,visibleJobSummary:summary,readerExecutionEnabled:process.env.PAL_READER_EXECUTION==='true'});}catch(e){console.error('Automation status:',e.message);res.status(503).json({error:'Automation database unavailable; apply SQL setup and verify environment configuration.'});}});
 // Owner-only, opt-in connectivity test. Does not touch customer data or run automation.
 router.post('/xai-test',async(req,res)=>{try{
  if(req.body?.tenant!=='born-again-air')return res.status(400).json({error:'Only Born Again Air connectivity test is supported'});
  const xai=require('./xai');
  const reply=await xai.ask('reader','Connection test only. Reply with the exact word READY. No document is provided and no actions are requested.');
  res.set('Cache-Control','no-store');res.json({ok:true,connected:true,model:process.env.PAL_XAI_MODEL||'grok-4',reply:String(reply).slice(0,120)});
 }catch(e){console.error('xAI connection test:',e.message);res.status(503).json({ok:false,error:'xAI connection test failed',detail:String(e.message).slice(0,100)});}});
 router.post('/enabled',async(req,res)=>{try{const tenant=req.body?.tenant;const enabled=req.body?.enabled;if(!['born-again-air','newstart'].includes(tenant)||typeof enabled!=='boolean')return res.status(400).json({error:'Invalid request'});await a.setEnabled(tenant,enabled);await a.event(tenant,null,enabled?'automation_enabled':'automation_paused');res.json({ok:true,tenant,enabled});}catch(e){console.error('Automation toggle:',e.message);res.status(503).json({error:'Could not update automation setting'});}});
 router.get('/accounting-rules',async(req,res)=>{try{const tenant=req.query.tenant||'born-again-air';const rules=require('./accounting-rules');res.set('Cache-Control','no-store');res.json({tenant,rules:await rules.list(tenant)});}catch(e){res.status(400).json({error:'Unable to load tenant accounting rules'});}});
 router.post('/accounting-rules',async(req,res)=>{try{const rules=require('./accounting-rules');const rule=await rules.approve({...req.body,approved_by:req.auth?.userId||'PAL owner'});res.status(201).json({ok:true,rule});}catch(e){res.status(400).json({error:'Rule approval failed; verify inputs and SQL migration'});}});
 // Owner-only explicit test: never invent or send a financial report.
 router.post('/ceo-email/send',async(req,res)=>{try{
  if(req.body?.confirm!=='SEND_CUSTOMER_AND_OWNER_COPY')return res.status(400).json({error:'Explicit confirmation required'});
  const {deliver}=require('./ceo-email');
  const result=await deliver({tenant:req.body.tenant,dispatchKey:req.body.dispatchKey,subject:req.body.subject,body:req.body.body});
  res.set('Cache-Control','no-store');res.json({ok:true,...result});
 }catch(e){console.error('CEO email send:',e.message);res.status(503).json({error:'CEO email not confirmed; inspect dispatch ledger before retrying'});}});
 router.get('/email-status',(_req,res)=>{res.set('Cache-Control','no-store');res.json({providerConfigured:((process.env.PAL_EMAIL_PROVIDER||'gmail')==='gmail'?require('./gmail').configured():Boolean(process.env.RESEND_API_KEY&&process.env.PAL_EMAIL_FROM)),provider:process.env.PAL_EMAIL_PROVIDER||'gmail',ownerCopyConfigured:Boolean(process.env.PAL_OWNER_REPORT_EMAIL),customerRecipientsConfigured:Boolean(process.env.PAL_CUSTOMER_REPORT_RECIPIENTS_JSON),outboundEmailEnabled:process.env.PAL_CEO_EMAIL_ENABLED==='true'});});
 router.get('/gmail-connect',async(req,res)=>{try{const url=await require('./gmail-oauth').begin();res.set('Cache-Control','no-store');res.json({authorizationUrl:url});}catch(e){console.error('Gmail setup:',e.message);res.status(503).json({error:'Gmail authorization cannot start; verify Google OAuth configuration and SQL migration'});}});
 app.use('/api/owner/automation',router);
 app.get('/gmail/callback',async(req,res)=>{try{if(req.query.error)return res.status(400).send('Google authorization declined. No email connection was changed.');const result=await require('./gmail-oauth').complete(req.query.code,req.query.state);res.type('text/plain').send(`Gmail connected for ${result.email}. You can close this window.`);}catch(e){console.error('Gmail callback:',e.message);res.status(400).type('text/plain').send('Gmail authorization failed. No emails were sent.');}});
 // Scheduler is separate from owner session. Strict secret and no financial writes.
 app.post('/api/internal/scheduler/tick',async(req,res)=>{
  if(!a.schedulerSecret(req))return res.status(403).json({error:'Forbidden'});
  try{
   const plan=await scheduler.schedule();
   if(plan.paused)return res.json({ok:true,...plan});
   // Expose exhausted retries; do not leave expired jobs marked running forever.
   const recovered={};const work={};const vendorReviews={};const dailyCheckins={};
   for(const tenant of ['born-again-air','newstart']){
    if(plan[tenant]?.paused)continue;
    recovered[tenant]=await a.db('rpc/pal_recover_exhausted_jobs',{method:'POST',body:{p_tenant:tenant}});
    vendorReviews[tenant]=await vendors.enqueueDue(tenant,plan[tenant].day);
    work[tenant]=await worker.runOnce(tenant);
    try{dailyCheckins[tenant]=await checkin.run(tenant);}catch(err){console.error('Daily check-in:',err.message);dailyCheckins[tenant]={status:'error',reason:'Delivery requires review; inspect dispatch ledger'};}
   }
   res.json({ok:true,...plan,recovered,vendorReviews,work,dailyCheckins});
  }catch(e){console.error('Scheduler tick:',e.message);res.status(503).json({error:'Scheduler failed; retry safely'});}
 });
};

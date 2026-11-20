'use strict';
// Tenant-scoped report archive. This module does not email or execute Grok bots.
const crypto=require('crypto');
const express=require('express');
const TENANTS={'baa':'born-again-air','newstart':'newstart'};
function createReportStorage(app,{membership,isOwner,isSignedIn,supaUrl,supaKey,bucket,checkManagerPin}){
 const ready=Boolean(supaUrl&&supaKey);
 const base=`${supaUrl}/storage/v1/object`;
 const headers=(more={})=>({apikey:supaKey,Authorization:`Bearer ${supaKey}`,...more});
 const key=(tenant,id,ext)=>`${tenant}/reports/${id}.${ext}`;
 const fail=(res,code=502)=>res.status(code).json({error:'Private report storage unavailable'});
 const manager=(req,res,next)=>{const tenant=TENANTS[req.params.scope];if(!tenant)return res.status(404).json({error:'Unknown company'});if(!isSignedIn(req))return res.status(401).json({error:'Sign in required'});const m=membership(req);if(!m.companies.includes(tenant)||!(isOwner(req)||m.role==='manager'))return res.status(403).json({error:'Manager access required'});next();};
 async function storage(method,path,body,extra={}){const response=await fetch(`${base}/${path}`,{method,headers:headers(extra),body});if(!response.ok)throw Error(`Storage ${method} returned ${response.status}`);return response;}
 // This endpoint is reserved for PAL's trusted backend worker. Do not give its token to Grok prompts or browser clients.
 app.post('/api/internal/reports/:scope',express.raw({type:'application/pdf',limit:'15mb'}),async(req,res)=>{
  const tenant=TENANTS[req.params.scope];if(!tenant)return res.status(404).json({error:'Unknown company'});
  const secret=process.env.PAL_REPORT_INGEST_TOKEN||'';const supplied=req.get('x-pal-report-token')||'';
  if(!secret||!supplied||Buffer.byteLength(secret)!==Buffer.byteLength(supplied)||!crypto.timingSafeEqual(Buffer.from(secret),Buffer.from(supplied)))return res.status(401).json({error:'Unauthorized'});
  if(!ready)return fail(res,503);
  if(!Buffer.isBuffer(req.body)||req.body.length<8||req.body.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'A valid PDF is required'});
  const name=String(req.get('x-pal-report-name')||'').trim();const period=String(req.get('x-pal-report-period')||'').trim();
  if(!name||name.length>140||period.length>100)return res.status(400).json({error:'Invalid report name or period'});
  const id=crypto.randomUUID(),created_at=new Date().toISOString();
  const meta={id,name,period,created_at,size:req.body.length,delivery_status:'not_sent'};
  try{
   await storage('POST',`${encodeURIComponent(bucket)}/${key(tenant,id,'pdf')}`,req.body,{'Content-Type':'application/pdf','x-upsert':'false'});
   try{await storage('POST',`${encodeURIComponent(bucket)}/${key(tenant,id,'json')}`,JSON.stringify(meta),{'Content-Type':'application/json','x-upsert':'false'});}catch(err){await fetch(`${base}/${encodeURIComponent(bucket)}/${key(tenant,id,'pdf')}`,{method:'DELETE',headers:headers()});throw err;}
   res.status(201).json({ok:true,tenant,report:meta});
  }catch(e){console.error('Report archive failure:',e.message);fail(res);}
 });
 app.get('/api/:scope/reports',manager,checkManagerPin,async(req,res)=>{
  if(!ready)return fail(res,503);const tenant=TENANTS[req.params.scope];
  try{const response=await storage('POST',`list/${encodeURIComponent(bucket)}`,JSON.stringify({prefix:`${tenant}/reports/`,limit:1000,sortBy:{column:'created_at',order:'desc'}}),{'Content-Type':'application/json'});
   const objects=await response.json();const metas=(Array.isArray(objects)?objects:[]).filter(o=>/^[0-9a-f-]{36}\.json$/.test(o.name));
   const results=await Promise.all(metas.map(async o=>{try{const r=await storage('GET',`${encodeURIComponent(bucket)}/${key(tenant,o.name.slice(0,-5),'json')}`);return await r.json();}catch{return null;}}));
   res.json({reports:results.filter(Boolean).sort((a,b)=>b.created_at.localeCompare(a.created_at))});
  }catch(e){console.error('Report list failure:',e.message);fail(res);}
 });
 app.get('/api/:scope/reports/:id/download',manager,checkManagerPin,async(req,res)=>{
  if(!ready)return fail(res,503);const tenant=TENANTS[req.params.scope],id=req.params.id;
  if(!/^[0-9a-f-]{36}$/.test(id))return res.status(400).json({error:'Invalid report ID'});
  try{const response=await storage('GET',`${encodeURIComponent(bucket)}/${key(tenant,id,'pdf')}`);const bytes=Buffer.from(await response.arrayBuffer());res.set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="PAL-report-${id}.pdf"`,'Cache-Control':'no-store'}).send(bytes);}catch(e){console.error('Report download failure:',e.message);fail(res);}
 });
 app.delete('/api/:scope/reports/:id',manager,checkManagerPin,async(req,res)=>{
  if(!ready)return fail(res,503);const tenant=TENANTS[req.params.scope],id=req.params.id;
  if(!/^[0-9a-f-]{36}$/.test(id))return res.status(400).json({error:'Invalid report ID'});
  try{await storage('DELETE',`${encodeURIComponent(bucket)}/${key(tenant,id,'pdf')}`);await storage('DELETE',`${encodeURIComponent(bucket)}/${key(tenant,id,'json')}`);res.json({ok:true});}catch(e){console.error('Report deletion failure:',e.message);fail(res);}
 });
}
module.exports=createReportStorage;

require('dotenv').config();
const express = require('express');
const path = require('path');
const { clerkMiddleware, getAuth } = require('@clerk/express');
const app = express();
const PORT = process.env.PORT || 10000;
app.disable('x-powered-by');
app.use((req,res,next)=>{
 res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
 res.setHeader('Pragma','no-cache');
 res.setHeader('Expires','0');
 if(req.method==='TRACE'||req.method==='TRACK')return res.status(405).end();
 next();
});
// Baseline browser hardening; CSP is intentionally deferred until Clerk scripts are inventoried.
app.use((req,res,next)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 if(req.secure || req.get('x-forwarded-proto')==='https') res.setHeader('Strict-Transport-Security','max-age=31536000');
 next();
});
app.use((req,res,next)=>{if(!req.path.startsWith('/api/')&&!req.path.startsWith('/assets/'))res.set('Cache-Control','no-store, no-cache, must-revalidate');next();});
app.set('trust proxy', 1);
const origins = (process.env.CLERK_AUTHORIZED_PARTIES || 'https://palbiz.app,https://www.palbiz.app').split(',').map(x=>x.trim()).filter(Boolean);
app.use(clerkMiddleware({authorizedParties: origins}));
app.use('/assets',express.static(path.join(__dirname,'public'),{index:false,maxAge:0,setHeaders(res){res.setHeader('Cache-Control','no-store, max-age=0');}}));
const ownerId = process.env.PAL_OWNER_CLERK_USER_ID || '';
const companies = [{id:'born-again-air',name:'Born Again Air',short:'BAA'},{id:'newstart',name:'Newstart',short:'NS'}];
const isOwner = req => Boolean(ownerId && getAuth(req).userId === ownerId);
const isSignedIn = req => Boolean(getAuth(req).userId);
function membership(req){
  if(isOwner(req)) return {role:'pal_owner',companies:companies.map(x=>x.id)};
  const userId=getAuth(req).userId;
  if(!userId) return {role:'guest',companies:[]};
  // Optional server-managed bootstrap membership map. NEVER accept roles from browser requests.
  let map={}; try {map=JSON.parse(process.env.PAL_COMPANY_MEMBERSHIPS_JSON || '{}');}catch(e){console.error('Invalid PAL_COMPANY_MEMBERSHIPS_JSON');}
  const record=map[userId];
  // Accept either companyId (Render setup) or company (older installations).
  const company=record?.companyId || record?.company;
  if(!record || !['manager','employee'].includes(record.role) || !companies.some(c=>c.id===company)) return {role:'unassigned',companies:[]};
  return {role:record.role,companies:[company]};
}
function html(req,view,title){
  const state={view,publishableKey:process.env.CLERK_PUBLISHABLE_KEY||'',signedIn:isSignedIn(req),owner:isOwner(req),membership:membership(req),companies,dropbox:{'born-again-air':process.env.PAL_BAA_DROPBOX_URL||'',newstart:process.env.PAL_NEWSTART_DROPBOX_URL||''}};
  const safe=JSON.stringify(state).replace(/</g,'\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0a1427"><title>${title} | PAL Business Solutions</title><link rel="stylesheet" href="/assets/style.css?v=baa-excel-20261026-verified2"></head><body><div id="app"></div><script id="pal-state" type="application/json">${safe}</script>${view==='newstart'?'<script src="/assets/newstart-ops.js?v=20261108" defer></script>':''}<script src="/assets/app.js?v=baa-excel-20261026-verified2" defer></script><footer class="pal-legal-footer"><span>© 2026 PAL Business Solutions, LLC</span><span class="pal-legal-separator"> · </span><a href="/terms">Terms of Service</a><span class="pal-legal-separator"> · </span><a href="/privacy">Privacy Policy</a><span class="pal-legal-separator"> · </span><a href="mailto:admin@palbiz.app?subject=PAL%20Customer%20Support" style="color:#8c94a3;font-size:inherit;text-decoration:none">Contact Support</a></footer></body></html>`;
}
function requireOwner(req,res,next){if(!isSignedIn(req))return res.status(401).json({error:'Sign in required'});if(!isOwner(req))return res.status(403).json({error:'Owner access required'});next();}
function requireCompany(req,res,next){const c=req.params.company;if(!companies.some(x=>x.id===c))return res.status(404).json({error:'Company not found'});if(!membership(req).companies.includes(c))return res.status(403).json({error:'No access to this company'});next();}
app.get('/health',(_req,res)=>res.json({status:'ok'}));
app.get('/terms',(_req,res)=>res.sendFile(path.join(__dirname,'public','terms.html')));
app.get('/privacy',(_req,res)=>res.sendFile(path.join(__dirname,'public','privacy.html')));

// QuickBooks OAuth: tenant-restricted connection, callback, revocation, and read-only test.
require('./quickbooks-oauth')(app,{getAuth,membership,isOwner});

app.get('/',(req,res)=>res.send(html(req,'home','Home')));
app.get(['/login','/sign-in'],(req,res)=>res.send(html(req,'login','Sign In')));
app.get(['/register','/sign-up'],(req,res)=>res.send(html(req,'register','Create Account')));
app.get('/owner',(req,res)=>{if(!isSignedIn(req))return res.redirect('/login?next=owner');if(!isOwner(req))return res.status(403).send(html(req,'forbidden','Access Denied'));res.set('Cache-Control','no-store');res.send(html(req,'owner','Owner Dashboard'));});
app.get('/company/:company',(req,res)=>{
  const company=req.params.company;
  if(!companies.some(c=>c.id===company))return res.status(404).send('Company not found');
  if(!isSignedIn(req))return res.redirect('/login?next=company');
  if(!membership(req).companies.includes(company))return res.status(403).send(html(req,'forbidden','Access Denied'));
  res.set('Cache-Control','no-store');
  return res.send(html(req,company==='born-again-air'?'baa':'newstart','Company Workspace'));
});
app.get(['/app','/portal'],(req,res)=>{if(!isSignedIn(req))return res.redirect('/login?next=app');if(isOwner(req))return res.redirect('/owner');const member=membership(req);if(member.role==='manager'&&member.companies.includes('born-again-air'))return res.redirect('/company/born-again-air');res.set('Cache-Control','no-store');res.send(html(req,'customer','Workspace'));});
app.get('/api/me',(req,res)=>{if(!isSignedIn(req))return res.status(401).json({error:'Sign in required'});res.set('Cache-Control','no-store');res.json({userId:getAuth(req).userId,...membership(req)});});
// Optional private Supabase Storage documents. Service key stays SERVER SIDE.
const supaUrl=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const supaKey=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const bucket=process.env.PAL_SUPABASE_BUCKET||'pal-private-documents';
const storageReady=Boolean(supaUrl&&supaKey);
function storageHeaders(extra={}){return {apikey:supaKey,Authorization:`Bearer ${supaKey}`,...extra};}
function storagePath(company,name){return `${company}/${name}`;}
function storageError(res,status=502){return res.status(status).json({error:'Storage operation failed. Check the private Supabase bucket and configuration.'});}
app.get('/api/owner/storage-status',requireOwner,(_req,res)=>res.json({configured:storageReady,bucket}));
app.get('/api/owner/files/:company',requireOwner,requireCompany,async(req,res)=>{
  if(!storageReady)return res.json({configured:false,files:[]});
  try {const r=await fetch(`${supaUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({prefix:req.params.company,limit:100,sortBy:{column:'created_at',order:'desc'}})});
    if(!r.ok)return storageError(res);const data=await r.json();res.json({configured:true,files:(Array.isArray(data)?data:[]).filter(x=>x.name&&x.id).map(x=>({name:x.name,created_at:x.created_at,size:x.metadata?.size||0}))});
  }catch(e){console.error('Storage list error',e.message);storageError(res);}
});
app.post('/api/owner/files/:company',requireOwner,requireCompany,express.raw({type:'application/octet-stream',limit:'12mb'}),async(req,res)=>{
  if(!storageReady)return res.status(503).json({error:'Configure Supabase Storage before uploading files.'});
  const name=String(req.headers['x-pal-filename']||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._ ()-]{0,119}$/.test(name)||name==='.'||name==='..')return res.status(400).json({error:'Invalid filename'});
  if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'Empty file'});
  const safeName=`${Date.now()}-${name}`;
  try{const url=`${supaUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath(req.params.company,encodeURIComponent(safeName))}`;
    const r=await fetch(url,{method:'POST',headers:storageHeaders({'Content-Type':'application/octet-stream','x-upsert':'false'}),body:req.body});if(!r.ok)return storageError(res);res.status(201).json({ok:true,name:safeName});
  }catch(e){console.error('Storage upload error',e.message);storageError(res);}
});
app.post('/api/owner/files/:company/link',requireOwner,requireCompany,express.json({limit:'5kb'}),async(req,res)=>{
  if(!storageReady)return res.status(503).json({error:'Storage not configured'});
  const name=req.body?.name;
  if(typeof name!=='string'||!/^\d{13}-[a-zA-Z0-9][a-zA-Z0-9._ ()-]{0,119}$/.test(name))return res.status(400).json({error:'Invalid file name'});
  try{const url=`${supaUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${storagePath(req.params.company,encodeURIComponent(name))}`;
    const r=await fetch(url,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({expiresIn:60})});if(!r.ok)return storageError(res);const data=await r.json();if(!data.signedURL)return storageError(res);res.json({url:new URL(data.signedURL,supaUrl).toString()});
  }catch(e){console.error('Storage link error',e.message);storageError(res);}
});
// Draft 20.6: secondary company PIN gate. Clerk role/tenant checks remain mandatory.
// Configure PAL_BAA_MANAGER_PIN and PAL_NEWSTART_MANAGER_PIN in Render; no PINs shipped in code.
const crypto = require('crypto');
function pinForTenant(tenant){return tenant==='born-again-air'?process.env.PAL_BAA_MANAGER_PIN:process.env.PAL_NEWSTART_MANAGER_PIN;}
function checkManagerPin(req,res,next){
 const tenant=req.path.startsWith('/api/baa/')?'born-again-air':req.path.startsWith('/api/newstart/')?'newstart':null;
 if(!tenant)return next();
 const protectedPath=/^\/api\/(baa|newstart)\/(permanent(?:\/|$)|vendors(?:\/|$)|accounting(?:\/|$)|reports(?:\/|$)|documents\/move-permanent(?:\/|$))/.test(req.path)
  || (req.method==='POST' && /^\/api\/(baa|newstart)\/documents$/.test(req.path) && req.query.collection==='permanent');
 if(!protectedPath)return next();
 if(!isSignedIn(req))return res.status(401).json({error:'Sign in required'});
 const m=membership(req);
 if(!m.companies.includes(tenant)||!(isOwner(req)||m.role==='manager'))return res.status(403).json({error:'Manager role required'});
 const expected=pinForTenant(tenant);
 if(!expected)return res.status(503).json({error:'Manager PIN not configured on server'});
 const received=req.get('x-pal-manager-pin')||'';
 const a=Buffer.from(received),b=Buffer.from(expected);
 if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(403).json({error:'Manager PIN required or incorrect',code:'MANAGER_PIN_REQUIRED'});
 res.set('Cache-Control','no-store');next();
}
app.use(checkManagerPin);
app.get(['/api/baa/reports/access','/api/newstart/reports/access'],(req,res)=>{
 const tenant=req.path.startsWith('/api/baa/')?'born-again-air':'newstart';
 if(!isSignedIn(req))return res.status(401).json({error:'Sign in required'});
 if(!membership(req).companies.includes(tenant))return res.status(403).json({error:'No access to this company'});
 res.set('Cache-Control','no-store');res.json({ok:true});
});
// Shared, tenant-isolated PDF report archive (BAA and Newstart).
require('./automation/report-storage')(app,{membership,isOwner,isSignedIn,supaUrl,supaKey,bucket,checkManagerPin});
// Draft 15: owner/BAA-manager accounting reference management. No QBO writes.
const {db: palDb}=require('./automation/core');
function baaManagerAccess(req,res,next){if(!isSignedIn(req))return res.status(401).json({error:'Sign in required'});if(!(isOwner(req)||(membership(req).role==='manager'&&membership(req).companies.includes('born-again-air'))))return res.status(403).json({error:'Manager access required'});next();}
app.get('/api/baa/accounting/accounts',baaManagerAccess,async(_req,res)=>{try{const accounts=await palDb('pal_accounting_accounts',{query:'tenant=eq.born-again-air&select=id,account_number,account_name,account_type,qbo_account_id,is_active&order=account_name.asc&limit=1000'});res.set('Cache-Control','no-store');res.json({accounts});}catch(e){console.error('Accounts list',e.message);res.status(503).json({error:'Accounting database unavailable. Check migration 009.'});}});
app.post('/api/baa/accounting/accounts/import',baaManagerAccess,express.json({limit:'100kb'}),async(req,res)=>{
 const rows=req.body?.accounts;
 if(!Array.isArray(rows)||rows.length<1||rows.length>300)return res.status(400).json({error:'Provide 1 to 300 accounts per import'});
 const cleaned=[];const names=new Set();
 for(const item of rows){const name=String(item?.account_name||'').trim(),number=String(item?.account_number||'').trim(),type=String(item?.account_type||'').trim();
  if(!name||name.length>180||number.length>60||type.length>100||names.has(name.toLowerCase()))return res.status(400).json({error:'Invalid or repeated account name, number or type'});
  names.add(name.toLowerCase());cleaned.push({tenant:'born-again-air',account_name:name,account_number:number||null,account_type:type||null,is_active:true});
 }
 try{// Preserve the uploaded source workbook in private tenant-specific Storage.
   if(!storageReady)return res.status(503).json({error:'Private Storage is not configured; chart was not imported'});
   const fileName=`${Date.now()}-${crypto.randomBytes(6).toString('hex')}-chart-of-accounts.xlsx`;
   const path=`born-again-air/charts-of-accounts/${fileName}`;
   const upload=await fetch(`${supaUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','x-upsert':'false'}),body:req.body});
   if(!upload.ok)return res.status(503).json({error:'Unable to save original chart in private Storage; accounts were not imported'});
   const saved=await palDb('pal_accounting_accounts',{method:'POST',query:'on_conflict=tenant,account_name',prefer:'resolution=merge-duplicates,return=representation',body:cleaned});res.json({ok:true,imported:saved?.length||0,fileName});}catch(e){console.error('Accounts import',e.message);res.status(503).json({error:'Import failed. Existing accounts were not deliberately removed.'});}
});
// Born Again Air customer Document Center. Uses same private Supabase bucket as owner storage.
function baaDocumentAccess(req,res,next){if(!isSignedIn(req)||!membership(req).companies.includes('born-again-air'))return res.status(403).json({error:'Born Again Air access required'});next();}
const baaDocPrefix='born-again-air/documents/';
function safeDocName(name){return typeof name==='string'&&/^\d{13}-[a-f0-9]{12}-[a-zA-Z0-9][a-zA-Z0-9._ ()-]{0,119}$/.test(name);}
app.get('/api/baa/documents',baaDocumentAccess,async(_req,res)=>{
 if(!storageReady)return res.json({configured:false,files:[]});
 try{const r=await fetch(`${supaUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({prefix:baaDocPrefix,limit:1000,sortBy:{column:'created_at',order:'desc'}})});if(!r.ok)return storageError(res);const data=await r.json();const files=(Array.isArray(data)?data:[]).filter(x=>safeDocName(x.name)).map(x=>({name:x.name,displayName:x.name.replace(/^\d{13}-[a-f0-9]{12}-/,''),created_at:x.created_at,size:x.metadata?.size||0}));
  const statuses=await palDb('pal_document_status',{query:'tenant=eq.born-again-air&select=storage_path,retention_class,processing_status,verified_at,hold&limit=1000'});
  const byPath=new Map((statuses||[]).map(s=>[s.storage_path,s]));
  res.set('Cache-Control','no-store');res.json({configured:true,files:files.map(f=>({...f,status:byPath.get(baaDocPrefix+f.name)||{retention_class:'unclassified',processing_status:'uploaded',hold:false}}))});}catch(e){console.error('BAA documents list',e.message);storageError(res);}
});
app.post('/api/baa/documents',baaDocumentAccess,express.raw({type:'application/octet-stream',limit:'12mb'}),async(req,res)=>{
 if(req.query.collection==='permanent' && !(isOwner(req)||(membership(req).role==='manager'&&membership(req).companies.includes('born-again-air'))))return res.status(403).json({error:'Manager access required for Permanent Records'});
 if(!storageReady)return res.status(503).json({error:'Private Supabase storage must be configured first'});
 let name;try{name=decodeURIComponent(String(req.headers['x-pal-filename']||''));}catch{return res.status(400).json({error:'Invalid filename'});}
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._ ()-]{0,119}\.(pdf|png|jpe?g|xlsx|xls|csv)$/i.test(name))return res.status(400).json({error:'Only PDF, JPG, PNG, XLSX, XLS and CSV documents are supported'});
 if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'Empty document'});
 const isPdf=req.body.subarray(0,5).toString()==='%PDF-';const isPng=req.body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const isJpg=req.body.subarray(0,3).equals(Buffer.from([255,216,255]));
 // XLSX is ZIP-based (PK); legacy XLS uses the OLE compound-file signature.
 // CSV must be plain text, not a renamed executable or binary file.
 const isXlsx=req.body.subarray(0,4).equals(Buffer.from([80,75,3,4]));
 const isXls=req.body.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225]));
 const csvSample=req.body.subarray(0,Math.min(req.body.length,65536));
 const isCsv=!csvSample.includes(0)&&!csvSample.some(byte=>byte<9||(byte>13&&byte<32))&&new TextDecoder('utf-8',{fatal:false}).decode(csvSample).includes(',');
 if(!(isPdf&&/\.pdf$/i.test(name)||isPng&&/\.png$/i.test(name)||isJpg&&/\.jpe?g$/i.test(name)||isXlsx&&/\.xlsx$/i.test(name)||isXls&&/\.xls$/i.test(name)||isCsv&&/\.csv$/i.test(name)))return res.status(400).json({error:'File contents do not match the supported document type'});
 const id=require('crypto').randomBytes(6).toString('hex');const stored=`${Date.now()}-${id}-${name}`;
 try{const r=await fetch(`${supaUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${req.query.collection==='permanent'?'born-again-air/permanent/':baaDocPrefix}${encodeURIComponent(stored)}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/octet-stream','x-upsert':'false'}),body:req.body});if(!r.ok)return storageError(res);if(req.query.collection!=='permanent')await palDb('pal_document_status',{method:'POST',query:'on_conflict=tenant,storage_path',prefer:'resolution=merge-duplicates',body:{tenant:'born-again-air',storage_path:baaDocPrefix+stored,retention_class:'unclassified',processing_status:'uploaded',hold:true}});res.status(201).json({ok:true,name:stored,collection:req.query.collection==='permanent'?'permanent':'accounting',uploaded_at:new Date().toISOString()});}catch(e){console.error('BAA document upload',e.message);storageError(res);}
});
// Fail-closed manual accounting deletion policy. Missing or ambiguous records are protected.
function manualDeletionAllowed(paths,statuses){
 if(!Array.isArray(statuses)||statuses.length!==paths.length)return false;
 const byPath=new Map();
 for(const row of statuses){if(!row||!paths.includes(row.storage_path)||byPath.has(row.storage_path))return false;byPath.set(row.storage_path,row);}
 return paths.every(path=>{const row=byPath.get(path);return row&&row.hold===false&&row.retention_class==='temporary_accounting'&&['uploaded','needs_review'].includes(row.processing_status);});
}
// Explicit document deletion: manager or PAL owner only. Never delete unrelated box or price files.
app.post('/api/baa/documents/delete',baaDocumentAccess,express.json({limit:'50kb'}),async(req,res)=>{
 if(!(isOwner(req)||membership(req).role==='manager'))return res.status(403).json({error:'Manager access required to delete documents'});
 if(!storageReady)return res.status(503).json({error:'Storage unavailable'});
 const names=req.body?.names;
 if(!Array.isArray(names)||!names.length||names.length>100||!names.every(safeDocName)||new Set(names).size!==names.length)return res.status(400).json({error:'Select 1 to 100 valid documents'});
 try{
  const paths=names.map(name=>baaDocPrefix+name);
  const encoded=paths.map(x=>'"'+x.replaceAll('"','')+'"').join(',');
  const statuses=await palDb('pal_document_status',{query:`tenant=eq.born-again-air&storage_path=in.(${encodeURIComponent(encoded)})&select=storage_path,retention_class,processing_status,hold`});
  if(!manualDeletionAllowed(paths,statuses))return res.status(409).json({error:'Deletion blocked: each document must have an explicit temporary accounting status, no hold, and no active processing. Missing or permanent records are protected.'});
  // Record intent before storage mutation so a failed post-delete audit cannot erase history.
  const audit=await palDb('pal_document_deletion_audit',{method:'POST',prefer:'return=representation',body:paths.map(storage_path=>({tenant:'born-again-air',storage_path,deleted_by:getAuth(req).userId,reason:'manager_manual_delete',outcome:'requested'}))});
  const r=await fetch(`${supaUrl}/storage/v1/object/${encodeURIComponent(bucket)}`,{method:'DELETE',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({prefixes:paths})});
  if(!r.ok){console.error('Document deletion rejected by Supabase',r.status,(await r.text()).slice(0,300));return storageError(res);}
  const result=await r.json();
  const removed=Array.isArray(result)?result:result?.data;
  if(!Array.isArray(removed)||removed.length!==names.length)return res.status(502).json({error:'Deletion result needs verification. Refresh the document list.'});
  await palDb('pal_document_deletion_audit',{method:'PATCH',query:`id=in.(${audit.map(a=>a.id).join(',')})`,body:{outcome:'confirmed'}});
  console.info('BAA document deletion',JSON.stringify({actor:getAuth(req).userId,count:removed.length,at:new Date().toISOString()}));
  res.json({ok:true,deleted:removed.length});
 }catch(e){console.error('BAA document deletion error',e.message);storageError(res);}
});
app.post('/api/baa/documents/link',baaDocumentAccess,express.json({limit:'5kb'}),async(req,res)=>{
 const name=req.body?.name;if(!safeDocName(name))return res.status(400).json({error:'Invalid document'});if(!storageReady)return res.status(503).json({error:'Storage unavailable'});
 try{const r=await fetch(`${supaUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${baaDocPrefix}${encodeURIComponent(name)}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({expiresIn:60})});if(!r.ok)return storageError(res);const data=await r.json();if(!data.signedURL)return storageError(res);res.json({url:new URL(data.signedURL,supaUrl).toString()});}catch(e){console.error('BAA document download',e.message);storageError(res);}
});

// Draft 16: Newstart uses the same protected document and accounting workflow,
// isolated by tenant and storage prefix. No QuickBooks Desktop writes.
function newstartManagerAccess(req,res,next){if(!isSignedIn(req))return res.status(401).json({error:'Sign in required'});if(!(isOwner(req)||(membership(req).role==='manager'&&membership(req).companies.includes('newstart'))))return res.status(403).json({error:'Manager access required'});next();}
app.get('/api/newstart/accounting/accounts',newstartManagerAccess,async(_req,res)=>{try{const accounts=await palDb('pal_accounting_accounts',{query:'tenant=eq.newstart&select=id,account_number,account_name,account_type,qbo_account_id,is_active&order=account_name.asc&limit=1000'});res.set('Cache-Control','no-store');res.json({accounts});}catch(e){console.error('Accounts list',e.message);res.status(503).json({error:'Accounting database unavailable. Check migration 009.'});}});
app.post('/api/newstart/accounting/accounts/import',newstartManagerAccess,express.json({limit:'100kb'}),async(req,res)=>{
 const rows=req.body?.accounts;
 if(!Array.isArray(rows)||rows.length<1||rows.length>300)return res.status(400).json({error:'Provide 1 to 300 accounts per import'});
 const cleaned=[];const names=new Set();
 for(const item of rows){const name=String(item?.account_name||'').trim(),number=String(item?.account_number||'').trim(),type=String(item?.account_type||'').trim();
  if(!name||name.length>180||number.length>60||type.length>100||names.has(name.toLowerCase()))return res.status(400).json({error:'Invalid or repeated account name, number or type'});
  names.add(name.toLowerCase());cleaned.push({tenant:'newstart',account_name:name,account_number:number||null,account_type:type||null,is_active:true});
 }
 try{// Preserve the uploaded source workbook in private tenant-specific Storage.
   if(!storageReady)return res.status(503).json({error:'Private Storage is not configured; chart was not imported'});
   const fileName=`${Date.now()}-${crypto.randomBytes(6).toString('hex')}-chart-of-accounts.xlsx`;
   const path=`born-again-air/charts-of-accounts/${fileName}`;
   const upload=await fetch(`${supaUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','x-upsert':'false'}),body:req.body});
   if(!upload.ok)return res.status(503).json({error:'Unable to save original chart in private Storage; accounts were not imported'});
   const saved=await palDb('pal_accounting_accounts',{method:'POST',query:'on_conflict=tenant,account_name',prefer:'resolution=merge-duplicates,return=representation',body:cleaned});res.json({ok:true,imported:saved?.length||0,fileName});}catch(e){console.error('Accounts import',e.message);res.status(503).json({error:'Import failed. Existing accounts were not deliberately removed.'});}
});
// Excel-only chart-of-accounts import. No QuickBooks posting or financial actions.
const ExcelJS = require('exceljs');
for(const [tenant,apiName,manager] of [['born-again-air','baa',baaManagerAccess],['newstart','newstart',newstartManagerAccess]]){
 app.post(`/api/${apiName}/accounting/accounts/import-excel`,manager,express.raw({type:'application/octet-stream',limit:'5mb'}),async(req,res)=>{
  try{
   if(!Buffer.isBuffer(req.body)||req.body.length<100||req.body.length>5*1024*1024)return res.status(400).json({error:'Upload a valid .xlsx file under 5 MB'});
   const book=new ExcelJS.Workbook();await book.xlsx.load(req.body);
   const sheet=book.worksheets[0];if(!sheet)return res.status(400).json({error:'Excel workbook has no worksheet'});
   const value=c=>String(c?.text||c?.value?.text||c?.value||'').trim();
   const first=sheet.getRow(1),header=[1,2,3].map(i=>value(first.getCell(i)).toLowerCase());
   const hasHeader=header.some(x=>/account|number|type|name/.test(x));
   const rows=[];const names=new Set();
   sheet.eachRow((row,n)=>{if(n===1&&hasHeader)return;const a=value(row.getCell(1)),b=value(row.getCell(2)),c=value(row.getCell(3));if(!a&&!b&&!c)return;rows.push({account_number:a,account_name:b,account_type:c});});
   if(!rows.length||rows.length>300)return res.status(400).json({error:'Excel sheet must contain 1 to 300 accounts, with columns Number, Account Name, Account Type'});
   const cleaned=[];
   for(const item of rows){const name=item.account_name,number=item.account_number,type=item.account_type;
    if(!name||name.length>180||number.length>60||type.length>100||names.has(name.toLowerCase()))return res.status(400).json({error:'Invalid or duplicate account. Expected columns: Number, Account Name, Account Type'});
    names.add(name.toLowerCase());cleaned.push({tenant,account_name:name,account_number:number||null,account_type:type||null,is_active:true});
   }
   // Preserve the uploaded source workbook in private tenant-specific Storage.
   if(!storageReady)return res.status(503).json({error:'Private Storage is not configured; chart was not imported'});
   const fileName=`${Date.now()}-${crypto.randomBytes(6).toString('hex')}-chart-of-accounts.xlsx`;
   const path=`born-again-air/charts-of-accounts/${fileName}`;
   const upload=await fetch(`${supaUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','x-upsert':'false'}),body:req.body});
   if(!upload.ok)return res.status(503).json({error:'Unable to save original chart in private Storage; accounts were not imported'});
   const saved=await palDb('pal_accounting_accounts',{method:'POST',query:'on_conflict=tenant,account_name',prefer:'resolution=merge-duplicates,return=representation',body:cleaned});res.json({ok:true,imported:saved?.length||0,fileName});
  }catch(e){console.error('Excel accounts import',e.message);res.status(400).json({error:'Could not read Excel accounts. Use a standard .xlsx workbook with Number, Account Name, Account Type columns.'});}
 });
}
// Private chart-of-accounts workbooks: manager/PAL owner only, per tenant.
for(const [apiName,tenant,manager] of [['baa','born-again-air',baaManagerAccess],['newstart','newstart',newstartManagerAccess]]){
 const prefix=`${tenant}/charts-of-accounts/`;
 app.get(`/api/${apiName}/accounting/charts`,manager,async(_req,res)=>{
  if(!storageReady)return res.status(503).json({error:'Storage unavailable'});
  try{const r=await fetch(`${supaUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({prefix,limit:1000,sortBy:{column:'created_at',order:'desc'}})});if(!r.ok)return storageError(res);const files=(await r.json()).filter(x=>/^\d{13}-[a-f0-9]{12}-chart-of-accounts\.xlsx$/.test(x.name)).map(x=>({name:x.name,created_at:x.created_at,size:x.metadata?.size||0}));res.set('Cache-Control','no-store');res.json({files});}catch(e){console.error('Chart list',e.message);storageError(res);}
 });
 app.post(`/api/${apiName}/accounting/charts/link`,manager,express.json({limit:'2kb'}),async(req,res)=>{
  const name=req.body?.name;if(typeof name!=='string'||!/^\d{13}-[a-f0-9]{12}-chart-of-accounts\.xlsx$/.test(name))return res.status(400).json({error:'Invalid chart'});
  try{const r=await fetch(`${supaUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${prefix}${name}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({expiresIn:60})});if(!r.ok)return storageError(res);const d=await r.json();res.json({url:new URL(d.signedURL,supaUrl).toString()});}catch(e){storageError(res);}
 });
 app.post(`/api/${apiName}/accounting/charts/delete`,manager,express.json({limit:'2kb'}),async(req,res)=>{
  const name=req.body?.name;if(typeof name!=='string'||!/^\d{13}-[a-f0-9]{12}-chart-of-accounts\.xlsx$/.test(name)||req.body?.confirm!==true)return res.status(400).json({error:'Invalid chart deletion'});
  try{const r=await fetch(`${supaUrl}/storage/v1/object/${encodeURIComponent(bucket)}`,{method:'DELETE',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({prefixes:[prefix+name]})});if(!r.ok)return storageError(res);res.json({ok:true,message:'Workbook removed; imported account records remain until separately removed.'});}catch(e){storageError(res);}
 });
}
// Newstart customer Document Center. Uses same private Supabase bucket as owner storage.
function newstartDocumentAccess(req,res,next){if(!isSignedIn(req)||!membership(req).companies.includes('newstart'))return res.status(403).json({error:'Newstart access required'});next();}
const newstartDocPrefix='newstart/documents/';

app.get('/api/newstart/documents',newstartDocumentAccess,async(_req,res)=>{
 if(!storageReady)return res.json({configured:false,files:[]});
 try{const r=await fetch(`${supaUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({prefix:newstartDocPrefix,limit:1000,sortBy:{column:'created_at',order:'desc'}})});if(!r.ok)return storageError(res);const data=await r.json();const files=(Array.isArray(data)?data:[]).filter(x=>safeDocName(x.name)).map(x=>({name:x.name,displayName:x.name.replace(/^\d{13}-[a-f0-9]{12}-/,''),created_at:x.created_at,size:x.metadata?.size||0}));
  const statuses=await palDb('pal_document_status',{query:'tenant=eq.newstart&select=storage_path,retention_class,processing_status,verified_at,hold&limit=1000'});
  const byPath=new Map((statuses||[]).map(s=>[s.storage_path,s]));
  res.set('Cache-Control','no-store');res.json({configured:true,files:files.map(f=>({...f,status:byPath.get(newstartDocPrefix+f.name)||{retention_class:'unclassified',processing_status:'uploaded',hold:false}}))});}catch(e){console.error('Newstart documents list',e.message);storageError(res);}
});
app.post('/api/newstart/documents',newstartDocumentAccess,express.raw({type:'application/octet-stream',limit:'12mb'}),async(req,res)=>{
 if(req.query.collection==='permanent' && !(isOwner(req)||(membership(req).role==='manager'&&membership(req).companies.includes('newstart'))))return res.status(403).json({error:'Manager access required for Permanent Records'});
 if(!storageReady)return res.status(503).json({error:'Private Supabase storage must be configured first'});
 let name;try{name=decodeURIComponent(String(req.headers['x-pal-filename']||''));}catch{return res.status(400).json({error:'Invalid filename'});}
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._ ()-]{0,119}\.(pdf|png|jpe?g|xlsx|xls|csv)$/i.test(name))return res.status(400).json({error:'Only PDF, JPG, PNG, XLSX, XLS and CSV documents are supported'});
 if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'Empty document'});
 const isPdf=req.body.subarray(0,5).toString()==='%PDF-';const isPng=req.body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const isJpg=req.body.subarray(0,3).equals(Buffer.from([255,216,255]));
 // XLSX is ZIP-based (PK); legacy XLS uses the OLE compound-file signature.
 // CSV must be plain text, not a renamed executable or binary file.
 const isXlsx=req.body.subarray(0,4).equals(Buffer.from([80,75,3,4]));
 const isXls=req.body.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225]));
 const csvSample=req.body.subarray(0,Math.min(req.body.length,65536));
 const isCsv=!csvSample.includes(0)&&!csvSample.some(byte=>byte<9||(byte>13&&byte<32))&&new TextDecoder('utf-8',{fatal:false}).decode(csvSample).includes(',');
 if(!(isPdf&&/\.pdf$/i.test(name)||isPng&&/\.png$/i.test(name)||isJpg&&/\.jpe?g$/i.test(name)||isXlsx&&/\.xlsx$/i.test(name)||isXls&&/\.xls$/i.test(name)||isCsv&&/\.csv$/i.test(name)))return res.status(400).json({error:'File contents do not match the supported document type'});
 const id=require('crypto').randomBytes(6).toString('hex');const stored=`${Date.now()}-${id}-${name}`;
 try{const r=await fetch(`${supaUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${req.query.collection==='permanent'?'newstart/permanent/':newstartDocPrefix}${encodeURIComponent(stored)}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/octet-stream','x-upsert':'false'}),body:req.body});if(!r.ok)return storageError(res);if(req.query.collection!=='permanent')await palDb('pal_document_status',{method:'POST',query:'on_conflict=tenant,storage_path',prefer:'resolution=merge-duplicates',body:{tenant:'newstart',storage_path:newstartDocPrefix+stored,retention_class:'unclassified',processing_status:'uploaded',hold:true}});res.status(201).json({ok:true,name:stored,collection:req.query.collection==='permanent'?'permanent':'accounting',uploaded_at:new Date().toISOString()});}catch(e){console.error('Newstart document upload',e.message);storageError(res);}
});
// Explicit document deletion: manager or PAL owner only. Never delete unrelated box or price files.
app.post('/api/newstart/documents/delete',newstartDocumentAccess,express.json({limit:'50kb'}),async(req,res)=>{
 if(!(isOwner(req)||membership(req).role==='manager'))return res.status(403).json({error:'Manager access required to delete documents'});
 if(!storageReady)return res.status(503).json({error:'Storage unavailable'});
 const names=req.body?.names;
 if(!Array.isArray(names)||!names.length||names.length>100||!names.every(safeDocName)||new Set(names).size!==names.length)return res.status(400).json({error:'Select 1 to 100 valid documents'});
 try{
  const paths=names.map(name=>newstartDocPrefix+name);
  const encoded=paths.map(x=>'"'+x.replaceAll('"','')+'"').join(',');
  const statuses=await palDb('pal_document_status',{query:`tenant=eq.newstart&storage_path=in.(${encodeURIComponent(encoded)})&select=storage_path,retention_class,processing_status,hold`});
  if(!manualDeletionAllowed(paths,statuses))return res.status(409).json({error:'Deletion blocked: each document must have an explicit temporary accounting status, no hold, and no active processing. Missing or permanent records are protected.'});
  // Record intent before storage mutation so a failed post-delete audit cannot erase history.
  const audit=await palDb('pal_document_deletion_audit',{method:'POST',prefer:'return=representation',body:paths.map(storage_path=>({tenant:'newstart',storage_path,deleted_by:getAuth(req).userId,reason:'manager_manual_delete',outcome:'requested'}))});
  const r=await fetch(`${supaUrl}/storage/v1/object/${encodeURIComponent(bucket)}`,{method:'DELETE',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({prefixes:paths})});
  if(!r.ok){console.error('Document deletion rejected by Supabase',r.status,(await r.text()).slice(0,300));return storageError(res);}
  const result=await r.json();
  const removed=Array.isArray(result)?result:result?.data;
  if(!Array.isArray(removed)||removed.length!==names.length)return res.status(502).json({error:'Deletion result needs verification. Refresh the document list.'});
  await palDb('pal_document_deletion_audit',{method:'PATCH',query:`id=in.(${audit.map(a=>a.id).join(',')})`,body:{outcome:'confirmed'}});
  console.info('Newstart document deletion',JSON.stringify({actor:getAuth(req).userId,count:removed.length,at:new Date().toISOString()}));
  res.json({ok:true,deleted:removed.length});
 }catch(e){console.error('Newstart document deletion error',e.message);storageError(res);}
});
app.post('/api/newstart/documents/link',newstartDocumentAccess,express.json({limit:'5kb'}),async(req,res)=>{
 const name=req.body?.name;if(!safeDocName(name))return res.status(400).json({error:'Invalid document'});if(!storageReady)return res.status(503).json({error:'Storage unavailable'});
 try{const r=await fetch(`${supaUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${newstartDocPrefix}${encodeURIComponent(name)}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({expiresIn:60})});if(!r.ok)return storageError(res);const data=await r.json();if(!data.signedURL)return storageError(res);res.json({url:new URL(data.signedURL,supaUrl).toString()});}catch(e){console.error('Newstart document download',e.message);storageError(res);}
});

require('./baa-api')(app,{manager:req=>membership(req).companies.includes('born-again-air')&&(isOwner(req)||membership(req).role==='manager'),user:req=>getAuth(req).userId});
require('./automation/routes')(app,requireOwner);
app.use(express.json({limit:'100kb'}));
// Draft 17: permanent records have a separate storage prefix, never enter the accounting cleanup scanner.
for (const [tenant,apiName] of [['born-again-air','baa'],['newstart','newstart']]) {
 const access=apiName==='baa'?baaDocumentAccess:newstartDocumentAccess;
 const manager=apiName==='baa'?baaManagerAccess:newstartManagerAccess;
 const prefix=`${tenant}/permanent/`;
 app.get(`/api/${apiName}/permanent`,access,async(req,res)=>{
  if(!storageReady)return res.json({configured:false,files:[]});
  try {const r=await fetch(`${supaUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({prefix,limit:1000,sortBy:{column:'created_at',order:'desc'}})});
   if(!r.ok)return storageError(res);const files=(await r.json()).filter(f=>safeDocName(f.name)).map(f=>({name:f.name,displayName:f.name.replace(/^\d{13}-[a-f0-9]{12}-/,''),created_at:f.created_at,size:f.metadata?.size||0,status:{retention_class:'permanent',processing_status:'permanent',hold:true}}));res.set('Cache-Control','no-store');res.json({configured:true,files});
  }catch(e){console.error('Permanent list',e.message);storageError(res);}
 });
 app.post(`/api/${apiName}/permanent/link`,access,express.json({limit:'5kb'}),async(req,res)=>{
  const name=req.body?.name;if(!safeDocName(name))return res.status(400).json({error:'Invalid document'});if(!storageReady)return res.status(503).json({error:'Storage unavailable'});
  try{const r=await fetch(`${supaUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${prefix}${encodeURIComponent(name)}`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({expiresIn:60})});if(!r.ok)return storageError(res);const data=await r.json();res.json({url:new URL(data.signedURL,supaUrl).toString()});}catch(e){console.error('Permanent link',e.message);storageError(res);}
 });
 // Human-only removal: archive a recoverable copy first; bots have no access to this route.
 app.post(`/api/${apiName}/permanent/delete`,manager,express.json({limit:'5kb'}),async(req,res)=>{
  const name=req.body?.name;
  if(!safeDocName(name)||req.body?.confirm!==true)return res.status(400).json({error:'Select a valid file and explicitly confirm removal'});
  if(!storageReady)return res.status(503).json({error:'Storage unavailable'});
  const source=`${prefix}${name}`;
  const archive=`${tenant}/permanent-archive/${Date.now()}-${require('crypto').randomBytes(6).toString('hex')}-${name}`;
  try {
   const copy=await fetch(`${supaUrl}/storage/v1/object/copy`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({bucketId:bucket,sourceKey:source,destinationKey:archive})});
   if(!copy.ok)return res.status(502).json({error:'Removal blocked: recovery copy could not be saved'});
   const del=await fetch(`${supaUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${source.split('/').map(encodeURIComponent).join('/')}`,{method:'DELETE',headers:storageHeaders()});
   if(!del.ok)return res.status(502).json({error:'Recovery copy saved, but active record could not be removed'});
   console.info('Permanent record manually archived',JSON.stringify({tenant,name,archive,actor:getAuth(req).userId}));
   res.json({ok:true,message:'Removed from Permanent Records. A recovery copy was retained in the private archive.'});
  }catch(e){console.error('Permanent removal failed',e.message);res.status(503).json({error:'Removal failed; check active and archived files before retrying'});}
 });
 // Moving requires manager confirmation and storage copy before deletion. No auto move.
 app.post(`/api/${apiName}/documents/move-permanent`,manager,express.json({limit:'5kb'}),async(req,res)=>{
  const name=req.body?.name;if(!safeDocName(name))return res.status(400).json({error:'Invalid document'});
  const source=`${tenant}/documents/${name}`,target=`${tenant}/permanent/${name}`;
  try{const r=await fetch(`${supaUrl}/storage/v1/object/copy`,{method:'POST',headers:storageHeaders({'Content-Type':'application/json'}),body:JSON.stringify({bucketId:bucket,sourceKey:source,destinationKey:target})});if(!r.ok)return res.status(502).json({error:'Could not copy document; original was retained'});
   // Do not remove source automatically: avoids losing Reader/QuickBooks references. Explicitly disclose duplicate.
   await palDb('pal_document_status',{method:'POST',query:'on_conflict=tenant,storage_path',prefer:'resolution=merge-duplicates',body:{tenant,storage_path:source,retention_class:'permanent',processing_status:'needs_review',hold:true}});
   res.json({ok:true,message:'Protected copy saved in Permanent Records. Original accounting upload retained on hold for review.'});
  }catch(e){console.error('Move permanent',e.message);res.status(503).json({error:'Copy or protection failed; verify both locations before proceeding'});}
 });
 app.get(`/api/${apiName}/vendors`,manager,async(req,res)=>{try{const vendors=await palDb('pal_vendors',{query:`tenant=eq.${tenant}&select=*&order=name.asc&limit=1000`});res.set('Cache-Control','no-store');res.json({vendors});}catch(e){res.status(503).json({error:'Vendor database unavailable. Apply migration 011.'});}});
 app.post(`/api/${apiName}/vendors`,manager,express.json({limit:'15kb'}),async(req,res)=>{
  const v=req.body||{};const name=String(v.name||'').trim(),status=String(v.contract_status||'unknown'),notes=String(v.manager_notes||'').trim();
  if(!name||name.length>180||!['contracted','noncontracted','unknown','expired'].includes(status)||notes.length>6000)return res.status(400).json({error:'Invalid vendor details'});
  const date=x=>!x?null:/^\d{4}-\d{2}-\d{2}$/.test(x)?x:false;
  const renewal=date(v.renewal_date),notice=date(v.notice_deadline),baseline=date(v.baseline_review_date);if(renewal===false||notice===false||baseline===false)return res.status(400).json({error:'Dates must use YYYY-MM-DD'});
  const interval=Number(v.review_interval_days||30);if(![30,45,60,90].includes(interval))return res.status(400).json({error:'Invalid review interval'});
  if(status==='noncontracted'&&!baseline)return res.status(400).json({error:'Choose a baseline review date for noncontracted vendors'});
  const nextReview=status==='noncontracted'?new Date(Date.parse(baseline+'T12:00:00Z')+interval*86400000).toISOString():null;
  try{const saved=await palDb('pal_vendors',{method:'POST',query:'on_conflict=tenant,name',prefer:'resolution=merge-duplicates,return=representation',body:{tenant,name,contract_status:status,manager_notes:notes,renewal_date:status==='noncontracted'?null:renewal,notice_deadline:status==='noncontracted'?null:notice,baseline_review_date:status==='noncontracted'?baseline:null,review_interval_days:status==='noncontracted'?interval:null,next_review_at:nextReview,updated_at:new Date().toISOString()}});res.json({vendor:saved[0]});}catch(e){res.status(503).json({error:'Vendor save failed'});}
 });
 app.patch(`/api/${apiName}/vendors/:id`,manager,express.json({limit:'15kb'}),async(req,res)=>{
  const id=req.params.id;if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'Invalid vendor ID'});
  const v=req.body||{},status=String(v.contract_status||'unknown'),notes=String(v.manager_notes||'').trim();
  if(!['contracted','noncontracted','unknown','expired'].includes(status)||notes.length>6000)return res.status(400).json({error:'Invalid vendor details'});
  const date=x=>!x?null:/^\d{4}-\d{2}-\d{2}$/.test(x)?x:false;
  const renewal=date(v.renewal_date),notice=date(v.notice_deadline),baseline=date(v.baseline_review_date);if(renewal===false||notice===false||baseline===false)return res.status(400).json({error:'Invalid date'});
  const interval=Number(v.review_interval_days||30);if(![30,45,60,90].includes(interval))return res.status(400).json({error:'Invalid review interval'});
  if(status==='noncontracted'&&!baseline)return res.status(400).json({error:'Choose a baseline review date for noncontracted vendors'});
  const nextReview=status==='noncontracted'?new Date(Date.parse(baseline+'T12:00:00Z')+interval*86400000).toISOString():null;
  try{const saved=await palDb('pal_vendors',{method:'PATCH',query:`tenant=eq.${tenant}&id=eq.${id}`,prefer:'return=representation',body:{contract_status:status,manager_notes:notes,renewal_date:status==='noncontracted'?null:renewal,notice_deadline:status==='noncontracted'?null:notice,baseline_review_date:status==='noncontracted'?baseline:null,review_interval_days:status==='noncontracted'?interval:null,next_review_at:nextReview,updated_at:new Date().toISOString()}});if(!saved.length)return res.status(404).json({error:'Vendor not found in this company'});res.json({vendor:saved[0]});}catch(e){res.status(503).json({error:'Vendor update failed'});}
 });
 app.get(`/api/${apiName}/vendors/:id/history`,manager,async(req,res)=>{if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.status(400).json({error:'Invalid vendor ID'});try{const history=await palDb('pal_vendor_history',{query:`tenant=eq.${tenant}&vendor_id=eq.${req.params.id}&select=*&order=created_at.desc&limit=250`});res.json({history});}catch(e){res.status(503).json({error:'History unavailable'});}});
}


// Manager-controlled record removal. Accounts are deactivated to preserve references.
for(const [apiName,tenant,manager] of [['baa','born-again-air',baaManagerAccess],['newstart','newstart',newstartManagerAccess]]){
 app.delete(`/api/${apiName}/accounting/accounts/:id`,manager,async(req,res)=>{
  const id=req.params.id;if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'Invalid account ID'});
  try{const rows=await palDb('pal_accounting_accounts',{method:'PATCH',query:`tenant=eq.${tenant}&id=eq.${id}`,prefer:'return=representation',body:{is_active:false}});if(!rows.length)return res.status(404).json({error:'Account not found'});res.json({ok:true});}
  catch(e){console.error('Account remove',e.message);res.status(503).json({error:'Account could not be removed'});}
 });
 app.delete(`/api/${apiName}/vendors/:id`,manager,async(req,res)=>{
  const id=req.params.id;if(!/^[0-9a-f-]{36}$/i.test(id))return res.status(400).json({error:'Invalid vendor ID'});
  try{
   const history=await palDb('pal_vendor_history',{query:`tenant=eq.${tenant}&vendor_id=eq.${id}&select=id&limit=1`});
   if(history.length)return res.status(409).json({error:'Vendor has negotiation history and cannot be deleted. Keep it for the audit trail.'});
   const rows=await palDb('pal_vendors',{method:'DELETE',query:`tenant=eq.${tenant}&id=eq.${id}`,prefer:'return=representation'});
   if(!rows.length)return res.status(404).json({error:'Vendor not found'});
   res.json({ok:true});
  }catch(e){console.error('Vendor remove',e.message);res.status(503).json({error:'Vendor could not be removed'});}
 });
}

// Newstart-only module. Does not register any Born Again Air routes.
require('./newstart-operations')(app,{db:palDb,membership,isOwner,isSignedIn,getAuth});
// Newstart-only recurring checklist maintenance (not a Grok bot).
// Idempotent database function creates at most one checklist per house/month.
async function palNewstartMonthlyChecklists(){
 try {const month=new Date().toISOString().slice(0,7)+'-01';await palDb('rpc/pal_ns_ensure_monthly',{method:'POST',body:{p_month:month,p_actor:'pal-newstart-system'}});}
 catch(e){console.warn('Newstart monthly checklist creation deferred:',e.message);}
}
if(process.env.PAL_NEWSTART_MONTHLY_CHECKLISTS==='true'){
 setTimeout(palNewstartMonthlyChecklists,15000);
 const timer=setInterval(palNewstartMonthlyChecklists,6*60*60*1000);timer.unref?.();
}


// Register the terminal 404 handler only after all company routes.
app.use((_req,res)=>res.status(404).send('Page not found'));
app.listen(PORT,()=>console.log(`PAL listening on ${PORT}`));

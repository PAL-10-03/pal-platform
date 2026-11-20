'use strict';
// PAL QuickBooks Online OAuth — BAA only, no accounting writes.
const crypto = require('crypto');
const TENANT = 'born-again-air';
const BASE = 'https://palbiz.app';
const CALLBACK = `${BASE}/quickbooks/callback`;
const INTUIT_AUTH = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const API_BASE = 'https://quickbooks.api.intuit.com/v3/company';
const enc = v => encodeURIComponent(v);
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
module.exports = function registerQuickBooks(app, { getAuth, membership, isOwner }) {
 const supa = (process.env.SUPABASE_URL||'').replace(/\/$/,'');
 const supaKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
 const clientId = process.env.QBO_CLIENT_ID || '';
 const secret = process.env.QBO_CLIENT_SECRET || '';
 const rawKey = process.env.QBO_TOKEN_ENCRYPTION_KEY || '';
 const key = /^[0-9a-f]{64}$/i.test(rawKey) ? Buffer.from(rawKey,'hex') : null;
 const ready = () => Boolean(supa && supaKey && clientId && secret && key);
 const trustedOrigins = new Set(['https://palbiz.app','https://www.palbiz.app']);
 function requireSameOrigin(req,res,next) {
  const origin=req.get('origin');
  if (!origin || !trustedOrigins.has(origin)) return res.status(403).send('Invalid request origin');
  const fetchSite=req.get('sec-fetch-site');
  if (fetchSite && !['same-origin','same-site'].includes(fetchSite)) return res.status(403).send('Cross-site request rejected');
  next();
 }
 // Diagnostic records contain only fixed categories, HTTP status, Intuit TID, and time.
 // Never store request/response bodies, OAuth parameters, tokens, vendor names, or company data.
 const safeTid = value => typeof value==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
 const safeStatus = value => Number.isInteger(value) && value>=100 && value<=599 ? value : null;
 const safeCategory = value => ['oauth_token','oauth_callback','oauth_revoke','api_query','api_validation','api_syntax','network'].includes(value) ? value : 'network';
 async function recordError(category,status,tid){
  const entry={tenant:TENANT,category:safeCategory(category),http_status:safeStatus(status),intuit_tid:safeTid(tid)};
  try {await db('pal_qbo_error_logs',{method:'POST',body:entry});}
  catch (_) {console.error('PAL QBO diagnostic persistence unavailable',entry.category,entry.http_status,entry.intuit_tid||'no-tid');}
 }
 const tidOf = r => safeTid(r.headers?.get?.('intuit_tid'));
 function classifyApiFailure(status){
  if(status===400)return 'api_validation';
  if(status===422)return 'api_validation';
  if(status===404)return 'api_syntax';
  return 'api_query';
 }
 const headers = {apikey:supaKey, Authorization:`Bearer ${supaKey}`,'Content-Type':'application/json'};
 const auth = 'Basic '+Buffer.from(`${clientId}:${secret}`).toString('base64');
 function authorized(req,res,next) {
  const user = getAuth(req).userId;
  if(!user) return res.redirect('/login');
  const m = membership(req);
  if(!(isOwner(req) || (m.role==='manager' && m.companies.includes(TENANT)))) return res.status(403).send('Company manager access required');
  next();
 }
 function page(title,body) {return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | PAL</title><link rel="stylesheet" href="/assets/style.css"></head><body><main style="max-width:680px;margin:10vh auto;padding:28px;font:16px/1.6 system-ui"><h1>${esc(title)}</h1>${body}<p><a href="/company/born-again-air">Return to BAA workspace</a></p></main><footer class="pal-legal-footer">© 2026 PAL Business Solutions, LLC · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer></body></html>`;}
 async function db(table,{method='GET',query='',body,prefer}={}) {
  if(!supa||!supaKey) throw new Error('Database not configured');
  const r = await fetch(`${supa}/rest/v1/${table}${query?'?'+query:''}`,{method,headers:{...headers,...(prefer?{Prefer:prefer}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  if(!r.ok) throw new Error(`QuickBooks database ${table} request failed (${r.status})`);
  const t=await r.text(); return t?JSON.parse(t):[];
 }
 function encrypt(obj){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(JSON.stringify(obj),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
 function decrypt(s){const b=Buffer.from(s,'base64');const dec=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));dec.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([dec.update(b.subarray(28)),dec.final()]).toString('utf8'));}
 // Retry only transient network failures, 429, and 5xx; never retry invalid_grant or other 4xx.
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function resilientFetch(url,options,attempts=3){
  for(let i=0;i<attempts;i++){
   try{
    const r=await fetch(url,options);
    if((r.status===429||r.status>=500) && i<attempts-1){await sleep(Math.min(1500,250*2**i));continue;}
    return r;
   }catch(e){if(i===attempts-1)throw e;await sleep(Math.min(1500,250*2**i));}
  }
 }
 class ReconnectRequired extends Error {constructor(){super('QuickBooks authorization expired; reconnect required');this.name='ReconnectRequired';}}
 async function tokenRequest(params){
  const r=await resilientFetch(TOKEN_URL,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams(params)});
  if(!r.ok){
   await recordError('oauth_token',r.status,tidOf(r));
   const data=await r.json().catch(()=>({}));
   if(r.status===400 && (data.error==='invalid_grant'||data.error==='invalid_token'))throw new ReconnectRequired();
   throw new Error(`Intuit token request failed (${r.status})`);
  }
  return r.json();
 }
 function tokenExpires(tokens){return Number(tokens.access_expires_at||0)<Date.now()+120000;}
 async function refreshIfNeeded(c,tokens,force=false){
  if(!force&&!tokenExpires(tokens))return tokens;
  if(tokens.refresh_expires_at && Date.now()>=tokens.refresh_expires_at)throw new ReconnectRequired();
  const next=await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh_token});
  if(!next.access_token||!next.refresh_token)throw new ReconnectRequired();
  const updated={access_token:next.access_token,refresh_token:next.refresh_token,access_expires_at:Date.now()+Number(next.expires_in||3600)*1000,refresh_expires_at:Date.now()+Number(next.x_refresh_token_expires_in||86400)*1000};
  await db('pal_qbo_connections',{method:'PATCH',query:`tenant=eq.${TENANT}`,body:{encrypted_tokens:encrypt(updated),updated_at:new Date().toISOString()}});
  return updated;
 }
 async function connection(){const rows=await db('pal_qbo_connections',{query:`tenant=eq.${TENANT}&select=tenant,encrypted_realm_id,encrypted_tokens,updated_at&limit=1`});const row=rows[0];return row?{...row,realm_id:decrypt(row.encrypted_realm_id).realm_id}:null;}
 function error(res,e){console.error('PAL QBO request failed');return res.status(503).send(page('QuickBooks unavailable','<p>QuickBooks connection is not ready. No accounting changes were made. Contact PAL support.</p>'));}
 app.get('/quickbooks/connect',authorized,async(req,res)=>{
  try {const c=ready()?await connection():null;res.send(page('Connect QuickBooks',`<p>Connect Born Again Air’s QuickBooks Online company to PAL. Only an authorized company manager may approve access.</p>${c?`<p><strong>Connected QuickBooks company:</strong> ${esc(c.realm_id)}</p><p>Reconnect only to the same company.</p>`:''}${ready()?'<form method="post" action="/quickbooks/connect/start"><button type="submit">Connect or reconnect QuickBooks</button></form>':'<p><strong>Connection is not enabled yet.</strong> PAL must configure Intuit credentials and encrypted storage first.</p>'}<p>PAL will use read-only accounting API requests during initial testing. No bills, payments, or expenses will be created.</p>`));}
  catch(e){error(res,e)}
 });
 app.post('/quickbooks/connect/start',authorized,requireSameOrigin,async(req,res)=>{
  if(!ready())return res.status(503).send(page('Not configured','<p>Production credentials and encryption are required.</p>'));
  try{
   const state=crypto.randomBytes(32).toString('hex');
   await db('pal_qbo_oauth_states',{method:'POST',body:{state_hash:crypto.createHash('sha256').update(state).digest('hex'),tenant:TENANT,clerk_user_id:getAuth(req).userId,expires_at:new Date(Date.now()+10*60*1000).toISOString()}});
   const u=new URL(INTUIT_AUTH);u.search=new URLSearchParams({client_id:clientId,response_type:'code',scope:'com.intuit.quickbooks.accounting',redirect_uri:CALLBACK,state}).toString();
   res.redirect(303,u.toString());
  }catch(e){error(res,e)}
 });
 // OAuth callback is public: state is a one-time, server-stored, cryptographically random secret.
 app.get('/quickbooks/callback',async(req,res)=>{
  // Never return HTML at a token-bearing callback URL. All outcomes redirect to a clean URL.
  res.set('Cache-Control','no-store, no-cache');
  res.set('Referrer-Policy','no-referrer');
  const done=(status)=>res.redirect(302,`/quickbooks/result?status=${status}`);
  if(!ready())return done('unavailable');
  const {state,code,realmId,error:oauthError}=req.query;
  if(typeof state!=='string'||!(/^[0-9a-f]{64}$/.test(state)))return done('invalid');
  try {
   const hash=crypto.createHash('sha256').update(state).digest('hex');
   const rows=await db('pal_qbo_oauth_states',{method:'DELETE',query:`state_hash=eq.${hash}&tenant=eq.${TENANT}&expires_at=gt.${enc(new Date().toISOString())}&select=state_hash,clerk_user_id`,prefer:'return=representation'});
   if(rows.length!==1)return done('expired');
   // Bind the OAuth response to the same signed-in, still-authorized manager who initiated it.
   const callbackUser=getAuth(req).userId;
   const initiatedBy=rows[0].clerk_user_id;
   const m=membership(req);
   if(!callbackUser || callbackUser!==initiatedBy || !(isOwner(req) || (m.role==='manager' && m.companies.includes(TENANT))))
    return done('unauthorized'); 
   if(oauthError)return done('cancelled');
   if(typeof code!=='string'||typeof realmId!=='string'||!/^\d{5,30}$/.test(realmId))return done('invalid');
   const current=await connection();
   if(current && current.realm_id!==realmId)return done('wrong-company');
   const tokens=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:CALLBACK});
   if(!tokens.access_token||!tokens.refresh_token)throw new Error('Incomplete token response');
   await db('pal_qbo_connections',{method:'POST',query:'on_conflict=tenant',prefer:'resolution=merge-duplicates',body:{tenant:TENANT,encrypted_realm_id:encrypt({realm_id:realmId}),encrypted_tokens:encrypt({access_token:tokens.access_token,refresh_token:tokens.refresh_token,access_expires_at:Date.now()+tokens.expires_in*1000,refresh_expires_at:Date.now()+(tokens.x_refresh_token_expires_in||0)*1000}),updated_at:new Date().toISOString()}});
   done('connected');
  }catch(e){if(e instanceof ReconnectRequired)return done('reconnect');console.error('PAL QBO callback failed');done('unavailable')}
 });
 app.get('/quickbooks/result',authorized,(req,res)=>{
  const messages={connected:'Born Again Air QuickBooks is connected. No accounting transactions were modified.',reconnect:'QuickBooks authorization expired. An authorized BAA manager must reconnect QuickBooks.',cancelled:'QuickBooks authorization was cancelled.',expired:'Authorization expired or was already used. Start again from PAL.',invalid:'Invalid authorization response. Start again from PAL.',unauthorized:'Sign in as the same authorized BAA manager and start again.', 'wrong-company':'This PAL workspace is already linked to a different QuickBooks company. Contact PAL support.',unavailable:'QuickBooks connection is temporarily unavailable.'};
  const status=typeof req.query.status==='string'?req.query.status:'invalid';
  res.set('Cache-Control','no-store, no-cache');res.send(page('QuickBooks connection',`<p>${messages[status]||messages.invalid}</p>`));
 });
 app.get('/quickbooks/disconnect',authorized,async(req,res)=>{
  try{const c=ready()?await connection():null;res.send(page('Disconnect QuickBooks',`<p>${c?`Born Again Air is connected to QuickBooks company ${esc(c.realm_id)}.`:'No active QuickBooks connection is available.'}</p>${c?'<p>Disconnecting removes PAL’s stored authorization. It does not delete any QuickBooks transactions.</p><form method="post" action="/quickbooks/disconnect"><button type="submit">Confirm disconnect</button></form>':''}`));}catch(e){error(res,e)}
 });
 app.post('/quickbooks/disconnect',authorized,requireSameOrigin,async(req,res)=>{
  if(!ready())return res.status(503).send('Not configured');
  try{const c=await connection();if(!c)return res.send(page('Already disconnected','<p>No QuickBooks connection exists.</p>'));
   const tokens=decrypt(c.encrypted_tokens);
   const r=await resilientFetch(REVOKE_URL,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({token:tokens.refresh_token})});
   if(!r.ok){await recordError('oauth_revoke',r.status,tidOf(r));if(r.status!==400 && r.status!==401)throw new Error(`Intuit token revocation failed (${r.status})`);}
   await db('pal_qbo_connections',{method:'DELETE',query:`tenant=eq.${TENANT}`});
   res.send(page('QuickBooks disconnected','<p>PAL’s QuickBooks authorization was revoked and the stored connection removed.</p>'));
  }catch(e){error(res,e)}
 });
 app.get('/api/baa/quickbooks/test',authorized,async(req,res)=>{
  if(!ready())return res.status(503).json({error:'QuickBooks not configured'});
  try{const c=await connection();if(!c)return res.status(404).json({error:'BAA QuickBooks not connected'});
   let tokens=await refreshIfNeeded(c,decrypt(c.encrypted_tokens));
   // SELECT is read-only; no POST/PUT/DELETE to accounting endpoints in this module.
   const q="select * from Vendor maxresults 5";
   const u=`${API_BASE}/${enc(c.realm_id)}/query?query=${enc(q)}&minorversion=75`;
   let r=await resilientFetch(u,{headers:{Authorization:`Bearer ${tokens.access_token}`,Accept:'application/json'}});
   if(r.status===401){
    await recordError('api_query',r.status,tidOf(r));
    tokens=await refreshIfNeeded(c,tokens,true);
    r=await resilientFetch(u,{headers:{Authorization:`Bearer ${tokens.access_token}`,Accept:'application/json'}});
    if(r.status===401){await recordError('api_query',r.status,tidOf(r));throw new ReconnectRequired();}
   }
   if(r.status===403){await recordError('api_query',r.status,tidOf(r));throw new ReconnectRequired();}
   if(!r.ok){await recordError(classifyApiFailure(r.status),r.status,tidOf(r));throw new Error(`QBO read-only test failed (${r.status})`);}
   const data=await r.json();
   res.set('Cache-Control','no-store');res.json({ok:true,tenant:TENANT,vendorCount:(data.QueryResponse?.Vendor||[]).length,readOnly:true});
  }catch(e){if(e instanceof ReconnectRequired)return res.status(401).json({error:'QuickBooks authorization expired. An authorized BAA manager must reconnect QuickBooks.',reconnectUrl:'/quickbooks/connect'});console.error('QBO read test failed');res.status(503).json({error:'QuickBooks read-only test failed'});}
 });
};

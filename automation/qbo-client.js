'use strict';
// Tenant-scoped QBO accounting API. Never calls a payment-rail or bill-pay endpoint.
const crypto=require('node:crypto');
const a=require('./core');
const TENANT='born-again-air';
const BASE=process.env.QBO_API_BASE||'https://quickbooks.api.intuit.com/v3/company';
const TOKEN_URL='https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const ALLOWED_WRITES=new Set(['invoice','bill','payment','billpayment','purchase','deposit','attachable']);
function encryptionKey(){const s=process.env.QBO_TOKEN_ENCRYPTION_KEY||'';if(!/^[a-f\d]{64}$/i.test(s))throw Error('QBO encryption key missing');return Buffer.from(s,'hex');}
function decrypt(s){const b=Buffer.from(s,'base64');if(b.length<29)throw Error('Invalid encrypted token');const d=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8'));}
function encrypt(v){const iv=crypto.randomBytes(12);const c=crypto.createCipheriv('aes-256-gcm',encryptionKey(),iv);return Buffer.concat([iv,c.getAuthTag(),c.update(JSON.stringify(v)),c.final()]).toString('base64');}
async function connection(tenant){if(tenant!==TENANT)throw Error('QBO tenant not configured');const rows=await a.db('pal_qbo_connections',{query:`tenant=eq.${TENANT}&select=tenant,encrypted_realm_id,encrypted_tokens&limit=1`});if(!rows?.length)throw Error('QuickBooks not connected');return {realm:decrypt(rows[0].encrypted_realm_id).realm_id,tokens:decrypt(rows[0].encrypted_tokens)};}
async function refresh(tokens){const id=process.env.QBO_CLIENT_ID,secret=process.env.QBO_CLIENT_SECRET;if(!id||!secret)throw Error('QBO OAuth credentials unavailable');const r=await fetch(TOKEN_URL,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${id}:${secret}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:tokens.refresh_token}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`QBO refresh failed HTTP ${r.status}`);const next=await r.json();if(!next.access_token||!next.refresh_token)throw Error('QBO refresh missing tokens');const updated={access_token:next.access_token,refresh_token:next.refresh_token,access_expires_at:Date.now()+Number(next.expires_in||3600)*1000,refresh_expires_at:Date.now()+Number(next.x_refresh_token_expires_in||86400)*1000};await a.db('pal_qbo_connections',{method:'PATCH',query:`tenant=eq.${TENANT}`,body:{encrypted_tokens:encrypt(updated),updated_at:new Date().toISOString()}});return updated;}
async function request(tenant,method,path,body){if(!['GET','POST'].includes(method))throw Error('QBO method forbidden');if(typeof path!=='string'||!/^\/(query|invoice|bill|payment|billpayment|purchase|deposit|attachable)(\?|$)/.test(path))throw Error('QBO endpoint forbidden');if(method==='POST'){
 const resource=path.split('?')[0].slice(1);if(!ALLOWED_WRITES.has(resource))throw Error('QBO write endpoint forbidden');
 if(process.env.PAL_QBO_LIVE_POSTING!=='true')throw Error('QBO financial posting disabled');
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid QBO payload');
 // No QBO payment-service operations, card charges, electronic disbursements, or payment rail instructions.
 const forbidden=/\b(ach|wire|transferfunds|sendpayment|paybillonline|billpay|refundreceipt|creditcardpayment|electronicpayment)\b/i;
 if(forbidden.test(JSON.stringify(body)))throw Error('Potential payment initiation blocked');
 }
 const c=await connection(tenant);let tokens=c.tokens;if(Number(tokens.access_expires_at||0)<Date.now()+120000)tokens=await refresh(tokens);
 const call=token=>fetch(`${BASE}/${encodeURIComponent(c.realm)}${path}${path.includes('?')?'&':'?'}minorversion=75`,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 let r=await call(tokens.access_token);if(r.status===401){tokens=await refresh(tokens);r=await call(tokens.access_token);}if(!r.ok)throw Error(`QBO ${method} ${path.split('?')[0]} HTTP ${r.status}`);return r.json();
}
function safeQuery(entity,where='',limit=100){if(!['Account','Invoice','Bill','Payment','BillPayment','Deposit','Purchase','Vendor','Customer','JournalEntry'].includes(entity))throw Error('Unsupported QBO entity');if(where&&!/^[a-zA-Z0-9_ .'=<>-]+$/.test(where))throw Error('Invalid QBO query filter');const n=Math.max(1,Math.min(1000,Number(limit)||100));return `SELECT * FROM ${entity}${where?' WHERE '+where:''} MAXRESULTS ${n}`;}
async function query(tenant,entity,where='',limit=100){const q=safeQuery(entity,where,limit);const result=await request(tenant,'GET',`/query?query=${encodeURIComponent(q)}`);return result.QueryResponse?.[entity]||[];}
module.exports={request,query,safeQuery,ALLOWED_WRITES};

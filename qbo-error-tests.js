'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/quickbooks-oauth.js','utf8');
const sql=fs.readFileSync(__dirname+'/PAL_QBO_MIGRATION.sql','utf8');
const server=fs.readFileSync(__dirname+'/server.js','utf8');
const checks={
 'QBO errors capture Intuit TID':/tidOf\(r\)/.test(source)&&/get\?\.\('intuit_tid'\)/.test(source),
 'QBO errors persist to restricted table':/db\('pal_qbo_error_logs',\{method:'POST'/.test(source),
 'API validation errors classified':/status===400/.test(source)&&/status===422/.test(source),
 'API syntax errors classified':/status===404/.test(source),
 'Token errors logged':/recordError\('oauth_token',r.status,tidOf\(r\)\)/.test(source),
 'Read API errors logged':/recordError\(classifyApiFailure\(r.status\),r.status,tidOf\(r\)\)/.test(source),
 'No raw response bodies in diagnostic table':!/(request_body|response_body|access_token|refresh_token)\s+text/i.test(sql),
 'TID allowlisted':/\^\[a-zA-Z0-9_-\]\{1,128\}\$/.test(source),
 'Diagnostics table RLS':/alter table public.pal_qbo_error_logs enable row level security/i.test(sql),
 'Diagnostics browser grants revoked':/revoke all on public.pal_qbo_error_logs from anon, authenticated/i.test(sql),
 'Support link in workspace':/mailto:admin@palbiz.app/.test(server),
 'Support link subtle gray':/color:#8c94a3/.test(server),
 'OAuth callback clean redirect':/res.redirect\(302,`\/quickbooks\/result\?status=/.test(source),
 'OAuth one-time state':/method:'DELETE',query:`state_hash=eq/.test(source),
 'QBO access authorization':/function authorized\(req,res,next\)/.test(source),
 'No QBO accounting mutation':!/(method:\s*'POST'|method:\s*'PUT'|method:\s*'DELETE')\s*,?\s*[^\n]*API_BASE/.test(source)
};
for(const [name,ok] of Object.entries(checks)){console.log(`${ok?'PASS':'FAIL'} ${name}`);assert.ok(ok,name)}
console.log(`TOTAL ${Object.keys(checks).length} passed`);

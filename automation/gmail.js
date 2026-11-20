'use strict';
// Gmail API OAuth2 delivery. No external mail provider or Google API key required.
const {Buffer}=require('node:buffer');
function configured(){return Boolean(process.env.GMAIL_CLIENT_ID&&process.env.GMAIL_CLIENT_SECRET&&process.env.PAL_EMAIL_FROM&&(process.env.PAL_GMAIL_ENCRYPTION_KEY||process.env.QBO_TOKEN_ENCRYPTION_KEY));}
function header(s){return String(s).replace(/[\r\n]/g,' ').slice(0,200);}
async function send({from,to,subject,text}){
 if(!configured())throw Error('Gmail OAuth connection is not configured');
 const refresh_token=process.env.GMAIL_REFRESH_TOKEN||await require('./gmail-oauth').refreshToken();
 const params=new URLSearchParams({client_id:process.env.GMAIL_CLIENT_ID,client_secret:process.env.GMAIL_CLIENT_SECRET,refresh_token,grant_type:'refresh_token'});
 const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(15000)});
 if(!token.ok)throw Error(`Gmail OAuth token refresh HTTP ${token.status}`);
 const {access_token}=await token.json();if(!access_token)throw Error('Gmail OAuth token unavailable');
 const mime=[`From: ${header(from)}`,`To: ${header(to)}`,`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`, 'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(text).toString('base64')].join('\r\n');
 const raw=Buffer.from(mime).toString('base64url');
 const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:`Bearer ${access_token}`,'Content-Type':'application/json'},body:JSON.stringify({raw}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error(`Gmail API HTTP ${r.status}`);
 const result=await r.json();if(!result.id)throw Error('Gmail did not confirm message acceptance');return result.id;
}
module.exports={configured,send};

'use strict';
// Approved mappings are isolated by tenant and never grant authority to post.
const a=require('./core');
const tenants=new Set(['born-again-air','newstart']);
const valid=t=>{if(!tenants.has(t))throw Error('Unknown tenant');return t;};
async function list(tenant){valid(tenant);return a.db('pal_accounting_rules',{query:`tenant=eq.${encodeURIComponent(tenant)}&select=id,tenant,merchant_pattern,category,qbo_account_id,conditions,approved_by,approved_at,active&order=approved_at.desc&limit=250`});}
async function approve({tenant,merchant_pattern,category,qbo_account_id,conditions,approved_by}){
 valid(tenant);
 if(![merchant_pattern,category,qbo_account_id,approved_by].every(v=>typeof v==='string'&&v.trim()&&v.length<=160))throw Error('Invalid accounting rule');
 if(conditions!==undefined && (typeof conditions!=='string'||conditions.length>1000))throw Error('Invalid conditions');
 const rule={tenant,merchant_pattern:merchant_pattern.trim(),category:category.trim(),qbo_account_id:qbo_account_id.trim(),conditions:conditions||'',approved_by,active:true};
 const inserted=await a.db('pal_accounting_rules',{method:'POST',prefer:'return=representation',body:rule});
 await a.event(tenant,null,'accounting_rule_approved',{ruleId:inserted?.[0]?.id||null,category:rule.category});
 return inserted?.[0];
}
module.exports={list,approve,valid};

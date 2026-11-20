'use strict';
const DAY=86400000;
function reviewDate(v,now=new Date()){
 if(!['contracted','noncontracted','unknown','expired'].includes(v.contract_status))throw Error('Invalid vendor status');
 if(v.contract_status==='unknown'||v.contract_status==='expired')return null;
 if(v.contract_status==='noncontracted')return new Date((v.last_review_at?Date.parse(v.last_review_at):now.getTime())+30*DAY).toISOString();
 if(!v.renewal_date)return null;
 const renewal=Date.parse(v.renewal_date+'T12:00:00Z');if(!Number.isFinite(renewal))return null;
 let when=renewal-42*DAY;
 if(v.notice_deadline){const notice=Date.parse(v.notice_deadline+'T12:00:00Z');if(Number.isFinite(notice))when=Math.min(when,notice-14*DAY);}
 return new Date(when).toISOString();
}
function statementHoldUntil(verifiedAt){const ts=Date.parse(verifiedAt);if(!Number.isFinite(ts))throw Error('Verified timestamp required');return new Date(ts+7*DAY).toISOString();}
function eligibleForStatementDeletion(statement,now=new Date()){
 return statement.status==='verified' && !!statement.verified_at && !!statement.retention_hold_until && Date.parse(statement.retention_hold_until)<=now.getTime() && !statement.hold && statement.original_attachment_verified===true;
}
module.exports={reviewDate,statementHoldUntil,eligibleForStatementDeletion};

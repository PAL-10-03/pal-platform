'use strict';
// Rule 003 is enforced by application policy, not by trusting LLM instructions.
const BASE='BAA Rule 003: PAL may prepare verified accounting records only after an authorized QuickBooks integration is validated and live posting explicitly enabled. NEVER initiate or transmit funds, ACH, wire, electronic bill pay, check delivery, refunds, or vendor payments. Never create an expense from a receipt alone. Never duplicate an invoice, bill, or payment. Uncertain transactions require management review. QBO Pending/For Review bank-feed rows must not be assumed available.';
const ROLES={
 reader:'Extract and classify documents. Customer invoices and vendor bills route to Bookkeeper; statements and payment evidence route to Banker. A complete statement includes account, period, beginning/ending balances and transaction lines. No posting.',
 bookkeeper:'Create verified invoice/bill drafts and, only when explicitly authorized in QBO, accounting records with approved account IDs, original attachments and duplicate checks. Do not pay vendors.',
 banker:'Daily QBO monitoring and automatic uploaded-statement reconciliation are distinct triggers. Match verified posted payments and statement entries, track outstanding checks/deposits in transit, and hold ambiguity in Pending Match. Do not declare reconciled without statement-level proof.',
 ceo:'Coordinate statuses and exceptions; preserve 6AM Daily Check-in. Only CEO can send approved customer email via separate existing service. Do not send email in advisory jobs.',
 reporter:'Read-only reporting. AR/AP aging, payments and reconciliation exceptions; never fabricate balances.',
 negotiator:'Recommend vendor savings only; no contact or commitments without management approval.'
};
function rolePolicy(role){return BASE+' '+(ROLES[role]||'No authority.');}
function prohibitMoneyMovement(operation){if(/(?:ach|wire|transfer|bill.?pay|refund|payout|send.?check|deliver.?check|payment.?initiat|payment.?transmit)/i.test(String(operation)))throw Error('Rule 003 prohibits money movement');return true;}
module.exports={rolePolicy,prohibitMoneyMovement};

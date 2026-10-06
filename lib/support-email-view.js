'use strict';
const {escapeHtml}=require('./util');
// Display-only foundation. No mailbox fetches, attachment downloads or sending.
// Future ingestion must supply the provider's plain-text body, never raw HTML.
function plain(value,max){return typeof value==='string'?value.slice(0,max).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/g,''):'';}
function renderSupportEmail(message){
 const m=message&&typeof message==='object'?message:{};
 return `<article class="support-message"><h2>${escapeHtml(plain(m.subject,200)||'No subject')}</h2><p>Sender (unverified): ${escapeHtml(plain(m.sender,254))}</p><p>Links are displayed as text. Attachments and remote images are blocked.</p><pre>${escapeHtml(plain(m.bodyText,30000)||'No plain-text message available.')}</pre></article>`;
}
module.exports={renderSupportEmail};

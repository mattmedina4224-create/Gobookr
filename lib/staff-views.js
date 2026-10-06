'use strict';
const {escapeHtml:e}=require('./util');
const {ACTIVE_PERMISSIONS}=require('./staff-store');
// Lucide geometry; use one size and stroke throughout this portal.
const paths={back:'<path d="m12 19-7-7 7-7m-7 7h14"/>',chevron:'<path d="m9 18 6-6-6-6"/>',user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',job:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V3H8v4"/>',access:'<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"/>',lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',payroll:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20m-14 6h4"/>',building:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01"/>'};
function icon(name){return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.user}</svg>`;}
function shell(title,content,back='/owner',active='team') {
  return `<link rel="stylesheet" href="/staff-portal.css"><div class="staff-portal"><header class="staff-header"><a class="staff-icon-button" href="${back}" aria-label="Back">${icon('back')}</a><h1>${e(title)}</h1><a class="staff-owner-link" href="/owner">Owner</a></header><main class="staff-content">${content}</main><nav class="staff-bottom" aria-label="Owner dashboard"><a href="/owner"${active==='home'?' aria-current="page"':''}>${icon('building')}Overview</a><a href="/owner/staff"${active==='team'?' aria-current="page"':''}>${icon('user')}Team</a><a href="/owner/payroll"${active==='payroll'?' aria-current="page"':''}>${icon('payroll')}Payroll</a></nav></div>`;
}
function row(label,value,name='user'){return `<div class="staff-row"><span class="staff-row-icon">${icon(name)}</span><div><strong>${e(label)}</strong><p>${e(value||'Not provided')}</p></div></div>`;}
function edit(label,href){return `<a class="staff-edit" href="${href}">${e(label)}${icon('chevron')}</a>`;}
function permissionsLabel(member){return member.permissions.length?member.permissions.map(x=>x.replace('.',': ')).join(' · '):'No operational permissions';}
function employee(member,{readOnly=false,preview=false}={}) {
  const base='/owner/staff/'+member.id;
  const initials=member.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase();
  const section=(title,body,link='')=>`<section class="staff-section"><h2>${title}</h2>${body}${link}</section>`;
  const editRow=(label,section)=>readOnly?'':preview?`<div class="staff-edit" aria-disabled="true">${label}${icon('chevron')}</div>`:edit(label,base+'/edit/'+section);
  const content=(preview?'<p class="staff-help">Design preview only. No employee account or permissions have been created.</p>':'')+`<div class="staff-person"><div class="staff-avatar" aria-hidden="true">${preview?icon('user'):e(initials)}</div><h2>${e(member.name)}</h2><p>${e(member.job_title||'Job not assigned')}</p><span class="staff-status">${preview?'Design preview':member.status==='active'?'Active access':'Access revoked'}</span></div>`+
    section('Personal',row('Phone',member.phone,'phone')+row('Email',member.email,'mail'),editRow('Edit personal','personal'))+
    section('Job',row('Job',member.job_title,'job')+row('Department',member.department,'building'),editRow('Edit job','job'))+
    section('Access',row('Sign-in',preview?'Not configured':'GoBookr account','lock')+row('Permission set',permissionsLabel(member),'access')+row('Organization','GoBookr internal team','building'),editRow('Edit access','access'))+
    section('Payroll',row('Payroll status','Not connected','payroll')+'<p class="staff-help">Employee enrollment and payroll payments will be managed through a verified payroll provider.</p>',readOnly?'':edit('Payroll setup','/owner/payroll'));
  // The employee page has no owner-management navigation.
  if(readOnly){
    const tools=[['claims.read','Claim requests','/admin/profile-claims'],['claims.read','Business claims','/admin/shop-claims'],['licenses.read','License submissions','/admin/licenses'],['inventory.read','Professional outreach','/admin/new-pros'],['inventory.read','Business outreach','/admin/outreach']];
    const links=tools.filter(([permission])=>member.permissions.includes(permission)).map(([,label,href])=>edit(label,href)).join('');
    return `<link rel="stylesheet" href="/staff-portal.css"><div class="staff-portal"><header class="staff-header"><h1>My employee profile</h1></header><main class="staff-content">${links?section('Your tools',links):''}${content}</main></div>`;
  }
  return shell(member.name,content,'/owner/staff');
}
function roster(members) {
  const rows=members.map(m=>`<a class="staff-roster-row" href="/owner/staff/${m.id}"><span class="staff-row-icon">${icon('user')}</span><span><strong>${e(m.name)}</strong><span>${e(m.job_title||'Job not assigned')} · ${m.status==='active'?'Active':'Revoked'}</span></span>${icon('chevron')}</a>`).join('');
  return shell('GoBookr team',`<div class="staff-section-heading"><p>Manage your internal employees and their access.</p><a class="btn" href="/owner/staff/new">Add employee</a></div>${rows||'<div class="staff-empty"><h2>Your team starts here</h2><p>Add an employee using their existing GoBookr account.</p></div>'}<a class="staff-edit" href="/owner/staff/design">Preview employee page${icon('chevron')}</a><p class="staff-help">Showing up to 200 employee records. No barbershop staff or public professional profiles are included.</p>`);
}
const LABELS={'claims.read':'View claims','claims.review':'Approve or reject claims','licenses.read':'View license submissions','licenses.review':'Review licenses','inventory.read':'View outreach records','inventory.review':'Update outreach status'};
function grantFields(grants=[]) {
  return `<fieldset><legend>Permissions</legend><p class="staff-help">Choose only what this employee needs. Review access also includes view access.</p>${ACTIVE_PERMISSIONS.map(p=>`<label class="staff-check"><input type="checkbox" name="permission_${p}" value="yes"${grants.includes(p)?' checked':''}><span>${e(LABELS[p])}</span></label>`).join('')}</fieldset>`;
}
function field(label,name,value='',type='text',max=160,required=false){return `<label class="staff-field">${e(label)}<input type="${type}" name="${name}" value="${e(value)}" maxlength="${max}"${required?' required':''}></label>`;}
function form({member,section='new',csrf}) {
  const isNew=section==='new'; const back=isNew?'/owner/staff':'/owner/staff/'+member.id;
  let fields='';
  if(isNew)fields=field('Employee name','name','','text',160,true)+field('GoBookr account email','email','','email',254,true)+field('Job title','job_title','','text',100)+grantFields()+`<label class="staff-check"><input type="checkbox" name="identity_confirmed" value="yes" required><span>I have confirmed this account belongs to the employee.</span></label><p class="staff-help">The employee must already have a GoBookr account. This saves access; it does not send an email invitation.</p>`;
  if(section==='personal')fields=field('Employee name','name',member.name,'text',160,true)+field('Phone','phone',member.phone,'tel',40)+row('Account email',member.email,'mail')+'<p class="staff-help">Account email changes use the account security process.</p>';
  if(section==='job')fields=field('Job title','job_title',member.job_title,'text',100)+field('Department','department',member.department,'text',100);
  if(section==='access')fields=grantFields(member.permissions)+`<label class="staff-field">Access status<select name="status"><option value="active"${member.status==='active'?' selected':''}>Active</option><option value="revoked"${member.status==='revoked'?' selected':''}>Revoke access</option></select></label><p class="staff-help">Revoking access removes employee dashboard permissions. It preserves the employee record and audit history.</p>`;
  return shell(isNew?'Add employee':'Edit '+section,`<form class="staff-form" method="POST" action="${isNew?'/owner/staff':back+'/edit/'+section}"><input type="hidden" name="_csrf" value="${e(csrf)}">${isNew?'':`<input type="hidden" name="version" value="${member.version}">`}${fields}<div class="staff-form-actions"><button class="btn" type="submit">${isNew?'Add employee':'Save changes'}</button><a class="btn secondary" href="${back}">Cancel</a></div></form>`,back);
}
function payroll(){return shell('Payroll',`<section class="staff-section"><h2>Payroll setup</h2>${row('Connection','Not connected','payroll')}<p>Choose and connect a payroll provider for GoBookr as the employer before enrolling employees or preparing a pay run.</p><p class="staff-help">No bank information, tax identifiers or payments are collected here. Payroll is not enabled.</p></section>`,'/owner','payroll');}
function overview(){return shell('GoBookr owner',`<div class="staff-section-heading"><h2>Your operations dashboard</h2><p>Manage GoBookr employees and their access.</p></div><section class="staff-section">${edit('Team and permissions','/owner/staff')}${edit('Payroll setup','/owner/payroll')}</section><p class="staff-help">Support inbox integration is planned separately.</p>`,'/','home');}
module.exports={employee,roster,form,payroll,overview};

'use strict';
function permissionForRequest(req) {
  const path=String(req?.url||'').split('?')[0],method=req?.method;
  if(method==='GET') {
    if(path==='/admin/licenses')return 'licenses.read';
    if(['/admin/profile-claims','/admin/shop-claims'].includes(path))return 'claims.read';
    if(['/admin/outreach','/admin/new-pros'].includes(path))return 'inventory.read';
  }
  if(method==='POST') {
    if(/^\/admin\/licenses\/[1-9]\d*\/verify$/.test(path))return 'licenses.review';
    if(/^\/admin\/(profile-claims|shop-claims)\/[1-9]\d*\/(approve|reject)$/.test(path))return 'claims.review';
    if(/^\/admin\/(outreach|new-pros)\/[1-9]\d*\/status$/.test(path))return 'inventory.review';
  }
  return null;
}
module.exports={permissionForRequest};

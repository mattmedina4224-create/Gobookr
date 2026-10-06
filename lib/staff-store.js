'use strict';

const ACTIVE_PERMISSIONS = Object.freeze(['claims.read','claims.review','licenses.read','licenses.review','inventory.read','inventory.review']);
const validId = n => Number.isSafeInteger(n) && n>0;
function text(value,max,required=false) {
  if(typeof value !== 'string' || value.trim().length>max || (required && !value.trim())) throw new Error('Invalid employee details');
  return value.trim();
}
function permissions(values) {
  if(!Array.isArray(values) || values.length>ACTIVE_PERMISSIONS.length || values.some(x=>!ACTIVE_PERMISSIONS.includes(x))) throw new Error('Invalid permissions');
  const result=new Set(values);
  for(const family of ['claims','licenses','inventory']) if(result.has(family+'.review')) result.add(family+'.read');
  return [...result].sort();
}
function createStaffStore(pool) {
  async function transaction(fn) {
    const c=await pool.connect();
    try { await c.query('BEGIN'); const result=await fn(c); await c.query('COMMIT'); return result; }
    catch(error) { await c.query('ROLLBACK'); throw error; }
    finally { c.release(); }
  }
  async function owner(c,actor) {
    if(!actor || !validId(actor.userId) || typeof actor.token!=='string' || !actor.token) throw new Error('Owner access required');
    const result=await c.query(`SELECT o.user_id FROM staff_ops.owners o JOIN public.sessions s ON s.user_id=o.user_id
      WHERE o.user_id=$1 AND s.token=$2 AND s.expires_at>CURRENT_TIMESTAMP FOR SHARE OF o,s`,[actor.userId,actor.token]);
    if(!result.rows.length) throw new Error('Owner access required');
  }
  async function audit(c,actor,member,action) {
    await c.query('INSERT INTO staff_ops.audit(actor_id,member_id,action,version,permissions,status) VALUES($1,$2,$3,$4,$5,$6)',[actor.userId,member.id,action,member.version,member.permissions,member.status]);
  }
  async function list(actor) {
    return transaction(async c=>{ await owner(c,actor); return (await c.query(`SELECT m.*,u.email FROM staff_ops.members m JOIN public.users u ON u.id=m.user_id WHERE m.owner_id=$1 ORDER BY m.name,m.id LIMIT 200`,[actor.userId])).rows; });
  }
  async function get(actor,id) {
    if(!validId(id)) throw new Error('Employee not found');
    return transaction(async c=>{ await owner(c,actor); const row=(await c.query('SELECT m.*,u.email FROM staff_ops.members m JOIN public.users u ON u.id=m.user_id WHERE m.owner_id=$1 AND m.id=$2',[actor.userId,id])).rows[0]; if(!row) throw new Error('Employee not found'); return row; });
  }
  async function add(actor,input) {
    const email=text(input.email,254,true).toLowerCase(), name=text(input.name,160,true), job=text(input.job_title||'',100);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || input.identity_confirmed!=='yes') throw new Error('Confirm the employee account identity');
    const grants=permissions(input.permissions||[]);
    return transaction(async c=>{
      await owner(c,actor);
      const users=(await c.query('SELECT id FROM public.users WHERE lower(email)=$1 FOR UPDATE',[email])).rows;
      if(users.length!==1 || Number(users[0].id)===actor.userId) throw new Error('An existing employee account is required');
      const id=users[0].id;
      const privileged=(await c.query('SELECT user_id FROM public.admin_accounts WHERE user_id=$1 UNION ALL SELECT user_id FROM staff_ops.owners WHERE user_id=$1',[id])).rows;
      if(privileged.length) throw new Error('This account already has elevated access; review its existing grants first');
      const result=await c.query('INSERT INTO staff_ops.members(user_id,owner_id,name,job_title,permissions) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO NOTHING RETURNING *',[id,actor.userId,name,job,grants]);
      if(!result.rows.length) throw new Error('Employee account is already on the team');
      await audit(c,actor,result.rows[0],'added'); return result.rows[0];
    });
  }
  async function update(actor,id,version,section,input) {
    if(!validId(id) || !validId(version) || !['personal','job','access'].includes(section)) throw new Error('Invalid employee update');
    let columns,values;
    if(section==='personal') { columns='name=$4,phone=$5'; values=[text(input.name,160,true),text(input.phone||'',40)]; }
    else if(section==='job') { columns='job_title=$4,department=$5'; values=[text(input.job_title||'',100),text(input.department||'',100)]; }
    else { if(!['active','revoked'].includes(input.status)) throw new Error('Invalid access status'); columns='status=$4,permissions=$5'; values=[input.status,permissions(input.permissions||[])]; }
    return transaction(async c=>{
      await owner(c,actor);
      const row=(await c.query(`UPDATE staff_ops.members SET ${columns},version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND owner_id=$2 AND version=$3 RETURNING *`,[id,actor.userId,version,...values])).rows[0];
      if(!row) throw new Error('Employee changed or is unavailable; reload before editing');
      await audit(c,actor,row,section+'_updated'); return row;
    });
  }
  async function self(actor) {
    if(!actor || !validId(actor.userId) || typeof actor.token!=='string') throw new Error('Staff access required');
    const row=(await pool.query(`SELECT m.*,u.email FROM staff_ops.members m JOIN public.users u ON u.id=m.user_id JOIN public.sessions s ON s.user_id=m.user_id
      WHERE m.user_id=$1 AND m.status='active' AND s.token=$2 AND s.expires_at>CURRENT_TIMESTAMP`,[actor.userId,actor.token])).rows[0];
    if(!row) throw new Error('Staff access required'); return row;
  }
  async function staff(c,actor) {
    if(!actor || !validId(actor.userId) || typeof actor.token!=='string' || !actor.token) throw new Error('Staff access required');
    const row=(await c.query(`SELECT m.*,u.email FROM staff_ops.members m JOIN public.users u ON u.id=m.user_id JOIN public.sessions s ON s.user_id=m.user_id
      WHERE m.user_id=$1 AND m.status='active' AND s.token=$2 AND s.expires_at>CURRENT_TIMESTAMP FOR SHARE OF m,s`,[actor.userId,actor.token])).rows[0];
    if(!row) throw new Error('Staff access required'); return row;
  }
  async function workList(actor,isOwner=false) {
    return transaction(async c=>{
      let rows;
      if(isOwner) {await owner(c,actor);rows=(await c.query(`SELECT w.*,m.name AS employee_name FROM staff_ops.work_items w JOIN staff_ops.members m ON m.id=w.member_id WHERE w.owner_id=$1 ORDER BY w.id DESC LIMIT 200`,[actor.userId])).rows;}
      else {const m=await staff(c,actor);rows=(await c.query('SELECT * FROM staff_ops.work_items WHERE member_id=$1 ORDER BY id DESC LIMIT 200',[m.id])).rows;}
      return rows;
    });
  }
  async function workAdd(actor,input) {
    const memberId=Number(input.member_id),title=text(input.title,160,true),instructions=text(input.instructions||'',2000);
    if(!validId(memberId)) throw new Error('Invalid employee');
    return transaction(async c=>{
      await owner(c,actor);
      const member=(await c.query("SELECT id FROM staff_ops.members WHERE id=$1 AND owner_id=$2 AND status='active' FOR SHARE",[memberId,actor.userId])).rows[0];
      if(!member) throw new Error('Employee not found or access revoked');
      const w=(await c.query('INSERT INTO staff_ops.work_items(owner_id,member_id,title,instructions) VALUES($1,$2,$3,$4) RETURNING *',[actor.userId,memberId,title,instructions])).rows[0];
      await c.query('INSERT INTO staff_ops.work_events(work_id,actor_id,status,version) VALUES($1,$2,$3,$4)',[w.id,actor.userId,w.status,w.version]);return w;
    });
  }
  async function workGet(actor,id,isOwner=false) {
    if(!validId(id)) throw new Error('Task not found');
    return transaction(async c=>{
      let scope,value;
      if(isOwner){await owner(c,actor);scope='owner_id';value=actor.userId;}else{const m=await staff(c,actor);scope='member_id';value=m.id;}
      const w=(await c.query(`SELECT * FROM staff_ops.work_items WHERE id=$1 AND ${scope}=$2`,[id,value])).rows[0];
      if(!w) throw new Error('Task not found');
      w.events=(await c.query('SELECT ev.status,ev.note,ev.version,ev.created_at,COALESCE(m.name,'Owner') AS actor_name FROM staff_ops.work_events ev LEFT JOIN staff_ops.members m ON m.user_id=ev.actor_id WHERE ev.work_id=$1 ORDER BY ev.id DESC LIMIT 100',[id])).rows;return w;
    });
  }
  async function workUpdate(actor,id,version,input,isOwner=false) {
    if(!validId(id)||!validId(version)||!['not_started','in_progress','blocked','done'].includes(input.status)) throw new Error('Invalid task update');
    const note=text(input.note||'',1500);
    return transaction(async c=>{
      let scope,value;
      if(isOwner){await owner(c,actor);scope='owner_id';value=actor.userId;}else{const m=await staff(c,actor);scope='member_id';value=m.id;}
      const w=(await c.query(`UPDATE staff_ops.work_items SET status=$4,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND ${scope}=$2 AND version=$3 RETURNING *`,[id,value,version,input.status])).rows[0];
      if(!w) throw new Error('Task changed or is unavailable; reload before editing');
      await c.query('INSERT INTO staff_ops.work_events(work_id,actor_id,status,note,version) VALUES($1,$2,$3,$4,$5)',[id,actor.userId,w.status,note,w.version]);return w;
    });
  }
  return {list,get,add,update,self,workList,workAdd,workGet,workUpdate};
}
module.exports={createStaffStore,ACTIVE_PERMISSIONS,permissions};

'use strict';
(() => {
  const input=document.getElementById('profile_photo'), open=document.getElementById('profile-photo-crop'), dialog=document.getElementById('profile-crop-dialog');
  const canvas=document.getElementById('profile-crop-canvas'), zoom=document.getElementById('profile-crop-zoom'), save=document.getElementById('profile-crop-save'), form=document.getElementById('profile-photo-form');
  if(!input||!open||!dialog||!canvas||!zoom||!save||!form) return;
  const ctx=canvas.getContext('2d'); let img=null,scale=1,x=0,y=0,drag=false,lastX=0,lastY=0;
  function draw(){ if(!img)return; ctx.clearRect(0,0,640,640); const base=Math.max(640/img.width,640/img.height),s=base*scale,w=img.width*s,h=img.height*s; x=Math.min(0,Math.max(640-w,x));y=Math.min(0,Math.max(640-h,y));ctx.drawImage(img,x,y,w,h); }
  input.addEventListener('change',()=>{const file=input.files&&input.files[0];open.disabled=!file;if(!file)return;const url=URL.createObjectURL(file);const next=new Image();next.onload=()=>{URL.revokeObjectURL(url);img=next;scale=1;zoom.value='1';const base=Math.max(640/img.width,640/img.height);x=(640-img.width*base)/2;y=(640-img.height*base)/2;draw();dialog.showModal();};next.onerror=()=>{URL.revokeObjectURL(url);alert('That photo could not be opened. Try a JPG, PNG, or WebP image.');};next.src=url;});
  open.addEventListener('click',()=>{if(img)dialog.showModal();});
  zoom.addEventListener('input',()=>{const old=scale;scale=Number(zoom.value);const ratio=scale/old;x=320-(320-x)*ratio;y=320-(320-y)*ratio;draw();});
  const point=e=>{const r=canvas.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return{x:(p.clientX-r.left)*640/r.width,y:(p.clientY-r.top)*640/r.height};};
  const start=e=>{drag=true;const p=point(e);lastX=p.x;lastY=p.y;e.preventDefault();}, move=e=>{if(!drag)return;const p=point(e);x+=p.x-lastX;y+=p.y-lastY;lastX=p.x;lastY=p.y;draw();e.preventDefault();}, end=()=>{drag=false;};
  canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
  const status=document.createElement('p');
  status.className='helptext'; status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  form.appendChild(status);
  let uploading=false;
  async function upload(blob) {
    if(uploading)return;
    uploading=true; open.disabled=true; save.disabled=true;
    status.textContent='Saving photo…'; status.style.color='';
    try {
      const data=new FormData(form); data.set('image',blob,'profile.jpg');
      const response=await fetch(form.action,{method:'POST',body:data,credentials:'same-origin'});
      const resultUrl=new URL(response.url,window.location.href);
      const error=resultUrl.searchParams.get('error');
      if(error)throw new Error(error);
      if(!response.ok)throw new Error(response.status===403?'Your session expired. Refresh after saving your profile details.':'Photo upload failed. Please try again.');
      if(resultUrl.pathname!=='/dashboard/pro/profile'||!resultUrl.searchParams.get('success'))throw new Error('Photo could not be saved. Your profile details are still here.');
      const result=new DOMParser().parseFromString(await response.text(),'text/html');
      const photo=result.querySelector('.pro-identity-photo img');
      const target=document.querySelector('.pro-identity-photo');
      if(photo&&target)target.replaceChildren(photo);
      status.textContent='Photo saved. Your profile details are unchanged; save them when you’re ready.';
    } catch(err) {
      status.textContent=(err.message||'Photo upload failed. Please try again.')+' Your unsaved profile details have been kept on this page.';
      status.style.color='#b42318';
    } finally {
      uploading=false; open.disabled=!img; save.disabled=false;
    }
  }
  form.addEventListener('submit',event=>event.preventDefault());
  save.addEventListener('click',()=>{
    if(uploading)return;
    canvas.toBlob(blob=>{
      if(!blob){status.textContent='Could not prepare that photo. Your profile details are still here.';return;}
      dialog.close(); upload(blob);
    },'image/jpeg',0.86);
  });
})();
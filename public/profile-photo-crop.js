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
  save.addEventListener('click',()=>{canvas.toBlob(blob=>{if(!blob)return alert('Could not prepare that photo.');const file=new File([blob],'profile.jpg',{type:'image/jpeg'});const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;dialog.close();form.submit();},'image/jpeg',0.86);});
})();
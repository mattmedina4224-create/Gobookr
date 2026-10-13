(() => {
  'use strict';
  const dialog = document.getElementById('specialty-finder');
  const launch = document.querySelector('[data-finder-open]');
  const catalog = window.GoBookrSpecialties;
  if (!dialog || !launch || !catalog || typeof dialog.showModal !== 'function') return;
  const form = dialog.querySelector('.finder-form'), input = form.querySelector('input'), label = form.querySelector('label');
  const messages = dialog.querySelector('.finder-conversation'), suggestions = dialog.querySelector('.finder-suggestions');
  const results = dialog.querySelector('.finder-results'), reset = dialog.querySelector('.finder-reset'), submit = form.querySelector('button');
  let step = 'specialty', specialty = null, city = '', generation = 0, controller;
  function message(text,user=false) { const p=document.createElement('p');p.className='finder-message'+(user?' user':'');p.textContent=text;messages.append(p); }
  function chips(items) { suggestions.replaceChildren(); for(const item of items) { const button=document.createElement('button');button.type='button';button.textContent=item.label;button.addEventListener('click',()=>select(item));suggestions.append(button); } }
  function start() {
    generation++; controller?.abort(); step='specialty';specialty=null;city='';messages.replaceChildren();results.replaceChildren();form.hidden=false;reset.hidden=true;submit.disabled=false;
    label.textContent='Service or specialty';input.value='';input.maxLength=120;input.placeholder='Try balayage or razor fade';submit.textContent='Next';
    message('What service or specialty are you looking for?');chips(['black-gray-realism','razor-fade','balayage'].map(catalog.get));
  }
  function select(item) {
    if(step!=='specialty') return;
    specialty=item;message(item.label,true);message('What city or ZIP code should I search?');step='city';suggestions.replaceChildren();
    label.textContent='City or ZIP code';input.value='';input.maxLength=100;input.placeholder='Denver or 80202';submit.textContent='Find pros';reset.hidden=false;input.focus();
  }
  async function find() {
    const ticket=++generation;controller?.abort();controller=new AbortController();submit.disabled=true;submit.textContent='Searching…';results.replaceChildren();
    const params=new URLSearchParams({specialty:specialty.id,city});
    try {
      const response=await fetch('/finder/matches?'+params,{signal:controller.signal,headers:{Accept:'application/json'}});
      if(!response.ok) throw Error('search');const data=await response.json();if(ticket!==generation)return;
      form.hidden=true;step='results';
      message(data.results.length?'Here are professionals who list '+specialty.label+'. Open a profile to explore their work.':'No professionals have listed '+specialty.label+' in '+city+' yet. That doesn’t mean nobody offers it—we don’t have a confirmed match listed.');
      for(const pro of data.results) {
        const a=document.createElement('a');a.className='finder-result';a.href='/pro/'+Number(pro.id);
        if(pro.photo){const image=document.createElement('img');image.src=pro.photo;image.alt='';image.loading='lazy';image.addEventListener('error',()=>image.remove(),{once:true});a.append(image);}
        const info=document.createElement('div'),name=document.createElement('strong'),location=document.createElement('small');name.textContent=pro.name;location.textContent=[pro.city,pro.state].filter(Boolean).join(', ');info.append(name,location);a.append(info);results.append(a);
      }
      const all=document.createElement('a');all.className='btn secondary block';all.textContent='See all matches';all.href='/search?'+new URLSearchParams({specialty:specialty.id,city,type:'professionals'});if(data.results.length)results.append(all);
      const broader=document.createElement('a');broader.className='btn ghost block';broader.textContent='Search this specialty in all locations';broader.href='/search?'+new URLSearchParams({specialty:specialty.id,type:'professionals'});results.append(broader);
      const edit=document.createElement('button');edit.type='button';edit.className='finder-reset';edit.textContent='Change location';edit.onclick=()=>{generation++;step='city';form.hidden=false;results.replaceChildren();input.focus();};results.append(edit);
    } catch(error) {if(ticket!==generation||error.name==='AbortError')return;message('Search is unavailable right now. Try again, or use the main search.');}
    finally{if(ticket===generation){submit.disabled=false;submit.textContent='Find pros';}}
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();const value=input.value.trim();if(!value)return;
    if(step==='specialty') {const items=catalog.recognize(value);if(items.length===1){select(items[0]);return;}message(value,true);message(items.length?'Which of these did you mean?':'I don’t have an exact specialty option for that yet. Try a shorter name, choose an option below, or use the main search.');chips(items.length?items:catalog.catalog);return;}
    if(step==='city') {if(value.length>100||/[<>\x00-\x1f]/.test(value)){message('Enter a city name or a ZIP code.');return;}city=value;message(city,true);find();}
  });
  launch.addEventListener('click',event=>{event.preventDefault();start();dialog.showModal();input.focus();});
  dialog.querySelector('.finder-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{generation++;controller?.abort();launch.focus();});
  reset.addEventListener('click',()=>{start();input.focus();});
})();

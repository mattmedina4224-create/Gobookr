'use strict';
(() => {
  const input=document.getElementById('specialty-query');
  const list=document.getElementById('specialty-suggestions');
  const status=document.getElementById('specialty-suggestions-status');
  if (!input || !list || !status || !window.SpecialtySuggestions) return;
  let catalogPromise; let items=[]; let active=-1; let revision=0;
  function catalog() {
    if (!catalogPromise) catalogPromise=fetch('/service-catalog.json').then(r=>{
      if (!r.ok) throw Error('Catalog unavailable');
      return r.json();
    }).then(data=>Array.isArray(data.entries)?data.entries:[]).catch(()=>[]);
    return catalogPromise;
  }
  function hide() {
    list.hidden=true; active=-1; input.setAttribute('aria-expanded','false');
    input.removeAttribute('aria-activedescendant');status.textContent='';
  }
  function select(index) {
    if (!items[index]) return;
    input.value=items[index];revision++;hide();input.focus({preventScroll:true});
  }
  function highlight() {
    Array.from(list.children).forEach((button,index)=>button.setAttribute('aria-selected',String(index===active)));
    if (active>=0) input.setAttribute('aria-activedescendant','specialty-option-'+active);
    else input.removeAttribute('aria-activedescendant');
  }
  async function render() {
    const current=++revision; const query=input.value;
    if (query.trim().length<2) { hide();return; }
    const entries=await catalog();
    if (current!==revision || document.activeElement!==input) return;
    items=window.SpecialtySuggestions.suggest(entries,query);active=-1;list.replaceChildren();
    if (!items.length) { hide();return; }
    for (const [index,label] of items.entries()) {
      const button=document.createElement('button');
      button.type='button';button.tabIndex=-1;button.id='specialty-option-'+index;
      button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.textContent=label;
      button.addEventListener('pointerdown',event=>event.preventDefault());
      button.addEventListener('click',()=>select(index));list.append(button);
    }
    list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');
    status.textContent=items.length+' specialty suggestions. Use up and down arrows to choose, or search your own wording.';
  }
  input.addEventListener('input',render);
  input.addEventListener('focus',render);
  input.addEventListener('blur',()=>{revision++;hide();});
  input.addEventListener('keydown',event=>{
    if (event.isComposing || list.hidden) return;
    if (event.key==='ArrowDown' || event.key==='ArrowUp') {
      event.preventDefault();active=active<0 ? (event.key==='ArrowDown'?0:items.length-1) : (active+(event.key==='ArrowDown'?1:items.length-1)+items.length)%items.length;highlight();
    } else if (event.key==='Enter' && active>=0) { event.preventDefault();select(active); }
    else if (event.key==='Escape') { event.preventDefault();event.stopPropagation();revision++;hide(); }
    else if (event.key==='Tab') { revision++;hide(); }
  });
  input.form?.addEventListener('submit',()=>{revision++;hide();});
})();

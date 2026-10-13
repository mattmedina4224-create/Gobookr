'use strict';
(function(root) {
  function normalize(value) {
    return String(value || '').toLowerCase().replace(/grey/g,'gray').replace(/colour/g,'color').replace(/[-–—&]/g,' ').replace(/\s+/g,' ').trim();
  }
  function suggest(entries, query, limit = 5) {
    const q=normalize(query).slice(0,100);
    if (q.length<2) return [];
    const words=q.split(' ').filter(w=>w!=='and');
    const candidates=new Map();
    for (const entry of entries || []) {
      const names=[entry.label,...(entry.aliases || [])].map(normalize);
      let score=0;
      for (const name of names) {
        if (name===q) score=Math.max(score,100);
        else if (name.startsWith(q)) score=Math.max(score,80);
        else if (words.length && words.every(w=>name.includes(w))) score=Math.max(score,50);
      }
      if (!score) continue;
      const old=candidates.get(entry.label);
      if (!old || old.score<score) candidates.set(entry.label,{label:entry.label,score});
    }
    return [...candidates.values()].sort((a,b)=>b.score-a.score || a.label.localeCompare(b.label)).slice(0,Math.max(1,Math.min(8,limit))).map(item=>item.label);
  }
  if (typeof module==='object' && module.exports) module.exports={suggest};
  else root.SpecialtySuggestions={suggest};
})(typeof window==='object'?window:globalThis);

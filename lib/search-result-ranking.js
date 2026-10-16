'use strict';
const specialtySearch=require('./specialty-search');
function rank(profiles,{textSearch=false}={}) {
  const rows=[...(profiles || [])];
  if (!textSearch) return rows;
  return rows.sort(specialtySearch.compareResults);
}
module.exports={rank};

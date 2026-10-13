(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GoBookrSpecialties = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const rows = [
    ['black-gray-realism','Black & gray realism',['tattoo_artist'],['black and gray realism','black and grey realism','black gray realism','black grey realism']],
    ['fine-line','Fine-line tattoos',['tattoo_artist'],['fine line','fineline','fine line tattoo']],
    ['traditional-tattoos','Traditional tattoos',['tattoo_artist'],['traditional tattoo','american traditional']],
    ['color-realism','Color realism',['tattoo_artist'],['colour realism']],
    ['razor-fade','Razor fade',['barber'],['razor fades']],
    ['skin-fade','Skin fade',['barber'],['skin fades','bald fade']],
    ['beard-shaping','Beard shaping',['barber'],['beard trim','beard grooming']],
    ['balayage','Balayage',['stylist','colorist'],[]],
    ['curly-hair','Curly hair',['stylist'],['curly cut','curly haircut','curls']],
    ['hair-extensions','Hair extensions',['stylist'],['extensions']],
    ['blonding','Blonding',['stylist','colorist'],['blonde hair','blonde highlights']],
    ['color-correction','Color correction',['stylist','colorist'],['colour correction']],
    ['natural-hair','Natural hair',['stylist'],['textured hair']],
    ['braids','Braids',['stylist'],['braiding']],
    ['russian-manicure','Russian manicure',['nail_technician'],[]],
    ['gel-nails','Gel nails',['nail_technician'],['gel manicure']],
    ['nail-art','Nail art',['nail_technician'],[]],
    ['acrylic-nails','Acrylic nails',['nail_technician'],['acrylics']],
    ['lash-extensions','Lash extensions',['eyelash_technician'],['eyelash extensions']],
    ['lash-lift','Lash lift',['eyelash_technician'],[]],
    ['brow-lamination','Brow lamination',['eyebrow_technician'],['eyebrow lamination']],
    ['brow-shaping','Brow shaping',['eyebrow_technician'],['eyebrow shaping']],
    ['brazilian-wax','Brazilian wax',['waxing_specialist'],['brazilian waxing']],
    ['sugaring','Sugaring',['waxing_specialist'],[]],
    ['deep-tissue','Deep tissue massage',['massage_therapist'],['deep tissue']],
    ['sports-massage','Sports massage',['massage_therapist'],[]],
    ['prenatal-massage','Prenatal massage',['massage_therapist'],[]],
    ['bridal-makeup','Bridal makeup',['makeup_artist','wedding_services'],['wedding makeup']],
    ['bridal-hair','Bridal hair',['stylist','wedding_services'],['wedding hair','updo']],
  ];
  const catalog = rows.map(([id,label,categories,aliases]) => ({id,label,categories,aliases}));
  function normalize(value) { return String(value || '').slice(0,120).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' '); }
  function recognize(value) {
    const text = ' ' + normalize(value) + ' ';
    return catalog.filter(item => [item.id,item.label,...item.aliases].some(alias => text.includes(' ' + normalize(alias) + ' ')));
  }
  return { catalog, normalize, recognize, get: id => catalog.find(item => item.id === id) || null };
});

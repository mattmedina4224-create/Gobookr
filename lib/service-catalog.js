'use strict';

// Discovery vocabulary, not a claim that any particular professional offers a service.
// Shared labels may belong to multiple professions. Custom profile text remains searchable.
const groups = {
  barber: 'Haircut|Clipper cut|Scissor cut|Buzz cut|Crew cut|Skin fade|Low fade|Mid fade|High fade|Taper fade|Drop fade|Burst fade|Razor fade|Flat top|Pompadour|Undercut|Mullet|Textured crop|Line up|Hair design|Beard trim|Beard shaping|Beard fade|Straight razor shave|Hot towel shave|Head shave|Mustache trim|Kids haircut|Senior haircut',
  stylist: 'Haircut|Trim|Layered cut|Bob haircut|Pixie cut|Shag haircut|Wolf cut|Butterfly cut|Bangs trim|Curly haircut|Dry haircut|Blowout|Silk press|Wash and style|Flat iron styling|Curl styling|Updo|Braids|Cornrows|Box braids|Knotless braids|Twists|Loc maintenance|Loc retwist|Loc extensions|Hair extensions|Tape in extensions|Sew in extensions|Hand tied extensions|Extension removal|Wig styling|Wig installation|Perm|Relaxer|Keratin treatment|Deep conditioning|Scalp treatment|Bond repair treatment|Kids haircut|Bridal hair',
  colorist: 'All over color|Root touch up|Gray coverage|Gray blending|Highlights|Full highlights|Partial highlights|Face framing highlights|Babylights|Lowlights|Balayage|Foilyage|Ombre|Sombre|Color melt|Root smudge|Root shadow|Hair toner|Hair gloss|Bleach and tone|Platinum blonde|Lived in blonde|Lived in color|Blonde specialist|Brunette color|Red hair color|Copper hair color|Vivid color|Fashion color|Color correction|Color consultation',
  nail_technician: 'Manicure|Pedicure|Gel manicure|Gel pedicure|Acrylic nails|Acrylic fill|Acrylic removal|Gel extensions|Gel X|Builder gel|BIAB|Hard gel|Soft gel|Dip powder nails|Dip removal|Structured manicure|Russian manicure|Dry manicure|E file manicure|Nail art|French manicure|Chrome nails|Ombre nails|3D nail art|Nail repair|Nail removal|Polish change|Paraffin treatment|Spa pedicure|Express pedicure|Kids manicure',
  eyelash_technician: 'Classic lash extensions|Hybrid lash extensions|Volume lash extensions|Mega volume lashes|Wispy lashes|Wet look lashes|Cat eye lashes|Doll eye lashes|Colored lashes|Lash fill|Lash removal|Lash lift|Lash tint|Lash lift and tint|Lash consultation|Lash patch test|Strip lash application',
  eyebrow_technician: 'Brow shaping|Brow waxing|Brow threading|Brow tweezing|Brow tint|Hybrid brow tint|Henna brows|Brow lamination|Brow lamination and tint|Microblading|Nano brows|Powder brows|Ombre brows|Combination brows|Brow touch up|Brow consultation',
  waxing_specialist: 'Brazilian wax|Bikini wax|Full bikini wax|Hollywood wax|Full body wax|Face waxing|Upper lip wax|Chin wax|Cheek wax|Brow waxing|Nose wax|Ear wax|Underarm wax|Arm wax|Full leg wax|Half leg wax|Back wax|Chest wax|Stomach wax|Shoulder wax|Mens waxing|Sugaring|Brazilian sugaring|Bikini sugaring|Leg sugaring|Face sugaring|Waxing consultation',
  tattoo_artist: 'Black and gray realism|Color realism|Portrait tattoo|Microrealism|Fine line tattoo|Single needle tattoo|American traditional tattoo|Neo traditional tattoo|Japanese tattoo|Irezumi|Blackwork|Dotwork|Geometric tattoo|Ornamental tattoo|Mandala tattoo|Tribal tattoo|Polynesian tattoo|Chicano tattoo|Lettering tattoo|Script tattoo|Watercolor tattoo|Illustrative tattoo|Minimalist tattoo|Surrealism tattoo|Trash polka|Sketch tattoo|Woodcut tattoo|Anime tattoo|Floral tattoo|Patchwork tattoo|Tattoo cover up|Tattoo rework|Tattoo touch up|Custom tattoo|Flash tattoo|Tattoo consultation|Scar camouflage',
  massage_therapist: 'Swedish massage|Deep tissue massage|Sports massage|Prenatal massage|Postnatal massage|Hot stone massage|Aromatherapy massage|Relaxation massage|Therapeutic massage|Chair massage|Couples massage|Thai massage|Shiatsu|Reflexology|Myofascial release|Trigger point massage|Lymphatic drainage massage|Cupping massage|Scalp massage|Foot massage|Assisted stretching',
  makeup_artist: 'Natural makeup|Soft glam makeup|Full glam makeup|Bridal makeup|Bridal makeup trial|Bridesmaid makeup|Event makeup|Prom makeup|Photoshoot makeup|Editorial makeup|Airbrush makeup|HD makeup|Mature skin makeup|Stage makeup|Special effects makeup|Makeup lesson|Makeup consultation|Strip lash application',
  wedding_services: 'Bridal hair|Bridal hair trial|Wedding updo|Bridal makeup|Bridal makeup trial|Bridesmaid hair|Bridesmaid makeup|Flower girl styling|Groom grooming|Wedding guest styling|On site bridal beauty|Wedding touch ups|Engagement photos hair and makeup|Elopement hair and makeup',
};
const aliasGroups = [
  ['Skin fade','Bald fade','Zero fade'], ['Line up','Lineup','Edge up','Shape up'],
  ['Haircut','Hair cut'], ['Kids haircut','Childrens haircut','Child haircut'],
  ['Gray coverage','Grey coverage'], ['Hair extensions','Extensions'],
  ['Gel X','Gelx','Gel-X'], ['BIAB','Builder in a bottle'], ['Dip powder nails','SNS nails','Dip manicure'],
  ['Lash lift','Eyelash lift'], ['Lash tint','Eyelash tint'],
  ['Brow lamination','Eyebrow lamination'], ['Brow threading','Eyebrow threading'], ['Brow shaping','Eyebrow shaping'],
  ['Brow waxing','Eyebrow waxing','Eyebrow wax'], ['Brow tint','Eyebrow tint'],
  ['Fine line tattoo','Fine line','Fineline','Fine-line'],
  ['Black and gray realism','Black and grey realism','Black gray realism','Black grey realism','Black & gray realism','Black & grey realism'],
  ['Microrealism','Micro realism'], ['Neo traditional tattoo','Neotraditional tattoo','Neo traditional'],
  ['Tattoo cover up','Cover up tattoo','Coverup tattoo'], ['Tattoo touch up','Tattoo touchup'],
  ['All over color','Single process color'], ['Root touch up','Root retouch'],
  ['Color correction','Colour correction'], ['Bridal makeup','Wedding makeup'], ['Bridal hair','Wedding hair'],
  ['Deep tissue massage','Deep tissue'], ['Swedish massage','Swedish'], ['Prenatal massage','Pregnancy massage'],
];
const entries = Object.entries(groups).flatMap(([category, labels]) => labels.split('|').map(label => ({ category, label, aliases: aliasGroups.find(g => g[0] === label)?.slice(1) || [] })));
const sources = [
  { url:'https://www.ulta.com/beautyservices/hair-salon', covers:['stylist','colorist'] },
  { url:'https://www.ulta.com/beautyservices/hair-salon/hair-color-services', covers:['colorist'] },
  { url:'https://www.ulta.com/beautyservices/makeup-lashes-application', covers:['makeup_artist','wedding_services'] },
  { url:'https://www.fresha.com/lp/en/bt/nail-salons/in/us-denver', covers:['nail_technician'] },
  { url:'https://www.fresha.com/lp/en/bt/eyebrows-and-lashes/in/united-states', covers:['eyelash_technician','eyebrow_technician'] },
  { url:'https://www.fresha.com/lp/en/tt/beard-trims/in/us-denver/central-business-district', covers:['barber'] },
  { url:'https://www.fresha.com/lp/en/tt/brazilian-waxing/in/us-san-francisco', covers:['waxing_specialist'] },
  { url:'https://www.tattoodo.com/tattoos/styles', covers:['tattoo_artist'] },
  { url:'https://www.massageenvy.com/massage/personalized-experience', covers:['massage_therapist'] },
];
module.exports = { entries, aliasGroups, sources, checkedAt:'2026-10-13', exhaustive:false };

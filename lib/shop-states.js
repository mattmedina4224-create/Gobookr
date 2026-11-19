'use strict';
// National shop expansion: the 50 states in rollout-wave order, with their FIPS codes (used to read the
// Census place-by-county file for coverage audits) and any open licensing dataset that lists shop/salon
// business licenses. States without a `license` entry have no open bulk dataset we may use; for those the
// pipeline relies on OpenStreetMap plus websites that actually load, and holds everything else for review.
//
// License adapters are Socrata (SODA) datasets. The crawler reads the real column names and license-type
// values at run time instead of trusting the spelling here; `typeInclude`/`typeExclude` pick business
// (shop/salon/establishment) licenses and drop individual practitioners, schools and booth/area renters.

const STATES = [
  // wave 1
  ['CO', 'Colorado', '08', 1], ['AZ', 'Arizona', '04', 1], ['UT', 'Utah', '49', 1], ['NV', 'Nevada', '32', 1], ['NM', 'New Mexico', '35', 1],
  // wave 2
  ['CA', 'California', '06', 2], ['TX', 'Texas', '48', 2], ['FL', 'Florida', '12', 2], ['NY', 'New York', '36', 2], ['GA', 'Georgia', '13', 2],
  // wave 3
  ['IL', 'Illinois', '17', 3], ['NC', 'North Carolina', '37', 3], ['VA', 'Virginia', '51', 3], ['WA', 'Washington', '53', 3], ['NJ', 'New Jersey', '34', 3],
  // wave 4
  ['OH', 'Ohio', '39', 4], ['PA', 'Pennsylvania', '42', 4], ['MI', 'Michigan', '26', 4], ['TN', 'Tennessee', '47', 4], ['MA', 'Massachusetts', '25', 4],
  // wave 5
  ['SC', 'South Carolina', '45', 5], ['MD', 'Maryland', '24', 5], ['OR', 'Oregon', '41', 5], ['MN', 'Minnesota', '27', 5], ['IN', 'Indiana', '18', 5],
  // wave 6
  ['MO', 'Missouri', '29', 6], ['WI', 'Wisconsin', '55', 6], ['AL', 'Alabama', '01', 6], ['LA', 'Louisiana', '22', 6], ['OK', 'Oklahoma', '40', 6],
  // wave 7
  ['KS', 'Kansas', '20', 7], ['NE', 'Nebraska', '31', 7], ['IA', 'Iowa', '19', 7], ['ID', 'Idaho', '16', 7], ['MT', 'Montana', '30', 7],
  // wave 8
  ['CT', 'Connecticut', '09', 8], ['RI', 'Rhode Island', '44', 8], ['NH', 'New Hampshire', '33', 8], ['ME', 'Maine', '23', 8], ['VT', 'Vermont', '50', 8],
  // wave 9
  ['KY', 'Kentucky', '21', 9], ['AR', 'Arkansas', '05', 9], ['MS', 'Mississippi', '28', 9], ['WV', 'West Virginia', '54', 9], ['DE', 'Delaware', '10', 9],
  // wave 10
  ['WY', 'Wyoming', '56', 10], ['SD', 'South Dakota', '46', 10], ['ND', 'North Dakota', '38', 10], ['AK', 'Alaska', '02', 10], ['HI', 'Hawaii', '15', 10],
].map(([code, name, fips, wave]) => ({ code, name, fips, wave }));

const LICENSE_SOURCES = {
  CO: {
    sourceName: 'Colorado DORA Shop Registration', domain: 'data.colorado.gov', dataset: '7s5z-vewr', typeLookup: '349y-twqi',
    pageUrl: 'https://data.colorado.gov/Regulations/Professional-and-Occupational-Licenses-in-Colorado/7s5z-vewr',
    // CO stores prefix codes; the lookup dataset names them. REG = Barber/Cosmetology Shop Registration.
    typeInclude: /(shop|salon)/i, typeRequire: /(barber|cosmet|registration|business)/i, typeExclude: /school|instructor|apprentic|pharmac|body art/i,
    externalPrefix: 'dora:REG:', licensePrefix: 'REG.', license: 'Public domain (Colorado Information Marketplace)',
  },
  TX: {
    sourceName: 'Texas TDLR Barbering & Cosmetology Establishment License', domain: 'data.texas.gov', dataset: '7358-krk7',
    pageUrl: 'https://data.texas.gov/dataset/TDLR-All-Licenses/7358-krk7',
    // Since March 2024 shops and salons are "Full-Service / Mini / Mobile Establishment"; older rows say Shop/Salon.
    typeInclude: /(establishment|barber shop|beauty salon|dual shop|specialty shop|specialty salon|mini.?salon|mini.?barber)/i,
    typeExclude: /school|mobile|instructor|operator|manicurist|esthetician|student|booth|electric|a\/c|tow|elevator/i,
    externalPrefix: 'tdlr:', licensePrefix: 'TX-TDLR.', license: 'Texas Open Data Portal (public)',
  },
  NY: {
    sourceName: 'New York DOS Appearance Enhancement & Barber Business License', domain: 'data.ny.gov', dataset: 'y3u4-jbgh',
    pageUrl: 'https://data.ny.gov/d/y3u4-jbgh',
    // Area renters are individual professionals renting space, not separate shop locations.
    typeInclude: /(business|barber shop|shop|salon|enhancement)/i, typeExclude: /area renter|renter|school|individual/i, allActive: true,
    externalPrefix: 'nydos:', licensePrefix: 'NY-DOS.', license: 'NY Open Data (public)',
  },
  CT: {
    sourceName: 'Connecticut DCP State License (shop)', domain: 'data.ct.gov', dataset: 'ngch-56tr',
    pageUrl: 'https://data.ct.gov/d/ngch-56tr',
    typeInclude: /(shop|salon)/i, typeRequire: /(barber|hair|cosmet|nail|esthet|beauty|tattoo|massage)/i, typeExclude: /school|instructor|apprentic|pharmac|liquor|tobacco|food/i,
    externalPrefix: 'ctdcp:', licensePrefix: 'CT-DCP.', license: 'CT Open Data (public)',
  },
};

const byCode = new Map(STATES.map((s) => [s.code, s]));
function stateInfo(code) {
  const s = byCode.get(String(code || '').toUpperCase());
  if (!s) throw new Error('Unknown state ' + code);
  return { ...s, licenseSource: LICENSE_SOURCES[s.code] || null };
}
const statesInWave = (wave) => STATES.filter((s) => s.wave === Number(wave)).map((s) => s.code);

module.exports = { STATES, LICENSE_SOURCES, stateInfo, statesInWave };

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parsePage,audit}=require('../scripts/audit-square-appointments');
const url='https://square.site/book/BQM6P9D4DFWSY/pv-barbers-llc-phoenix-az';
const staffLink='https://app.squareup.com/appointments/book/merchant-id/BQM6P9D4DFWSY/start?staff_id=staff-42';
const html='<html><head><title>PV BARBERS LLC in Phoenix, AZ</title></head><body>'+
  '<h5 class="font--bold m-bottom--8">Skin Fade</h5>'+
  '<p class="company-brick-and-mortar">3202 E Greenway Rd Ste 1311<br>Phoenix, AZ 85032-4551</p>'+
  '<a class="card card--interactive w-background-light" href="'+staffLink+'"><div class="staff-info">'+
  '<h5 class="font--bold m-bottom--8">Maira Vazquez</h5></div></a>'+
  '<a class="card card--interactive w-background-light" href="https://app.squareup.com/appointments/book/merchant-id/BQM6P9D4DFWSY/start?staff_id=nomatch">'+
  '<div class="staff-info"><h5 class="font--bold m-bottom--8">No Preference</h5></div></a></body></html>';

test('extracts the exact shop, location, staff-specific booking URL and service evidence',()=>{
  const p=parsePage(url,html);
  assert.equal(p.workplace_name,'PV BARBERS LLC');
  assert.equal(p.city,'Phoenix');assert.equal(p.state,'AZ');assert.equal(p.zip,'85032');
  assert.equal(p.address,'3202 E Greenway Rd Ste 1311');
  assert.equal(p.staff.length,1);assert.equal(p.staff[0].name,'Maira Vazquez');
  assert.equal(p.staff[0].staff_booking_url,staffLink);
  assert.equal(p.staff[0].staff_id,'staff-42');
  assert.ok(p.category_candidates.includes('barber'));
  assert.equal(p.staff[0].verification_status,'review_before_import');
});

test('rejects lookalike Square domain',()=>{
  assert.throws(()=>parsePage('https://square.site.evil.com/book/BQM6P9D4DFWSY/foo',html),/Not an official/);
});
test('flags booking cards without a specific staff ID and incomplete identity',()=>{
  const first=parsePage(url,html.replace('staff_id=staff-42','all-staff'));
  assert.equal(first.staff[0].verification_status,'review_staff_booking_link');
  const second=parsePage(url,html.replace('Maira Vazquez','Maira'));
  assert.equal(second.staff[0].verification_status,'review_full_identity');
});
test('preserves only published staff URLs, never invents booking or open slots',()=>{
  const p=parsePage(url,html.replace('class="card card--interactive w-background-light"','class="other"'));
  assert.equal(p.staff.length,0);
  assert.equal(p.category_candidates.includes('barber'),true);
});
test('discovery runs safely with controlled fetcher and no database writes',async()=>{
  const report=await audit([url,url],async()=>html,async()=>{});
  assert.equal(report.pages_attempted,1);assert.equal(report.pages_loaded,1);
  assert.equal(report.staff_records,1);assert.equal(report.errors.length,0);
});

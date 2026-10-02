'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {bookingIdentity,sameProfessional,verificationApproved}=require('../lib/import-identity');
test('booking dedupe ignores tracking while retaining individual provider selection',()=>{
 assert.equal(bookingIdentity('https://example.com/book/?utm_source=ig'),bookingIdentity('https://example.com/book'));
 assert.notEqual(bookingIdentity('https://example.com/book?pro=1'),bookingIdentity('https://example.com/book?pro=2'));
 assert.equal(bookingIdentity('https://user:secret@example.com/book'),'');
});
test('name workplace ZIP dedupe tolerates spelling punctuation without collapsing separate people',()=>{
 const p={business_name:'Kai B.',workplace_name:'The Salon',zip_code:'80202-1234'};
 assert.equal(sameProfessional(p,{name:'Kai B',workplace:'THE SALON',zip:'80202'}),true);
 assert.equal(sameProfessional(p,{name:'Kai C',workplace:'THE SALON',zip:'80202'}),false);
});
test('snippet candidates require both pages to be re-opened before import',()=>{
 assert.equal(verificationApproved({_verification_tier:'snippet'}),false);
 assert.equal(verificationApproved({_verification_tier:'snippet',_reverified_at:'2026-10-02',_source_page_opened:true,_booking_page_opened:true}),true);
 assert.equal(verificationApproved({_verification_tier:'page_opened'}),true);
 assert.equal(verificationApproved({}),false);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSitemapIndex,parseProfessionalSitemap,csv,audit}=require('../scripts/audit-mysalon-suite');
test('only official member sitemap entries',( )=>{
 const xml='<sitemapindex><loc>https://www.mysalonsuite.com/app_professional-sitemap.xml</loc><loc>https://www.mysalonsuite.com/post-sitemap.xml</loc><loc>https://www.mysalonsuite.com/app_professional-sitemap2.xml</loc></sitemapindex>';
 assert.equal(parseSitemapIndex(xml).length,2);
});
test('member URL captured without inventing booking destination',()=>{
 const p=parseProfessionalSitemap('<url><loc><![CDATA[https://www.mysalonsuite.com/members/abcd12-jane-doe/]]></loc><lastmod>2026-11-17</lastmod></url>');
 assert.equal(p.length,1);assert.equal(p[0].name_hint_unverified,'jane doe');assert.equal(p[0].category,null);assert.equal(p[0].booking_url,null);
 assert.equal(p[0].verification_status,'awaiting_member_profile_verification');
});
test('CSV leaves unverified category and link blank',()=>{
 const p=parseProfessionalSitemap('<url><loc>https://www.mysalonsuite.com/members/abcd12-jane-doe/</loc></url>');
 assert.match(csv(p),/jane doe,,,awaiting_member_profile_verification/);
});
test('crawler deduplicates and waits between sitemap files',async()=>{
 const root='https://www.mysalonsuite.com/sitemap.xml',m1='https://www.mysalonsuite.com/app_professional-sitemap.xml',m2='https://www.mysalonsuite.com/app_professional-sitemap2.xml';
 const docs={};docs[root]='<sitemapindex><loc>'+m1+'</loc><loc>'+m2+'</loc></sitemapindex>';
 docs[m1]='<url><loc>https://www.mysalonsuite.com/members/abc123-jane-doe/</loc></url>';
 docs[m2]=docs[m1]+'<url><loc>https://www.mysalonsuite.com/members/def456-janet-doe/</loc></url>';
 let waits=0;const result=await audit(async u=>docs[u],async t=>{assert.ok(t>=10000);waits++});
 assert.equal(result.sitemap_count,2);assert.equal(result.distinct_professional_urls,2);assert.equal(waits,1);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {profileQualityScore,compareResults}=require('../lib/specialty-search');

test('profile quality rewards trustworthy complete profiles',()=>{
  const complete={license_verified:true,profile_photo_url:'/photo.jpg',bio:'A'.repeat(100),services:[{name:'Balayage'}],booking_url:'https://example.com',reviewCount:8,rating:4.9};
  const sparse={services:[],reviewCount:0,rating:null};
  assert.ok(profileQualityScore(complete)>profileQualityScore(sparse));
});

test('ranking keeps relevance first, then quality, then distance',()=>{
  const strongFar={id:1,search_score:120,license_verified:true,services:[{name:'Balayage'}],distanceMiles:8};
  const weakNear={id:2,search_score:85,services:[],distanceMiles:1};
  assert.ok(compareResults(strongFar,weakNear)<0,'stronger specialty relevance must win');
  const complete={id:3,search_score:120,license_verified:true,services:[{name:'Balayage'}],distanceMiles:5};
  const sparse={id:4,search_score:120,services:[],distanceMiles:1};
  assert.ok(compareResults(complete,sparse)<0,'quality breaks equal-relevance ties');
  const near={id:5,search_score:120,services:[],distanceMiles:2};
  const far={id:6,search_score:120,services:[],distanceMiles:7};
  assert.ok(compareResults(near,far)<0,'distance breaks otherwise equal ties');
});

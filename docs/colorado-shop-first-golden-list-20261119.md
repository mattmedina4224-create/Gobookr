# GoBookr shop-first Colorado expansion — product direction

## Confirmed business model
- Create free, claimable shop pages before individual professional accounts.
- Show a real shop name, city, verified public business address where known, **official website**, phone when sourced, and source provenance.
- A shop owner may claim a page only after meaningful verification. Ownership is not inferred from a public listing.
- Staff/independent suite professionals create or claim **their own individual GoBookr profiles** and purchase the personal Professional plan (currently $20/month after a 30-day trial); shop ownership itself is free.
- Business-team paid-seat sponsorship is **optional** and must not silently replace personal subscriptions or charge shop owners for staff without explicit choice.
- Do not fabricate employees, assign a professional to a shop without affiliation evidence, or imply salon-suite renters are the location operator's employees.
- Support owner invitations or verified staff affiliation so an individual professional can link to a shop page. Shop page displays only confirmed affiliates when the verified-team system is active.
- Shop pages are first-class leads for business outreach; do not automatically email scraped contacts.

## Colorado Golden List business categories
1. Barbershops and grooming
2. Hair salons and styling
3. Hair color, extensions, braids, natural hair
4. Nail salons and nail technicians
5. Lash studios
6. Brow shaping, tinting, lamination
7. Waxing, sugaring, threading
8. Estheticians and skincare studios
9. Spray tan, airbrush, sunless tanning
10. Tattoo studios
11. Permanent makeup and microblading
12. Massage studios
13. Makeup artists and bridal beauty
14. Salon suites / independent beauty-studio buildings

## Data quality
- A business with multiple storefronts needs one location-specific page per verifiable address. A chain's regional URL alone does not establish a unique physical shop.
- Mark locationless leads for verification; do not publish invented address, phone or staff.
- Prefer **official websites** and the operator's own location directory to third-party aggregators.
- Preserve business name + location duplicates carefully; same name in different cities may be different branches.
- Search and category browsing should use a persisted business-category relationship rather than guessing from prose.
- Public website links should be validated HTTP/HTTPS, rendered on the shop page, and opened in a new tab.
- Track first_seen, last_seen, last_verified and source status. A blocked page does not prove closure.
- Before outreach, verify the owner/operator rather than contacting random employees.

## November 19 progress
- 24 initial Colorado shop pages: official URLs restored to website_url.
- 45 new unclaimed Colorado shop leads added with official websites, across multiple Golden List categories.
- 69 total Colorado shop records with websites; 45 newer records still lack street-address verification.
- Production shop detail route: /shop/:id and claim route /shop/:id/claim.
- New CSV: data/business-inventories/colorado-shop-pages-with-websites-20261119.csv
- Next steps: verify missing addresses, add persisted business categories, enable and test owner-to-pro invitations with self-paid subscriptions, and confirm deployment/rendering of shop links.

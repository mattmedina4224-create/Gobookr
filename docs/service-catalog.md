# Service and specialty discovery catalog

This is a growing starter vocabulary, not every possible service and not an inventory of offerings from GoBookr professionals. It contains 281 profession-specific entries (273 distinct labels), covering all eleven supported marketplace categories. Some labels appear under more than one profession.

`lib/service-catalog.js` is authoritative. `public/service-catalog.json` is its downloadable snapshot. `/specialties` displays the list and links labels to open-ended searches. Entries include services, techniques, styles, and consultation types. The catalog never writes services to pro profiles or verifies qualifications.

## Research

Reviewed October 13, 2026. Public menus and style guides informed the vocabulary; editorial additions broaden coverage. Source references are category-level, not verification that every entry appears verbatim on the cited menu:

- Ulta hair salon and color menus: https://www.ulta.com/beautyservices/hair-salon and https://www.ulta.com/beautyservices/hair-salon/hair-color-services
- Ulta makeup and lash application: https://www.ulta.com/beautyservices/makeup-lashes-application
- Fresha nail services: https://www.fresha.com/lp/en/bt/nail-salons/in/us-denver
- Fresha brows/lashes: https://www.fresha.com/lp/en/bt/eyebrows-and-lashes/in/united-states
- Fresha barber services: https://www.fresha.com/lp/en/tt/beard-trims/in/us-denver/central-business-district
- Fresha waxing: https://www.fresha.com/lp/en/tt/brazilian-waxing/in/us-san-francisco
- Tattoodo style directory: https://www.tattoodo.com/tattoos/styles
- Massage Envy service types: https://www.massageenvy.com/massage/personalized-experience

## Search behavior

- Case, gray/grey, color/colour, ampersands and hyphens are normalized.
- Common plural queries and curated equivalent phrases are supported. Different techniques are not treated as interchangeable (for example, balayage is not automatically a match for every highlights listing).
- All meaningful query terms must match within the same field or the same service name. Unknown specialties are allowed.
- Service, bio, name/handle, workplace, and category evidence contribute to ranking in SQL, before the 200-profile result cap. Existing eligibility, location and category filters remain intact.
- The matching service name is selected in the same SQL query, including services outside the three shown in the ordinary card summary. Explanations quote profile evidence and are escaped in HTML.
- Radius-filtered searches reapply relevance sorting, with distance as a tiebreaker.
- Input and alias expansion are bounded and values are parameterized. No AI inference or automatic capability assignment is used.

## Limits

This is deterministic matching, not full language understanding or arbitrary typo correction. A mention in a bio is evidence of a mention, not verification of a service or credential. Free-text normalization still uses pattern matching; production-scale query plans and load testing are required before claiming 100,000-profile performance. No production schema or data was modified.

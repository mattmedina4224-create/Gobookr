# GoBookr State Inventory Imports

GoBookr uses one national importer and separate source-verified data batches for each state.

## Batch layout

Store verified inventory under:

```
data/imports/CO/
data/imports/TX/
data/imports/FL/
```

A profile must contain factual public fields only. Do not copy bios, reviews, ratings, or portfolio media.

Required fields:

- `name`
- `category`
- `city`
- `state`
- `source_url`
- `source_name`

Preferred when publicly available:

- `workplace_name`
- `address`
- `zip`
- `booking_url`

Supported categories are barber, stylist, colorist, nail_technician, eyelash_technician,
eyebrow_technician, waxing_specialist, tattoo_artist, massage_therapist, makeup_artist,
and wedding_services. Makeup and wedding categories may be secondary specialties on the same professional profile; never create a duplicate profile solely to represent an additional specialty.

Approved source hosts are enforced by the importer: Booksy, GlossGenius, Square,
Vagaro, Boulevard, Mangomint, Zenoti, Booker, and SQUIRE.

## Safe workflow

First validate without writing:

```bash
node scripts/import-unclaimed-profiles.js data/imports/CO/batch-001.json --state=CO --dry-run --report=tmp/co-001-dry.json
```

Review rejected and duplicate rows. Then import:

```bash
node scripts/import-unclaimed-profiles.js data/imports/CO/batch-001.json --state=CO --report=tmp/co-001-live.json
```

The importer never creates accounts. New directory inventory is always created with
`user_id = NULL` and `claim_status = 'unclaimed'`, preserving the GoBookr claim flow.

## Rollout strategy

Expand state-by-state, but do not create state-specific importer code. Start with major metros
inside a state, prioritize underrepresented service categories, and use multiple approved
platforms so inventory is not dependent on a single marketplace.

Suggested sequence after Colorado: Texas, Florida, Arizona, California, Illinois, New York,
Georgia, North Carolina, and Nevada. This is an operational sequence only; the importer works
for every US state.

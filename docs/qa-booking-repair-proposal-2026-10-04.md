# Booking repair proposal — dry run only

No production updates have been executed. This document is not approval and contains no executable update statement.

## Updated review gate after owner-supplied research

The original12-row clearing proposal below is historical and must NOT be approved/executed as a batch without revision. IDs478 and496 now have replacement candidates and are excluded from any immediate clearing proposal pending re-verification. See qa-replacement-review-2026-10-04.md for exact stored/replacement destinations and remaining gates. The other10 failures still need research and explicit approval before edits. Original HTTP audit counts are a timestamped snapshot, not changed by finding new URLs.

## Narrow proposed change requiring approval

For the12 stored Booksy destinations observed redirecting to `showBusinessDeletedModal`, clear only `booking_url` to NULL, using an exact ID + old-URL comparison before each update. Keep every profile, name, address, category, claim status and source/provenance field unchanged. Preserve the before-values in the committed audit input. Do not infer that the business itself closed; the evidence only concerns the stored booking destination.

| ID | Stored listing name | City |
|---|---|---|
|17|Esthetics By Marlin|Denver|
|35|JULIA MASSAGE|Denver|
|49|Amber Masseuse|Denver|
|106|Heavens Lashes|Colorado Springs|
|233|HERITAGE MASSAGE SERVICES|Denver|
|235|Good energy on locs|Denver|
|237|Slayed by Ric|Denver|
|238|Nails Glenda|Denver|
|423|DE-PEACE WELLNESS|Denver|
|431|Psyp Wellness|Thornton|
|478|Divine Queen’s Touch|Fountain|
|496|Radiant Roots Skincare And Wellness|Denver|

Expected effect only if all12 exact before-values still match:12 booking_url fields cleared,0 profiles deleted,0 identities merged,0 source fields overwritten. Missing-link count would change185→197; public visible-row count would remain500 under the audited visibility predicate. This does not make500 listings freshly verified or legitimate.

After approval: re-read exact targets in one bounded query; stop on a changed URL/ownership state; perform the narrowly guarded transaction; verify row count and unchanged source fields; test both mobile and desktop profile and `/book/:id` behavior. Do not alter a claimed professional’s destination without reviewing current ownership and permission. Until then this proposal remains unapplied.

## Do not clear these ambiguous failures

- IDs181,182,183 share a GlossGenius URL that returned HTTP502 once. This may be transient; no conclusion that it is dead and no proposed change.
- ID493 timed out after12 seconds. This is unverified, not dead; no proposed change.
-101 generic directory links and185 missing URLs remain a separate research queue. No bulk deletion or identity consolidation proposed.

## Replacement research, not approved corrections

Radiant Roots has a current primary-provider service page at https://radiantrootssw.glossgenius.com/services, plus a team page naming three staff at https://radiantrootssw.glossgenius.com/team. Service page opens and has selection controls. The current profile496 is a business-brand listing, not a confirmed named person. Full street/ZIP corroboration and business-versus-professional handling remain unresolved. Do not overwrite its identity or booking/source fields yet.

Psyp Wellness primary website https://www.psypwellness.com/ links to a Medical Massage Booksy vanity URL, but retrieval redirected to a Booksy deep link that the research tool reported inaccessible (non-retryable). Search snippets mentioning the old business cannot outweigh the observed deleted-destination redirect. No verified replacement approved.

Esthetics By Marlin appears in recent Booksy directory snippets, but no current individual destination was verified. Leave on the review queue. These findings demonstrate why a failed old URL must not be equated with a closed business.

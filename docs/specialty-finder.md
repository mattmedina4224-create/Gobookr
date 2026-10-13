# Specialty discovery

The homepage link and dialog use “What specialty are you looking for?” The panel opens only on request. A shared controlled catalog recognizes specific phrases and aliases; no LLM, third-party credential, or conversation storage is involved. Ambiguous requests ask the customer to choose; unknown requests offer the catalog or ordinary search. City or ZIP is requested after the specialty.

Professionals select their own specialties at `/dashboard/pro/specialties`, reachable from profile editing, the professional menu, and the service setup step. The server derives ownership from the session, requires CSRF, rejects specialties outside the professional's categories, and replaces selections atomically. No existing professional was assigned specialties during deployment. These are self-listed skills, not verified credentials.

`pro_specialties` has a bounded catalog check, composite primary key and `(specialty,pro_id)` search index. RLS and revoked Data API grants keep writes behind the application's existing owner checks. The application uses its server database connection.

The public finder returns at most six eligible matches and safe photo URLs. City is matched case-insensitively, or an exact ZIP is used. The full result page preserves the specialty across filter links and offers a wider search. Shared SQL filters public eligibility before the limit, then existing bulk hydration enforces visibility. Private drafts and expired subscriptions stay excluded. No match is presented honestly; related categories aren't represented as exact specialty matches.

Verification: real HTTP/CSRF middleware and isolated Postgres tests cover saving/removing/retaining skills, ownership, invalid categories, aliases, public visibility, city/ZIP, filtered results, and denied Data API access. Launch depends on professionals listing their specialties, so early searches can be empty.

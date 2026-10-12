# GoBookr Meta connection setup

This is a tester-only authorization foundation, not a working publishing or scheduling integration. No endpoint in this release posts to social accounts. Existing assisted Story sharing stays available.

## Owner setup

1. Create the GoBookr app in Meta for Developers, associated with the intended business portfolio. Select Facebook Login/Page management and linked Instagram publishing capabilities appropriate to the current Meta dashboard.
2. Share only the public App ID with the implementation engineer. Put the App Secret directly into the production project's secret environment variables; never paste it or access tokens into chat, a ticket, or source control.
3. Provide a Facebook Page you manage, linked to an Instagram Business account, for Story eligibility testing. Meta app-role testers must have access to the account they test.
4. Register this exact OAuth redirect URI: `https://gobookr.com/integrations/meta/callback`.
   Use `gobookr.com` as the app domain and `https://gobookr.com` as the website. Existing public policy pages are `https://gobookr.com/privacy` and `https://gobookr.com/terms`. Verify their content covers the final integration before submitting review; provider deauthorization and data-deletion handling are still launch work.
5. Complete Meta's required access review and business verification before expanding beyond designated test accounts. A successful development authorization is not approval for public use.

## Server configuration

All variables are server-side; none use a public-client prefix. Configure preview separately if testing there; its HTTPS `APP_URL` must match a registered redirect URI. Do not share production credentials with arbitrary preview branches.

| Variable | Purpose |
| --- | --- |
| `META_APP_ID` | Public numeric App ID |
| `META_APP_SECRET` | App Secret stored as a secret in Vercel |
| `META_GRAPH_VERSION` | Explicit supported version selected in the Meta app, such as `vN.N`; no hard-coded fallback |
| `META_TOKEN_ENCRYPTION_KEY` | 32 random bytes encoded as 64 hex characters; store securely and retain for decrypting existing connections |
| `META_TEST_PRO_IDS` | Comma-separated GoBookr professional profile IDs, not user IDs |
| `META_CONNECTIONS_ENABLED` | Set to `1` only after configuration review; does not enable publishing |
| `APP_URL` | Canonical HTTPS application URL; production is `https://gobookr.com` |

Generate the encryption key locally with a trusted cryptographic tool, then enter it directly into the secret environment field. Do not print or send it in application logs. Key rotation needs a separate migration plan for existing ciphertext.

## Test connection

Open `/dashboard/pro/social` while signed in as an allowlisted professional. Start authorization, grant only the intended Pages, choose the authorized publishing Page, and confirm it. Stored Page tokens and temporary choices are AES-256-GCM encrypted, context-bound to the professional/connection. OAuth state is hashed, session-bound, single-use, and expires after ten minutes. Temporary choices are also session-bound and expire after ten minutes.

Only up to 50 Pages returned in the first provider page are offered. If the desired Page is missing, narrow the accounts authorized in Meta and reconnect. Page posting tasks and granted scopes are checked. Connection expiry uses the returned authorization lifetime conservatively; automatic refresh is not implemented. Reconnect when expired.

Test cancellation, replay, wrong session, denied scopes, missing linked Instagram, expired credentials, and disconnect. Disconnect removes GoBookr's stored tokens and pending authorization data; it does not revoke Meta permissions globally. The account owner can remove GoBookr in Meta's app settings too.

## Remaining launch work

- Real Meta-app validation of requested scopes, login configuration, granted Page tasks, linked account type, and token lifetime.
- Durable image upload/rendering and explicit per-destination publish approval.
- Facebook Page Story and Instagram Story publishing, processing-status checks, errors, and duplicate protection.
- Credential refresh/reconnect behavior and cancellation-safe scheduled jobs.
- Public access rollout only after Meta approval, with privacy policy and deletion requirements verified.

Reference: Meta's official Instagram/Facebook API Postman collections and current Meta app dashboard. Login/publishing scopes differ between Facebook Login and Instagram Login; this foundation intentionally uses the Facebook Login path (`instagram_basic`, `instagram_content_publish`), not the Instagram Login scope family.

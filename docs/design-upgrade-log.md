# gobookr visual polish — review and validation log

Branch: `design/sitewide-polish-2026-10-02`. Base: production main `fb3b85259ef76bf52dfdc72d7d1ced83b0563d0a`.

## Changes

- Added the requested global tokens, Inter, reusable component styles and compatibility classes for existing templates.
- Frosted sticky navigation, ink lowercase gobookr wordmark, one signup CTA; navy hero and footer; floating white search panel; blue gradient primary buttons.
- Applied consistent typography, spacing, soft card shadows, button/card/chip radii, cropped photos, keyboard focus and reduced motion.
- Replaced decorative interface emoji/heart/rating/eye icons with a pinned Lucide SVG sprite; preserved accessible labels and password-toggle behavior. Brand calendar logo is retained as a brand asset.
- Added the discovery stylesheet directly to the shared shell so the final component layer has stable cascade order.
- Kept content, query/claim/billing behavior, forms, route destinations, external booking URLs and existing layout structure. No database, authentication, billing, secrets or production configuration changes belong to this PR.
- Used the five active text sizes: small, base, large, section heading, hero heading. The requested extra-small token remains available but unused.
- Informational muted text uses the body tone for AA contrast. Verified badges keep green icons with ink text because the supplied green does not reach 4.5:1 for small text.

## Local checks

Initial complete suite: 212/212 passed, zero skipped. The existing wedding/mobile gap assertion was updated to the requested spacing token. Final validation status is recorded in the PR.

Initial pre-glow color-pair calculation (WCAG relative luminance; normal text minimum 4.5:1):

- body on white: 7.58:1
- ink on white: 17.85:1
- white on button top: 4.51:1
- white on button center: 5.17:1
- white on button bottom: 6.70:1
- error on white: 4.83:1
- active chip: 6.16:1
- footer text: 8.40:1

These calculations do not replace a rendered, site-wide contrast audit.

## Screenshot evidence

Captured live production BEFORE desktop screenshots at 1363×936 (browser screenshot width varies with scrollbar). Files are in `docs/design-screenshots/` for homepage, search, pro /521, claim /521, and claim signup /521. These are genuine browser captures, not mockups.

Mobile before screenshots and after comparisons are not yet complete. Vercel previews are missing DATABASE_URL; database-backed pages fail at runtime. No fabricated profiles or screenshot fixtures were introduced. The PR must remain unmerged until real homepage/search/profile/claim/signup previews are checked at 375px and desktop, and after screenshots are added.

## Merge gate

Owner configured the isolated Preview DATABASE_URL and redeployed on October 2. Deployment DMnYB3bbsHhg3AJPj24dRxSZvmZs returns HTTP 200 for homepage, search, pro /521, claim and signup. Browser access through Vercel's temporary share link succeeds. Desktop inspection caught a legacy logo background and zero-size font hiding the lowercase wordmark; reset those visual styles and keep the mobile menu button hidden on desktop. Required screenshot matrix and 375px rendered verification remain outstanding.

Configure a safely scoped preview database connection with explicit owner approval, then complete the required preview and screenshot matrix. No secret values should be shared in chat. Green build/CI alone is insufficient to approve this PR.

## Glow upgrade

- Added the requested electric-blue tokens, hero light orbs, focused input rings and active-chip glow. Ordinary cards keep soft neutral shadows; the optional featured class is not applied to any card.
- Glow is applied to existing professional and business Book controls and the hero Search CTA. Only that Search CTA pulses; reduced-motion disables it. Other primary buttons retain a gradient without a glow.
- The requested #4F8DFF button stop has white-text contrast of only 3.19:1. A 20% black face overlay preserves the supplied gradient while raising its minimum calculated contrast to 4.72:1. The halo is clipped outside the button face so it cannot lighten the label background. Hover uses the same accessible face.
- Added a 15% hero overlay to preserve light-body-text contrast around the brighter orbs. A conservative sampled calculation (lightest base stop everywhere, 375px and 1363px widths) gives a minimum 4.80:1 for #E2E8F0 text; rendered verification is still pending.
- Business booking arrows now use the same Lucide sprite. No text, form behavior, route destinations or booking links changed in this follow-up.
- Follow-up local suite: 212 passed, zero failed or skipped. Rendered contrast, desktop/mobile after screenshots and end-to-end preview checks remain blocked by the missing preview DATABASE_URL.

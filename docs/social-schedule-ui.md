# Automatic Instagram Story schedule UI

The professional dashboard route is `/dashboard/pro/social/schedule`.

Default editor values are Monday–Friday, 8:00 AM, America/Denver. Professionals can select days, local time, and a supported U.S. timezone. A schedule may be saved while disconnected, but enabling automatic posting requires an unexpired Meta connection with a linked Instagram account.

Publishing remains separately gated. The editor intentionally states that saving a schedule does not itself publish content.

Meta's current official Instagram API documentation says content publishing is available to professional accounts, while Stories through the Facebook Login path are limited to Instagram Business accounts. GoBookr therefore labels the connection requirement as Instagram Business for this Story workflow and must verify provider eligibility again in the worker before every publish attempt.

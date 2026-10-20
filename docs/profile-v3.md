# Customer profile V3

The public `/pro/:id` page is progressively enhanced into GoBookr's tabbed customer storefront.

Tabs: Overview, Services, Availability, Reviews, Photos.

The server-rendered profile remains the source of truth and fallback. Existing booking links, claim controls, favorites/follows, reviews, portfolio, services, profile-view attribution and SEO structured data are preserved.

Availability is intentionally honest: professional-posted same-day openings can be shown, while the booking CTA continues to hand off to the professional's existing scheduler until a provider API is connected. No demo slot is presented as live availability.

The visual system uses GoBookr navy/cream/green and pill navigation rather than copying Google Business Profile styling.

# GoBookr search ranking

Search ranking follows a predictable hierarchy:

1. Respect the customer's filters and selected radius first. Profiles outside the radius are not promoted into the primary result set.
2. Rank text searches by evidence of the requested work: service name (120), About Me/bio (85), professional name/handle (60), workplace (45), broad category (25).
3. For equal relevance, profile quality is the intended tie-breaker: verified license, profile imagery, useful About Me, services, booking link, reviews, and strong rating.
4. Distance is the next tie-breaker; recency/id is last.
5. Search result cards explain the strongest matching evidence when possible (for example `Service: Balayage` or an About Me excerpt).

The ranking must never infer that a professional offers a specialty solely because their broad category commonly offers it. Free-text specialty queries remain open so niche terms in real profiles can match even when they are not in the curated suggestion catalog.

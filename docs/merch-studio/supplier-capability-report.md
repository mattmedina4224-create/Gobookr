# Merch Studio — supplier capability report

Checked 2026-11-20 against each supplier's public product and help pages. The same facts live in code in
`lib/merch/capabilities.js`. The studio shows a product or option only when this matrix confirms it. Anything marked
"not confirmed" counts as unavailable.

## Integration status

| Supplier | Account | How the studio uses it |
|---|---|---|
| Printful | Connected (GoBookr account) | Live adapter (`lib/merch/suppliers.js`). It calls the API only when `PRINTFUL_API_KEY` **and** `MERCH_LIVE_FULFILLMENT=1` are both set. Otherwise it runs as a labelled simulation. |
| Gelato | None | Simulated only. No orderable products until offers are verified with an account. |
| Printify | None | Simulated only. Same rule as Gelato. |

The design supports more than one supplier per order. Each line routes to a supplier, the order splits into one
supplier order per supplier, and the unit tests run a mixed order with simulated suppliers. Customers are told that
items may arrive in separate packages.

## Products (Printful)

| Product | Printful product | Options shown | Source |
|---|---|---|---|
| Business cards | Set of Business Cards (#724) | 3.5″ × 2″; single or double-sided; uncoated stock only (Mohawk uncoated in the US, Munken Lynx 300 g/m² in the EU); sets of **50 or 100**. 500 cards = 5 sets of 100. | printful.com/custom/product/724 |
| Appointment cards | The same business-card product, with an appointment layout on the back | Same as above. Double-sided only. | Same |
| Stickers | Kiss-Cut Stickers (#358) | 3″, 4″, 5.5″ square and 15″ × 3.75″. White glossy vinyl. Transparency prints white, and Printful adds a white border. | Printful kiss-cut sticker page and sticker guidelines |
| Team T-shirts | Unisex Staple T-Shirt, Bella + Canvas 3001 (#71) | Black, S–2XL. Front print. Stock and variant IDs are checked live. | Printful catalog |

**Not shown because they are not offered:** gloss, foil or other card finishes; other card sizes; transparent stickers.
Gift cards, flyers, postcards, product labels, thank-you cards, loyalty cards and packaging inserts are listed as
"Coming later". None of them can be ordered until a supplier offer is verified.

## Print-file specs (per supplier, never generic)

| Product | Canvas | DPI | Bleed | Safe margin | Format |
|---|---|---|---|---|---|
| Business/appointment card | 1125 × 675 px (3.75″ × 2.25″) | 300 | 0.125″ | 0.125″ inside trim | PNG, sRGB, front and back |
| Sticker 3″ | 900 × 900 px | 300 | none (kiss-cut) | 0.0625″ | PNG, white stock |
| T-shirt front | 1800 × 2400 px (12″ × 16″) | 150 | none | — | Transparent PNG |

The values are marked `verified: 'runtime'`. Card size, stock and set quantities come from Printful's public page. The
exact print-file pixel sizes and variant IDs must be confirmed from the Printful API (product print files and
`/products/{id}` variants) before the first live order. The live adapter refuses an order when a variant does not
match exactly. **Launch blocker:** confirm the card print-file size in the Printful dashboard's file guidelines, then
update `SPECS` if it differs.

## Branded fulfillment

| Capability | Printful | Gelato | Printify |
|---|---|---|---|
| Ships without supplier branding | Yes | Not confirmed | Not confirmed |
| Logo on packing slip | Yes (black-and-white, 3″ × 2″) | Not confirmed | Not confirmed |
| Custom packing-slip message plus support email and phone | Yes | Not confirmed | Not confirmed |
| Branded inserts (pack-ins) | Yes. Stock must be approved and stored at the facility; $0.50 picking fee each and $25/month storage minimum. | Not confirmed | Not confirmed |
| A different insert printed for each order | **No** (inserts are stocked items) | Not confirmed | Not confirmed |
| Custom mailers | Yes, poly, bubble or paper mailers only, from stored inventory | Not confirmed | Not confirmed |
| Custom boxes | **No** | Not confirmed | Not confirmed |
| Exceptions | Partner and backup facilities print no custom slip or logo and use no custom mailers | — | — |

What we promise customers (from `branding.brandingPromise`):

- White-label shipping and the GoBookr packing slip are promised now.
- The slip notes that it is not printed when Printful routes an order to a partner facility.
- The insert card and branded mailers are shown as **not included** until phase 2 and phase 3 are in place.

## Packaging roadmap

1. **Phase 1 (now):** white-label shipping and a GoBookr packing slip. The slip carries the order number, business name,
   items, support contact and reorder link, sent in Printful's `packing_slip` order fields. The wording never says
   GoBookr made the goods: "Made for your business. Powered by GoBookr."
2. **Phase 2:** print the standard GoBookr insert card and promotional stickers and send them to Printful as approved
   pack-ins. The insert carries generic text with a reorder QR. Printful cannot personalize inserts per order, so the
   personalized version stays on the packing slip.
3. **Phase 3:** branded mailers at Printful once volume justifies the storage minimum. No custom boxes.

## Order and payment safety

- **Payment first:**
  - Supplier orders are created only after a verified Stripe `checkout.session.completed` with `payment_status=paid`.
  - The amount must equal the quoted total exactly. A mismatch holds the order for review.
- **Duplicate protection:**
  - Stripe checkout and refund calls use an idempotency key.
  - Each supplier order has a unique `external_id`, `<order>-<supplier>`. The Printful adapter looks this up before
    creating anything, so retried requests never create a second supplier order.
- **No live charges or real orders by default:**
  - A live Stripe key is refused unless `MERCH_LIVE_PAYMENTS=1`.
  - Simulated prices can never be charged in live mode.
- **Failures:**
  - A failed supplier order puts the order into "Needs attention".
  - `refundSupplierPortion` refunds that supplier's items plus their share of shipping and tax. It is idempotent.
- **Printful webhooks:**
  - Authenticated by a secret path token.
  - State is re-read from the Printful API before a shipment is recorded.
  - Duplicate events are dropped.

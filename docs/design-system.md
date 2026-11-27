# Tovara design system (2026 redesign)

`public/gobookr-ui.css` is the single source of truth for Tovara's look. It loads last on every page
(`lib/layout.js`), defines the tokens below, provides shared components, and remaps the legacy
variables (`--ink`, `--brand`, `--paper`, …) so older stylesheets render on-system.

## Principles

- **A technology marketplace, not a salon site.** White and Cloud surfaces, Midnight type, one accent.
- **Iris means "you can act on this."** Buttons, links, active states. Never decoration.
- **Mint is a signal.** Verified licenses, "open today". Use sparingly.
- **Designed for sparse data.** Most real profiles have no photo, reviews, or services yet. Cards and
  profiles lead with a monogram and real facts (workplace, location, booking platform) and must look
  finished without imagery.
- **One memorable element.** The homepage calendar mosaic echoes the Tovara mark. Everything around it
  stays quiet.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--gb-midnight` | `#101828` | Primary text, dark band, primary nav button |
| `--gb-cloud` | `#F8FAFC` | Page tint, tinted sections, input chrome |
| `--gb-iris` | `#6558F5` | Primary buttons, active states |
| `--gb-iris-ink` | `#4B3FD9` | Iris for text/links on white (AA) |
| `--gb-mint` / `--gb-mint-ink` | `#18B6A4` / `#0B7A6E` | Verified and live signals |
| `--gb-silver` | `#E9EAF2` | Borders, subtle surfaces |
| `--gb-ink-2` / `--gb-ink-3` | `#3B4459` / `#5F677A` | Secondary / meta text (AA on white) |

Radii follow hierarchy: controls `--gb-r-sm` (10px) → cards `--gb-r-lg` (20px) → hero sheets `--gb-r-xl` (28px).
Borders do most of the separation work; shadows are reserved for things that float (search console,
menus, dialogs).

## Type

- **Inter Display** for headings (`h1`–`h4`), tight tracking at large sizes.
- **Inter** for UI and body text. Both self-hosted in `public/fonts/` as Latin WOFF subsets (SIL OFL,
  see `public/fonts/LICENSE-Inter.txt`).
- Scale tokens: `--gb-display`, `--gb-h1`…`--gb-h4`, `--gb-text-xs`…`--gb-text-lg` (fluid with `clamp`).
- Labels are sentence case. No tracked ALL-CAPS eyebrows.

## Components

| Component | Classes |
| --- | --- |
| Buttons | `.btn`, `.btn.secondary`, `.btn.ghost`, `.btn.gb-dark`, `.btn.gb-lg`, `.btn.small` |
| Inputs | native `input`, `select`, `textarea` (styled globally), `.field`, `.helptext` |
| Search console | `.gb-search` › `.gb-search-form` › `.gb-search-field` + `.gb-search-submit` |
| Cards | `.panel`, `.card`, `.gb-pro-card`, `.gb-biz-card`, search `.market-pro-card` |
| Badges & chips | `.badge`, `.badge.category`, `.gb-badge-verified`, `.gb-chips`, `.category-pills` |
| Tabs | `.gb-tabs`, `.result-type-tabs` (segmented) |
| Notifications | `.alert.success / .error / .info / .warning` |
| Monogram avatar | `.gb-monogram` (also applied to legacy fallbacks) |
| Empty state | `.empty-state` |
| Skeleton | `.gb-skeleton` |
| Facts list | `.gb-facts` (definition list) |

## Rules for new work

1. Use `--gb-*` tokens. Do not hard-code hex colors in routes or stylesheets.
2. Prefer existing components. Add new ones to `gobookr-ui.css` in the matching section.
3. Avoid inline `style=""` and JavaScript-applied styles; add a class.
4. Check desktop (1440) and mobile (390): no horizontal overflow, 44px+ touch targets, 16px inputs on iOS.
5. Respect `prefers-reduced-motion` (already handled globally).

# Search ranking QA

Before changing ranking, verify these cases:

- A direct service match ranks above a bio-only match for the same specialty.
- A bio/About Me match ranks above a generic category match.
- A complete, verified profile wins only when relevance is otherwise equal or nearly equal.
- The selected radius remains a hard filter for primary results.
- Distance breaks ties after relevance/quality rather than replacing relevance.
- Search cards show the strongest available match reason.
- Alias searches such as `grey`/`gray`, `fine line`/`fineline`, and `skin fade`/`bald fade` continue to work.
- A category alone never invents a niche specialty the professional did not state.

# Search ranking release

This change completes the GoBookr search-quality ranking pass. Specialty/service evidence is prioritized ahead of generic identity/category matches. Profile completeness contributes only fractional tie-breaker points, so a polished generic profile cannot jump ahead of a professional with materially stronger evidence for the requested specialty. Existing radius filtering remains unchanged, and distance continues to sort otherwise comparable matches.

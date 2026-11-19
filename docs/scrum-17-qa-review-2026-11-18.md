# SCRUM-17 QA follow-up - November 18, 2026

Jira: https://cst-4800-group1.atlassian.net/browse/SCRUM-17

## Scope and version

I checked the public BuildLab site at https://cst-4800-group1.vercel.app/ on November 18, approximately 7:25-7:30 PM America/New_York.
The source tested locally is main commit `9f22e6520ed7745515f30365810ede12b5e4c110` (PR #14).
The exact production deployment SHA remains unconfirmed: Vercel opens a sign-in page and no deployment-to-SHA record was available in this review. The live feature checks below do not establish an exact deployed SHA.

Khan's November 18 Jira report and attached screenshots remain his QA evidence. He reports desktop/mobile layout, filters, product details, component selection, build summary, AM5 match, AM4/AM5 mismatch and PDF generation passing. My follow-up below is separate from his reported checks.

## Fresh live browser checks

| Check | Steps / expected | Observed |
|---|---|---|
| Verified socket match | Select B&H offers for Ryzen 7 7800X3D and Gigabyte X870E AERO X3D WOOD | Sockets match, AM5/AM5, manufacturer specification links; $339 + $451 = $790 |
| Verified mismatch | Replace CPU with Ryzen 5 5500F AM4 | Socket mismatch names AM4 and AM5; $99.99 + $451 = $550.99 |
| Missing/unverified socket | Replace CPU with Intel Core Ultra 5 225, keep the AM5 board; allow selected metadata lookup to settle | Compatibility unknown; CPU socket unavailable, motherboard AM5; $178.55 + $451 = $629.55. The title's LGA1851 text does not cause a match |
| Waiting | Remove CPU using Enter | Waiting for selection; total $451 |
| Keyboard controls | Tab from search through sort, all eight category buttons, refresh, removal, source link, export and clear | Controls receive focus in order |
| Keyboard details | Enter opens details, Space chooses retailer, Escape closes | Selection updates; Escape returns focus to the originating details button |
| Keyboard export/clear | Enter on PDF download; Space on Clear build | Actual PDF saved; clear gives $0, waiting and disabled export |
| No results | Search zzNoMatchingPart123 | 0 parts and explicit no-results message |
| Refresh | Enter on Refresh catalog | Loading/unknown during refresh, catalog returns; no stale match claimed during loading |
| Reload persistence | Reload selected $790 AM5 pair | Both selections and total persist; compatibility starts unknown pending fresh metadata |

This is targeted keyboard coverage, not a screen-reader audit or a claim of WCAG conformance. I did not force a failure against the hosted provider; stale/failed-refresh cases were tested with the existing controlled test suites below.

## PDF verification

Two actual disk downloads were inspected, not just a generated Blob:

- Matching pair report: valid PDF-1.4, 7,611 bytes, two pages. Contains the exact two selected model names, $339 and $451 prices, $790 total, SOCKETS MATCH, AM5/AM5, check time, both retailer links and both manufacturer specification links.
- Unknown pair report: two pages; $178.55 and $451, $629.55 total, NOT VERIFIED, CPU Not verified / motherboard AM5, and the unknown explanation matching the page.
- Both explicitly warn that socket results do not verify BIOS support or full-build compatibility.
- The current export is PDF. Older JSON-only acceptance wording needs to be read against the current format; no new JSON export pass is claimed.
- Text and link contents were inspected. Both pages of the matching-pair PDF were rendered with macOS PDFKit and visually checked: readable text, correct prices, source links and caveats; no clipped or overlapping content was observed.

## Repeatable controlled regression checks

From the pinned source commit, run:

```sh
node --test tests/*.test.mjs
python3 -B -m unittest api.test_catalog_prices api.test_catalog_sockets api.test_catalog_rate_limits
```

Results from this review: **54 Node tests passed; 53 Python tests passed**.

The suites cover CPU/motherboard refresh failure, missing/unsupported/malformed/stale metadata and provenance, expiry boundaries, unknown in downloaded results, selected-product enrichment, provider cooldown, four-state UI/export consistency, price selection, totals, replacement/removal/clear/persistence and the real PDF writer. These controlled checks are not additional live retailer checks.

## Remaining acceptance

1. Vlad records the production URL and exact deployment commit in SCRUM-18 / this ticket.
2. Review this QA evidence PR and resolve comments. Since I authored this PR, I cannot submit a GitHub approval of my own work; the required independent-review arrangement must be explicitly recorded before closure.
3. PM closure decision: SCRUM-17 is Done for the completed QA execution. The outstanding production commit, PR review and independent-review arrangement are explicitly tracked on the existing SCRUM-21 parent, which remains open. This changes the QA closure scope; it does not claim that the original review gate was met, that this PR was approved/merged, or that the release was accepted. No duplicate ticket is needed.

Full build compatibility and 3D work remain outside this QA sign-off.

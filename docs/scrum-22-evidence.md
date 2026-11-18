# SCRUM-22 / SCRUM-23 local code and test evidence

## November 17 retailer product links

Retailer rows retain matched product URLs even if the price fetch fails or a
later response omits a URL. A matched link becomes clickable immediately rather
than waiting for other retailer prices. Late link-only responses also update
finished rows without overwriting manually entered prices. Matched links open
the exact retailer product page in a new tab. At Qi's subsequent request,
unmatched retailers now link to that retailer's search results for the selected
model, explicitly labeled "Search results". Search URLs are never stored or
treated as verified product URLs; a later match replaces the search link.

New tests cover early links during another pending lookup, late links after
price failure, preserving entered prices, and URL retention after blocked
product detail retrieval. A further test checks encoded search terms and
replacement of the fallback with a verified product page.
**49 Python tests and 56 frontend/root tests pass**;
TypeScript build/noEmit and whitespace checks pass. The Vercel deployment still
needs to be updated and verified before merge.

## November 17 rate-limit fix (PR #11)

Vlad reported that CPU-only loading in the Vercel preview coincided with provider
429s. Inspection found optional socket detail fan-out, rendered retries on 429,
and `no-store` preventing shared response caching. The correction:

- Load all seven listing categories before optional CPU/motherboard specs.
- Cap enrichment at three sequential detail requests per category; no rendered
  retries for optional specs. Failed specs preserve prices and remain unknown.
- Serialize provider requests within a worker, pace their starts, and honor
  Retry-After (seconds or HTTP date) on 429. Never retry a rate limit as rendered.
- Permit Vercel shared caching only until the earlier of the catalog's one-hour
  age and its earliest socket expiry (minus two seconds). Browser caching remains
  disabled, expired data is not served as a stale success, and failures are not cached.
- Remove tracked Python bytecode and the temporary Best Buy HTML dump; ignore
  future bytecode and temporary HTML files. Keep the source, tests and evidence.

New tests cover the cold seven-category request budget, listing-before-spec
ordering, metadata failure preserving all categories, cache reuse, bounded shared
cache lifetimes, serialized requests and provider cooldown.
November 17 local checks: **47 Python tests passed** (including all 21 price
tests), **53 frontend/root Node tests passed**, TypeScript build/noEmit and
`git diff --check` passed. Historical results
and live capture below describe the earlier revision. A corrected Vercel preview
still needs verification before merge; no deployed success is implied here.

The supplied site `https://cst-4800-group1.vercel.app/` and its `/app.js` returned
HTTP 200 during inspection. That deployed JavaScript did not contain the new
listing-first (`metadata=0`) flow; it cannot validate this revision yet.

Live checks through the corrected local API handler, using the existing ZenRows
key without printing it, returned HTTP 200 for all seven listing-only categories:
CPU 25, motherboard 2, graphics card 25, RAM 25, storage 25, power supply 25,
and case 25 records. Every success included bounded shared-cache headers.
This verifies current live retrieval with the changed code locally; it does not
verify Vercel deployment or that future account-wide 429s cannot occur.

[Vercel cache header reference](https://vercel.com/docs/caching/cache-control-headers)
documents the separate shared-cache header and its priority over browser headers.

## Original implementation verification

Implementation and verification: November 11, 2026 (America/New_York).
Capture timestamps are UTC, so the saved capture is dated November 12 UTC.
Qi implemented the live metadata API and completed the supplied Howard rule
under Qi's reported delegated confirmation. Howard's base code and Justin's
earlier examples remain credited. No independent approval is claimed.

## Checks completed

| Command | Result |
| --- | --- |
| `python -m unittest discover -s api -p 'test_*.py'` | 39 passed: 18 socket/API tests and all 21 existing price tests |
| `cd frontend; npm test` | TypeScript compilation and all 52 frontend/root tests passed |
| `cd frontend; npm run check` | TypeScript noEmit check passed |
| `git diff --check` | Passed |

The API suite exercises the actual handler using in-memory HTTP responses and
synthetic source pages. It covers valid AM5/LGA1700 values for both CPU and
motherboard, exact URL/model identity, multiword manufacturer models, missing
and unsupported data, conflicts, related-product exclusion, malformed evidence,
fetch failure, rendering retry, refresh budget, expired caches and no-store
headers. Failures preserve valid price records without returning stale socket
success. Synthetic tests never use production credentials or contact retailers.

The root suite includes the 14 documented rule examples plus invalid/future
provenance, exact expiry, the live recorded pair, selection replacement,
missing/stale metadata, refresh failure, displayed/exported consistency and an
open-page expiry timer. Existing price, retailer selection and frontend tests
remain passing. The normal `npm test` command passed with process workers;
in sandbox environments blocking worker spawn, `--test-isolation=none` is an
equivalent alternate runner for the same root suites.

## Actual live API response capture

[`scrum-22-live-response.json`](scrum-22-live-response.json) stores actual local
API handler bodies/headers from live ZenRows retailer requests. It is not a
deployed HTTP capture. For a bounded verification run, the maximum number of
products per category was set to eight; the socket retrieval budget and parser
were the production implementation, not a separate manually assembled extractor.
The capture contains no API keys or raw retailer HTML.

- CPU: HTTP 200, eight records, one verified AM5 record.
- Motherboard: HTTP 200, two records, one verified AM5 record.
- The remaining checked records stayed unknown rather than acquiring inferred
  sockets. Unknown can mean unsupported/missing data or unsuccessful retrieval;
  do not infer a specific reason from a product name.
- Both successful responses use `Cache-Control: no-store`.

Verified live pair:

| Category | Manufacturer model | Verified source label/value |
| --- | --- | --- |
| CPU | `100-100001973WOF` | CPU Socket / AM5 |
| Motherboard | `X870E AERO X3D WOOD` | CPU Socket / AM5 |

CPU source:
https://www.bhphotovideo.com/c/product/1944461-REG/amd_100_100001973wof_ryzen_7_9850x3d_4_7.html

Motherboard source:
https://www.bhphotovideo.com/c/product/1950535-REG/gigabyte_x870e_aero_x3d_wood.html

The saved API response includes each source URL, explicit field, raw value,
method, verification time and expiry. It is historical evidence: after
`expiresAt`, a current evaluation of these saved records is unknown. The
cross-layer test verifies their match at a fixed historical time and their
expiry afterward. LGA1700 support was validated with synthetic API/rule tests;
this capture does not claim a verified live LGA1700 product.

To regenerate a live capture from the repository root:

```powershell
python -m scripts.capture_socket_evidence --limit 8
```

This makes live, potentially billable ZenRows requests using the existing
local/environment key. It prints only counts and writes sanitized API responses.
Provider availability changes; retain reviewed evidence before overwriting it.
Run the suite again after replacing the capture because it checks that a verified
live CPU/motherboard pair is present. Never use the historical capture as the
runtime catalog or substitute guessed sockets after a failed refresh.

## Handoff and remaining non-code steps

Micquaya: use [the field/result contract](live-socket-contract-proposal.md).
The root loader supplies freshness/refresh guards and expiry reevaluation;
preserve these in SCRUM-24 and keep exports consistent with displayed results.
The older TypeScript sample-catalog loader has not been migrated to the live
spec shape and is separate from the deployed root website.

Khan: use [the examples and expected results](socket-examples.md) and the saved
live response. Independently verify the reviewed revision; do not report these
local runs as your own independent results.

Prepared files and code are local. Handoff messages, Jira updates, PRs, final
commits, external reviews, merge and deployment are not performed by this change.
Each ticket still requires its own linked PR and all specified Erick/Vlad review
gates. This report does not mark either Jira ticket Done.

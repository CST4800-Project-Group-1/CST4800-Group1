# SCRUM-23 repeatable socket examples

Qi covers completion of SCRUM-23 at Qi's request. Howard Heaven Jr. supplied
the original rule; Justin retains credit for the earlier SCRUM-14 compatibility
examples. The examples reuse the repository's existing DemoCore/ExampleSilicon
and DemoBoard/ExampleBoard sample records and the earlier documented mismatch
between DemoCore C6 (AM5) and ExampleBoard B760 DDR4 (LGA1700). These are
synthetic examples, not verified products. Historical SCRUM-14 example credit
does not imply Justin authored the new evidence/freshness tests.

Machine-readable cases: `tests/fixtures/socket-examples.json`.
Runner: `tests/socket-examples.test.mjs`.
Base records: `backend/data/sample_parts.json`.
Fixtures add explicit synthetic provenance under `https://example.invalid`;
those URLs are never presented as live verification. Evaluation time is fixed
at `2026-11-11T12:00:00Z`, independent of the machine clock.

| Case ID | Expected status | Expected behavior |
| --- | --- | --- |
| verified-am5-match | match | DemoCore C6 and DemoBoard B650 ATX have fresh AM5 evidence |
| verified-lga1700-match | match | ExampleSilicon S6 and ExampleBoard B760 DDR4 have fresh LGA1700 evidence |
| mismatch-names-both-values | mismatch | Name DemoCore C6, ExampleBoard B760 DDR4, AM5 and LGA1700 |
| cpu-absent | waiting | Ask for a CPU |
| motherboard-absent | waiting | Ask for a motherboard |
| both-absent | waiting | Ask for both selections |
| missing-cpu-socket | unknown | Missing socket cannot establish compatibility |
| unsupported-equal-text | unknown | Equal AM999 strings cannot establish compatibility |
| equal-supported-without-evidence | unknown | Even equal AM5 strings require provenance |
| stale-cpu-evidence | unknown | CPU evidence expires exactly at expiresAt |
| stale-motherboard-evidence | unknown | Motherboard evidence expires exactly at expiresAt |
| failed-refresh-after-match | unknown | Old matching records cannot override failed refresh |
| pending-refresh | unknown | Old records cannot establish a decision during loading |
| trim-and-uppercase | match | Fresh ` am5 ` and `Am5` evidence normalizes to AM5 |

Every result must expose `scope: socket-only`, `biosChecked: false` and
`fullBuildChecked: false`. A socket match never verifies BIOS support or a full
build. Additional automated tests cover malformed provenance, wrong source,
future verification, invalid dates, excessive TTL and the exact expiry boundary.
The recorded live CPU/motherboard pair is also tested at its historical verified
time and after expiry; historical verification never overrides current expiry.

Run just the examples from the repository root:

```powershell
node --test tests/socket-examples.test.mjs
```

Run the complete frontend/rule/integration check:

```powershell
cd frontend
npm ci
npm test
npm run check
```

Khan: independently run the cases and record the reviewed commit and actual
results on your ticket. For a website rerun, refresh both categories, select a
verified pair, replace the motherboard with a different verified socket, remove
one/both selections, then exercise expiry and a failed category refresh.
Check that displayed and exported `socketCompatibility.status` agree, both
socket values are named on mismatch, and `compatibilityChecked` stays false.
Micquaya can use these same cases for SCRUM-24 integration. This document
prepares the handoff; it does not claim either recipient has received it or run it.

# CPU and motherboard socket result — proposed SCRUM-9 contract

Integration checkpoint: October 14, 2026. Rule owner: Howard (SCRUM-9).
Release reviewer: Vlad. This contract and reference rule require their review;
no evidence of Howard's completed rule was found in the repository on October 13.
This document does not claim that either approval has been given.

`evaluateSocketCompatibility(cpu, motherboard)` accepts current catalog Part
records, or null/undefined for a missing selection. Output is synchronous:

```json
{
  "ruleId": "cpu-motherboard-socket",
  "status": "mismatch",
  "cpuSocket": "AM5",
  "motherboardSocket": "LGA1700",
  "message": "Socket mismatch: DemoCore C6 uses AM5, but ExampleBoard B760 DDR4 uses LGA1700. Choose a CPU or motherboard with the same socket."
}
```

- `waiting`: either selection is missing; say which part must be selected.
- `match`: both socket values are recognized and match after trimming and case normalization.
- `mismatch`: both values are recognized and differ; name the selected parts and both sockets.
- `unknown`: missing/malformed/unrecognized socket data or invalid category; never label it compatible.
- Socket fields are trimmed strings or null for unavailable data. Status drives the UI; message is displayed as text, never HTML.

The reference evaluator is in `public/socket-compatibility.js`. It recognizes
only AM5 and LGA1700, the two families present in the Sprint 1 sample catalog.
Howard should approve or replace its rule, normalization and supported values
while keeping this result shape, or provide his actual result shape so the
adapter can be updated. Do not equate arbitrary equal strings with compatibility.
If his implementation is asynchronous or backend-driven, request cancellation,
out-of-order response handling and explicit pending/error results need review.

The BuildLab sidebar recomputes from current catalog records after add, replace,
remove, clear and refresh. Browser storage keeps only part IDs, never cached
compatibility results. Catalog loading/failure produces unknown; refresh resolves
saved IDs against fresh validated catalog data. Deleted records clear stale IDs.
Downloaded builds include `socketCompatibility`; `compatibilityChecked` remains
false because this rule does not check BIOS, RAM, clearance or complete builds.

## October 14 checkpoint

Howard: confirm the four statuses, socket normalization, known-socket policy and
rule implementation. Vlad: review PR #7 integration, root `public/` deployment,
error handling, accessibility, refreshed selections and the release boundary.
Merge and deploy only after the team release review. This preview must not
replace the presentation website or imply complete build compatibility.

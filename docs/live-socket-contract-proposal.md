# Live socket metadata contract ? SCRUM-22 / SCRUM-23

Implementation owner: QiXin Chen, including SCRUM-23 coverage at Qi's request.
Howard Heaven Jr. supplied the base rule. Justin retains credit for earlier
SCRUM-14 compatibility examples. Qi reports Howard delegated confirmation to Qi;
Qi adopted this contract in this conversation. This is not independent reviewer
approval. Record the takeover and agreement on Jira before acceptance.

Tickets:
- https://cst-4800-group1.atlassian.net/browse/SCRUM-22
- https://cst-4800-group1.atlassian.net/browse/SCRUM-23

## Fields delivered by the live API

For `cpu` and `motherboard`, `specs.socket` is `AM5`, `LGA1700`, or null.
Normalize by trimming and uppercasing only; no aliases or socket inference from
names, chipset names, URLs or feature blurbs. Other sockets remain unknown.

A verified socket has `specs.socketProvenance`:

| Field | Meaning |
| --- | --- |
| `sourceUrl` | HTTPS URL of the exact product specification page |
| `sourceField` | Explicit label: Socket, CPU Socket, Processor Socket or Socket Type |
| `rawValue` | Socket specification as supplied by that product |
| `verifiedAt` | UTC ISO 8601 timestamp of successful retrieval |
| `expiresAt` | UTC timestamp exactly one hour after verification |
| `method` | `explicit_product_spec` |

The source Product JSON-LD must match both the catalog product URL and exact
manufacturer part number/model. The adapter reads Product `additionalProperty`,
including B&H's named `Specs` group. It excludes related-product/offer subtrees.
Duplicate agreeing specifications are accepted; conflicting, malformed,
unsupported or absent values are unknown. Multiword manufacturer models are
preserved. Other source shapes remain unknown until explicitly supported.

Unknown representation:

```json
{"specs":{"socket":null,"socketProvenance":null}}
```

Other existing specification and price fields remain present. Detail lookup
failure keeps the valid price record and returns unknown socket metadata.

## Freshness and refresh

Evidence expires at `expiresAt`, with `verifiedAt <= now < expiresAt` and a
maximum one-hour lifetime. Missing evidence, invalid timestamps, future
verification times, mismatched sources/raw values and unsupported methods
cannot establish a match or mismatch. Catalog cache reads scrub invalid/expired
metadata without changing prices. Catalog responses use `Cache-Control: no-store`.
A failed listing refresh returns HTTP 503; it never returns the old cached success.

The importer attempts four concurrent detail fetches within an 18-second
category budget, each fetch using at most eight seconds of remaining budget.
An empty plain detail response may retry rendered specs within that budget.
Queued/timed-out/unverified products remain unknown. There is no guarantee every
record will have retrievable evidence on every request. Credentials remain
server-side; use the existing environment/local configuration.

## Rule contract for Micquaya

`evaluateSocketCompatibility(cpu, motherboard, context?)` is synchronous.
Optional context is `{now: epochMilliseconds, refreshState: 'ready'}`; defaults
are the current time and ready. Any non-ready refresh state prevents a decision
when both parts are selected. Callers must pass failed/loading state on refresh
failure/loading even if old records remain visible.

Result fields are `ruleId`, `status`, `cpuSocket`, `motherboardSocket`, `message`,
`scope: 'socket-only'`, `biosChecked: false`, and `fullBuildChecked: false`.

- `waiting`: either or both selections are absent.
- `match`: correct categories and fresh verified supported sockets agree.
- `mismatch`: fresh verified supported sockets differ; message names both
  selected parts and both socket values.
- `unknown`: invalid categories, evidence, sockets, expiry or refresh state.

The diagnostic socket fields retain trimmed source strings, or null. Use status
to decide what to display; an unverified string in diagnostics is not a match.
Even equal AM5 strings without provenance are unknown. Historical seed records
without provenance therefore do not qualify as verified live evidence.

Root `public/app.js` supplies refresh state, schedules expiry reevaluation,
checks again for export and renders the source link in details. Keep displayed
and exported status consistent. `compatibilityChecked` stays false: BIOS and
full build compatibility are unchecked. Preserve these guards when integrating.
The separate legacy `frontend/src/catalog.ts` sample-catalog validator is not
the deployed root loader; its richer static specification requirements are
unchanged. Do not substitute it for the live loader without adapting its schema.

## Examples, tests and evidence

- [Repeatable rule examples for Khan](socket-examples.md)
- [Test results and live source evidence](scrum-22-evidence.md)
- [Actual local API capture](scrum-22-live-response.json)

The capture contains historical live responses, not runtime fixtures or deployed
HTTP evidence. Its metadata becomes unknown after its recorded expiry. The
example suite explicitly uses fixed evaluation times for historical evidence.
No handoff message, Jira edit, PR creation, merge or deployment was performed.

## Review gate retained

Each ticket needs its own linked GitHub PR with its Jira key in the title and a
backlink. Include implementation/documentation, tests and evidence. Request
`rome1975` and `Vladosik-V`; keep the ticket open in Testing during review.
Close only after both approve the latest revision, changes are resolved,
required checks pass and the approved revision is merged. Later changes need
renewed review. Record PR URL, final commit, both review links and evidence.
Self-review does not count; a reviewer-author case needs an explicit independent
review arrangement. Local code completion is not ticket closure or approval.

# MayDo — LaunchGate CR4 Pack

**To:** LaunchGate (4th CR — go/no-go on merging the implement PR)  
**From:** CR×3 code chain (CR1 → CR2 → CR3). Parent hands this pack; CR agents do not message you.  
**Product:** MayDo — yellowgram entitlement kernel (`allow(actor, action)`)  
**Date:** 2026-09-27  
**PR:** https://github.com/yellowgram/maydo/pull/2  
**Branch:** `cursor/implement-mvp-kernel-2963`  
**Mode:** Code is on the PR. Do not squash-merge in this pack. Do not Soft-WTP.

---

## 1. Paths to read (in order)

| # | Path | Role |
| --- | --- | --- |
| 1 | `design/DR3.md` | Design freeze (D1–D12, R1–R7) |
| 2 | `design/LAUNCHGATE_DR4_PACK.md` | Kill line from the design gate |
| 3 | `design/CR1.md` | Isolation, revoke lock, console auth |
| 4 | `design/CR2.md` | Lock survival, refund cap, production secrets |
| 5 | `design/CR3.md` | This pass: clock, drain scope, purge floor, SDK reasons |
| 6 | `docs/KNOWN_LIMITS.md` | Residual P2, including the five CR2 decisions CR3 froze |

Primary attack surface: **CR3 § LaunchGate pre-check** and anything in the PR diff after CR2 that smells like a kill criterion.

---

## 2. What CR3 changed

- Future `event_ts` clamps to the verified signature. Equal timestamps: revoke wins.
- `allow` and key expiry use the database clock.
- CLI `outbox drain` stays on `MAYDO_TENANT_ID` unless `--all-tenants`.
- `purge_allow_audit` refuses a window under 30 days. Runtime roles cannot `DELETE` audit tables.
- HTTP 400 `allow` is `bad_request`, not `maydo_unavailable`. The SDK does not cache outages.
- `scripts/demo-60s.sh` plus a CI assertion under 60 seconds.

No kill creep: no invoicing, Soft-WTP, SeatTruth auto-revoke, fail-open, quantity math, `md_op_` in the SDK, or a packaging studio.

---

## 3. Residual P2

See `docs/KNOWN_LIMITS.md`. Short list: plaintext webhook secrets, `SECURITY DEFINER` token lookup, one-process rate limit, IPv6 allowlists, no CSRF token beyond `SameSite=Lax`, provider revoke without a timestamp versus a newer local allow, both-null event timestamps are last-write-wins, sticky warn-above-10 is not a hard cap, replay does not re-verify the provider signature, no guessed hop count for a second proxy.

---

## 4. Remaining block before a Polar listing

**Kit status page.** Policy text for the process the buyer runs is `docs/STATUS.md`, `docs/INCIDENT_TEMPLATE.md`, and `status/index.html`. https://status.yellowgram.dev/maydo is not deployed by this repo and is not a yellowgram-operated decision API. The founding goodwill note was moved to `design/archive/FOUNDING_GOODWILL_CREDIT.md` (**not sold / not buyer-facing**). Do not show it before charging. It is not an SLA and it is not a credit.

RLS cross-tenant drain coverage and Polar/Stripe pin fixtures are in tree and run under `npm test`. The ≤60s path is `docs/START_HERE.md` + `scripts/demo-60s.sh`, and CI clocks the same sequence.

---

## 5. Ask

**Go / no-go:** May the parent merge PR #2 (`cursor/implement-mvp-kernel-2963`)?

- **Go** = CR1–CR3 P0/P1 fixes stand; residual P2 stays in `docs/KNOWN_LIMITS.md`; Polar listing still waits on a live status URL.  
- **No-go** = name the kill criterion or the regression. Do not rewrite CR history.

Do not squash-merge as part of answering. Do not contact founding buyers. Do not enable Soft-WTP.

# Checksums

SHA-256 of buyer zips. For the current tag, paste that row's hex into the Polar file checksum field. Sealed rows are historical. Do not regenerate those zips.

| File | SHA-256 |
| --- | --- |
| `release/maydo-0.1.1.zip` | `ef51fa9ca1619588e255bbd30f5780cc700fd0acdeb166c2d1f44f442b552974` |
| `release/maydo-0.1.0.zip` | `5aaba05786a24e23977e1646aca2a0915c5de28b3f9b98d440b245e70027586e` |

## Current pack

- Version: `0.1.1`
- Zip path: `release/maydo-0.1.1.zip`
- Zip comment: `maydo-0.1.1`
- Archive prefix: `maydo-0.1.1/`
- Pinned entry time: `2026-09-26T00:00:00Z`
- Built by `scripts/pack-release.sh` from `git archive` of HEAD.
- The zip omits this file and `release/`.

## Sealed

- `release/maydo-0.1.0.zip` stays sealed. SHA-256 must remain `5aaba05786a24e23977e1646aca2a0915c5de28b3f9b98d440b245e70027586e`.

`npm run pack:release` writes `release/maydo-0.1.1.zip` from `package.json` and refreshes that row only. A clean tree must succeed. The only dirty paths the script allows are this file and `release/`.

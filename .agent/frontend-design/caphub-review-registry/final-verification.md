# Caphub P3 Final-Build UI Verification

**Date:** 2026-09-16
**Build:** production webpack build from implementation HEAD `750efe3`
**Environment:** isolated HTTPS loopback fixture with sentinel-owned PostgreSQL 17.11 and temporary Caphub root
**Verdict:** **PASS** — scoped independent Review and Verification report zero remaining blocker/high/medium findings.

## Final browser evidence

- Full P3 browser suite passed 5/5 before the last localized fixes.
- After the server-filter, Candidate-only disposition, and approved-unconsumed evidence fixes, the two affected final-build scenarios passed 2/2.
- The responsive/WCAG scenario verified safe-off, Capture lineage, Candidate-only Capability state, 390px semantic order, no visible control below 40 CSS pixels, no horizontal overflow, reduced motion, axe WCAG A/AA with zero violations, and keyboard navigation at 200% page zoom.
- The screenshot scenario asserted actual state before every capture. Approved-unconsumed specifically reloaded the approved record and required a visible `Revoke approval` button, exact `REVOKE CANDIDATE …` phrase, and `Rationale (required)` control.
- Independent scoped Verification reran the exact component contract (1 file / 8 tests) and visually inspected the 1440px and true 390px approved-unconsumed screenshots.

## Screenshot manifest

| State | Width | SHA-256 |
|---|---:|---|
| approved consumed | 1440 | `f9425537f0f3a70b2d7f46ef0c3e88672cd9b1c11cf75ebac505868734b82b5e` |
| approved consumed | 390 | `af0940d1cf9173894275e29cb6843a22f561e4dca3270d5ba56e5adffd7e74ce` |
| approved unconsumed | 1440 | `1edc9da757507fef38a46848bdcfab793f11273ef00d093083897a8c01a1d009` |
| approved unconsumed | 390 | `84f68b3b41d5244da4cd9551f48251da6f1df5f30715ada056f76ff3da464ef2` |
| Candidate-only Capability | 1440 | `bd43c070eb549ed514fb017ad8ea16e06d6805b483105e30695f22eb87d875e7` |
| Candidate-only Capability | 390 | `dcbc3075214d5c8b35085e71f6e3116432cb47649df100b26ac035099afc582a` |
| Capture lineage | 1440 | `196f92c2b2ec8153f6e58a1cf79e1950b48aaae10549cdba14ad1f7e2f613e5b` |
| Capture lineage | 390 | `1ea020ba5aa225fab0d42620db3de9c74097226458cfc36c3cba085e52aaaf3e` |
| revoked | 1440 | `53990101725d5058c1f794fc34fec1eccbbfffa42400ab51380a50570e78bb2e` |
| revoked | 390 | `f9eb81559db0bafa07b8be8a4869839b863ed7aab3d95f994a9e4e76f75f8be2` |
| same-request stale | 1440 | `d783b8c274406c1eb8ccf033bcc25f1337747fb59e6b8280116636f433999c52` |
| same-request stale | 390 | `918c2ff74c3d2a96f05df28b6ce89b2a39045785bc289417eca215b0f9817ae6` |
| superseded | 1440 | `0f125fc8b36f96dece39b9e4a5be142d262f9314c2814c027ee6a7aa07adf78f` |
| superseded | 390 | `1094485361488a414f02778d8402147a86a0895c0c3027640f65b920b98fa5f8` |
| waiting | 1440 | `6fe8b72ab405b32e62381b400fcc6725b6db5334ffbfbb371607ddccd87daf15` |
| waiting | 390 | `330ac1013cf5ab979255860833b02897cbc391fc1f2f6e3cd66b332af6d63101` |

## Safety boundary

The browser connected only to the isolated loopback fixture. Screens contain no database URL, credential, object key, host path, prompt, reasoning, or raw provider response. The UI exposes no Release, Build, install, publish, Git, shell, code-execution, or deploy action. No production configuration, process, database, provider, domain, or traffic was changed.

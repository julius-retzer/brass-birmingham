---
phase: 1
slug: game-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | ENGINE-01 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | ENGINE-02 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | ENGINE-03 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | ENGINE-04 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | ENGINE-05 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | ENGINE-06 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 1 | ENGINE-07 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 01-02-05 | 02 | 1 | ENGINE-08 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 01-02-06 | 02 | 1 | ENGINE-09 | unit | `pnpm test` | ❌ W0 | ⬜ pending |
| 01-02-07 | 02 | 1 | ENGINE-10 | integration | `pnpm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for all ENGINE requirements in gameStore tests
- [ ] Test fixtures for game state setup (2-player game scenarios)
- [ ] Reference game data for scoring verification

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

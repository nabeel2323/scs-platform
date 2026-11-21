# SCS Platform — Project Memory: Start Here

> **Mandatory entry point for every new ChatGPT conversation about this repository.**
>
> Last reconciled: 21 November 2026  
> Repository: [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
> Current work branch: `remediation/phase-0-1-tenant-security`

## Purpose

This directory preserves durable project context so work can resume across separate ChatGPT conversations without relying on chat-history recall. It records the verified checkpoint, decisions, constraints, remaining work and exact next actions.

**The repository is the source of truth.** Always verify live GitHub state before acting. A timestamped checkpoint is historical evidence, not a substitute for checking the current branch, PR, commit and CI run.

## Read in this order

1. [CURRENT-STATE.md](./CURRENT-STATE.md) — current branch, PR, exact commit, latest known CI and next action.
2. [DECISIONS-AND-CONSTRAINTS.md](./DECISIONS-AND-CONSTRAINTS.md) — binding user preferences, architecture decisions and safety restrictions.
3. [IMPLEMENTATION-ROADMAP.md](./IMPLEMENTATION-ROADMAP.md) — phases, gates, dependencies and acceptance direction.
4. [OPEN-ISSUES.md](./OPEN-ISSUES.md) — unresolved work and blockers.
5. [RELEASE-AND-CI-STATUS.md](./RELEASE-AND-CI-STATUS.md) — CI evidence, skipped jobs and release restrictions.
6. [WORK-LOG.md](./WORK-LOG.md) — chronological handover history.

Then read the relevant authoritative technical documents linked below. Do not duplicate or override their detailed evidence in this summary.

## Authoritative project documents

- [Audit-driven remediation implementation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) — authoritative phases, findings, acceptance criteria and release gates.
- [Audit-driven implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md) — authoritative finding register, current progress and evidence log.
- [Remediation documentation directory](../docs/remediation/) — detailed audits, database access evidence and finding-specific records.
- [Repository README](../README.md) — architecture, development setup and documentation index.
- [PR #138](https://github.com/nabeel2323/scs-platform/pull/138) — active draft remediation PR.

## Mandatory new-session procedure

At the start of a new conversation:

1. Confirm this is **SCS Platform** in `nabeel2323/scs-platform`; do not confuse it with Homely or another project.
2. Read this directory and the relevant authoritative remediation documents.
3. Query GitHub for the active branch head, PR #138 state/head/base, recent commits and the latest CI run/checks. Never rely only on the recorded SHA or CI status below.
4. Compare live state with `CURRENT-STATE.md`; reconcile any drift before implementation.
5. Identify the highest-priority unfinished task and its dependencies. Continue autonomously without asking for approval for every small implementation step.
6. Group related implementation, tests and documentation changes into cohesive commits where practical.
7. Do not claim implementation, tests, review, approval, deployment or database changes without direct evidence.

## Mandatory checkpoint update procedure

After each meaningful implementation group, and before ending a work session:

- Update [CURRENT-STATE.md](./CURRENT-STATE.md) with exact branch, commit, PR and verified CI state.
- Add a dated entry to [WORK-LOG.md](./WORK-LOG.md) with changes, tests, outcomes and links.
- Update [OPEN-ISSUES.md](./OPEN-ISSUES.md) and [IMPLEMENTATION-ROADMAP.md](./IMPLEMENTATION-ROADMAP.md) when status, dependencies or next actions change.
- Update [RELEASE-AND-CI-STATUS.md](./RELEASE-AND-CI-STATUS.md) with workflow number, run URL, exact SHA, job outcomes and skipped jobs.
- Record new binding decisions or approvals in [DECISIONS-AND-CONSTRAINTS.md](./DECISIONS-AND-CONSTRAINTS.md).
- Update the authoritative remediation plan/progress tracker alongside relevant code changes.
- Distinguish **implemented**, **automated-test verified**, **runtime verified**, **independently reviewed**, and **approved**. These are not interchangeable.

## User collaboration preferences

- The user expects ChatGPT to make repository changes directly, including commits and pushes when the GitHub connection permits; do not default to handing implementation to a coding agent.
- Proceed through logical implementation steps without asking for permission at every small step.
- Group related changes into fewer, cohesive commits where practical to reduce repeated validation overhead.
- Keep technical documentation synchronized with the actual implementation and verified behavior.
- Provide detailed, truthful status and exact evidence. Never report a skipped job as passed.
- A reviewer can be the user or a separately appointed qualified reviewer; the implementation author must not self-certify an independent security review.

## Current starting point

See [CURRENT-STATE.md](./CURRENT-STATE.md). At this checkpoint, PR #138 is open and draft; G-001 is PARTIAL; G-002 is IN PROGRESS; CI #1176 failed the changed-file Prettier gate and did not execute downstream API/integration/build jobs. The immediate task is to complete the grouped formatting and handover update, then obtain a fresh exact-head CI result.

## Safety reminder

The restrictions in [DECISIONS-AND-CONSTRAINTS.md](./DECISIONS-AND-CONSTRAINTS.md) are mandatory. In particular, do not merge/deploy PR #138, bypass protected staging approval, modify shared database grants/default ACLs, apply migration 0070, enable RLS, change production/staging configuration, or activate workers without the explicitly required authorization.

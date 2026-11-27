# CI #1142 Exact-Head Verification

Date: 21 November 2026

- Pull request: #138
- Verified source head: `c7165d891b87e008e9872e6aaefa299eaef9a61d`
- CI run: [#1142](https://github.com/nabeel2323/scs-platform/actions/runs/44832686714)
- Result: all 10 executable jobs passed.
- Skipped: k6 smoke test and staging release.

The run passed lint, typecheck, changed-file formatting, Flutter analysis/tests, Web/Admin tests, API unit/coverage, PostgreSQL integration, E6 boundary lint, full migration apply with the disposable read-only database audit, contract/codegen, container smoke and build.

This is CI evidence for the listed source head only. It is not staging or production verification and does not close the remaining security gates.

- G-001: PARTIAL — independent security review and complete role/tenant acceptance evidence remain required.
- G-002: BLOCKED — protected staging audit, actual API/migration runtime identities and reviewed least-privilege/RLS design remain required.
- PR #138 remains open and draft. No staging deployment, shared database mutation, migration, grant/default-ACL change or RLS enablement was performed.

## Documentation formatting follow-up

The implementation plan and progress tracker were normalized with the repository-locked Prettier 3.9.6 in formatter workflow [run #7](https://github.com/nabeel2323/scs-platform/actions/runs/44837991726). Both the write and check steps passed, and the temporary formatter workflow removed itself. The resulting branch head is `6fd811893c90ea1092a00ead6ac5acb4bba0f282`. A fresh full PR CI run on the resulting head is required; CI #1142 remains evidence for the earlier source/test head only.

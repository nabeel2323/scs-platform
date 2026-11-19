# Secret and Temporary Artifact Review — 19 November 2026

## Scope

Reviewed the tracked `.m73b6-scratch` tree and duplicate JWT-shaped test artifact as part of G-016/G-017. This review records findings without reproducing token contents, user identifiers, organization identifiers or credential values.

## Findings

- `.m73b6-scratch` contained 1,277 tracked files totaling approximately 37.9 MB.
- The tree included a 19.1 MB `p418-archive.tar`, a duplicated project context, CI parsing outputs, local audit diffs, smoke/watch scripts and a duplicate `test-token.txt`.
- The root `test-token.txt` and scratch-context copy were identical JWT-shaped artifacts. The token used HS256 and its `exp` claim was already in the past on 19-Nov-2026. Its payload contained account/organization identifiers and a merchant-owner role; these values are intentionally not reproduced.
- No signing secret, private key or environment file was embedded in the token file.
- A targeted scan of visible text artifacts found PostgreSQL URLs only for localhost or CI container hosts. No AWS access-key or GitHub personal-token pattern was found in the scanned artifacts.
- No current source/build/workflow reference to the scratch tree or root token filename was found.
- The GitHub connector could not independently extract the binary tar contents. The archive is a snapshot of the duplicated context tree; all of it has been removed from the current branch. This limitation is recorded rather than claiming a byte-for-byte archive scan.

## Actions

- Removed the complete `.m73b6-scratch/` tree and root `test-token.txt` from the current working tree.
- Added `.m73b6-scratch/` and `test-token.txt` to `.gitignore`.
- Did not rewrite Git history. The token is expired and no signing key/active credential was found; a JWT secret rotation is not supported by the available evidence.
- Historical Git objects still retain the removed artifacts. If future evidence establishes an active credential or a sensitive archive payload, perform a separate incident response and history-remediation decision.

## Status

G-016 and G-017 are closed for the current repository tree. Historical object retention and the binary archive inspection limitation are explicitly recorded.

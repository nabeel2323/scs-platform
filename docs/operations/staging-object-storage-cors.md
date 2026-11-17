# Staging object-storage CORS configuration

The merchant organization document upload flow uses a browser `PUT` to a presigned Backblaze B2 S3-compatible URL. The bucket CORS policy is configured in Backblaze, not in the Next.js or NestJS application. A browser preflight failure such as `No 'Access-Control-Allow-Origin' header` must be fixed on the bucket.

## Required staging rule

Configure the **scs-staging-uploads** bucket (Backblaze B2 Console → Buckets → scs-staging-uploads → CORS Rules) to allow:

- Allowed origin: `https://scs-platform-web.vercel.app`
- Allowed operations: `s3_put` (and `s3_head` / `s3_get` only if browser-side verification or downloads are used)
- Allowed headers: `*` (the AWS SDK presigned PUT may include content-type and checksum headers)
- Exposed headers: `ETag`
- Max age: `3600` seconds

If the Vercel preview deployments must upload documents, add their exact trusted origin(s) as separate origins. Do not use a wildcard origin for authenticated/private document uploads. Apply the equivalent rule to the production uploads bucket with the production web origin.

## Verify after applying

1. Reload the organization page and request a fresh presigned upload URL (the URL expires after 15 minutes).
2. In DevTools → Network, confirm the OPTIONS preflight response includes `Access-Control-Allow-Origin: https://scs-platform-web.vercel.app` and permits `PUT` plus the requested headers.
3. Confirm the subsequent PUT returns a successful 2xx response.
4. Confirm the application registers the uploaded document only after the PUT succeeds.

CORS is a bucket-level control-plane setting. This repository change documents the required rule but cannot apply it to the Backblaze account; an authorized bucket administrator must save it.

## Console warnings that are not application defects

- `chrome-extension://...` AdobeClean font warnings originate from the browser's Adobe extension, not SCS assets. Test in an Incognito window with extensions disabled to confirm.
- `A listener indicated an asynchronous response ... message channel closed` is typically emitted by an extension content-script message listener. The `taif-tech-store-...` document/frame label alone does not identify application code as the source. Re-test with extensions disabled; only investigate application listeners if it persists in a clean browser profile and a source-mapped stack points into SCS code.

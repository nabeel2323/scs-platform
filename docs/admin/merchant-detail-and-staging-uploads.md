# Merchant detail and staging upload troubleshooting

## Admin merchant detail API

The admin merchant detail screen calls:

`GET /v1/admin/merchants/:id`

The endpoint requires `admin:merchants:read`, validates the path as a UUID, returns the store projection with its related `orgName`, and returns 404 only when the store ID does not exist. It does not expose organization members or credentials.

## Merchant store route compatibility

The canonical merchant store profile route is `/merchant/store`. The legacy plural URL `/merchant/stores` redirects to the canonical route so stale bookmarks and navigation references do not produce a Next.js 404.

## Backblaze B2 browser-upload CORS

Direct browser uploads use presigned S3-compatible PUT URLs. CORS is enforced by Backblaze B2 before the browser sends the PUT; application code cannot add the missing CORS response header to a B2 preflight response.

In the Backblaze B2 bucket settings for the staging uploads bucket (`scs-staging-uploads`), add/update a CORS rule with:

- Allowed origin: `https://scs-platform-web.vercel.app`
- Allowed operations: `s3_put`, `s3_get`, `s3_head`
- Allowed headers: `*`
- Exposed headers: `ETag`, `x-amz-request-id`
- Max age: `3600` seconds

If a separate Vercel preview domain is used, add that exact origin as a separate allowed origin. Do not use a wildcard origin for authenticated presigned uploads unless the staging security policy explicitly allows it.

After saving the rule, retry a fresh upload so the browser obtains a new preflight response and a newly signed URL. The URL in the supplied console output was time-limited and should not be reused.

## Browser console messages

- Adobe Clean font fallback warnings referencing `chrome-extension://efaidnbmnnnibpcajpcglclefindmkaj` originate from the Adobe Acrobat browser extension, not the SCS web application. Disable/update that extension or test in a clean browser profile to remove them.
- `A listener indicated an asynchronous response ... message channel closed` is commonly emitted by browser extensions/content scripts. Check in an Incognito window with extensions disabled. If it persists with extensions disabled, capture the associated Initiator/source and network request so the application listener can be traced.

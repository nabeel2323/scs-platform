-- 0032_merchant_catalog_permissions.sql
-- Grant MERCHANT_OWNER and MERCHANT_STAFF the catalog:offers:write permission
-- so they can submit catalog requests (new categories, brands, attributes).
-- The seed script assigns this permission at role-creation time, but existing
-- deployments already have these roles without it. This migration patches the
-- gap idempotently.

-- catalog:offers:write — required for POST /v1/merchant/requests
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.key IN ('MERCHANT_OWNER', 'MERCHANT_STAFF')
  AND p.key = 'catalog:offers:write'
ON CONFLICT DO NOTHING;

-- catalog:requests:manage — allows merchants to view their own requests
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.key IN ('MERCHANT_OWNER', 'MERCHANT_STAFF')
  AND p.key = 'catalog:requests:manage'
ON CONFLICT DO NOTHING;

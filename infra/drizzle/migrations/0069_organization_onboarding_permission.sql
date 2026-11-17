-- 0069_organization_onboarding_permission.sql
--
-- Separate the ability to start organization onboarding from the ability to
-- administer an existing organization. Newly registered users receive BUYER
-- claims before they have an organization membership, so this permission is
-- required for the first POST /v1/organizations request.
--
-- Forward-only and idempotent. This does not grant organization update or
-- membership-management privileges to buyers.

INSERT INTO permissions (id, key)
VALUES (gen_random_uuid(), 'identity:organizations:create')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.key = 'BUYER'
  AND p.key = 'identity:organizations:create'
ON CONFLICT DO NOTHING;

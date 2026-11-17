-- 0069_organization_onboarding_permission.sql
--
-- Separate the ability to start organization onboarding from the ability to
-- administer an existing organization. Newly registered users receive BUYER
-- claims before they have an organization membership, so this permission is
-- required for the first POST /v1/organizations request.
--
-- Preserve create access for every existing role that already held the
-- organization-management permission, and add it to BUYER for onboarding.
-- Forward-only and idempotent.

INSERT INTO permissions (id, key)
VALUES (gen_random_uuid(), 'identity:organizations:create')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT r.id, create_permission.id
FROM roles r
CROSS JOIN permissions create_permission
LEFT JOIN permissions write_permission
  ON write_permission.key = 'identity:organizations:write'
LEFT JOIN role_permissions existing_write
  ON existing_write.role_id = r.id
 AND existing_write.permission_id = write_permission.id
WHERE create_permission.key = 'identity:organizations:create'
  AND (
    r.key = 'BUYER'
    OR existing_write.role_id IS NOT NULL
  )
ON CONFLICT DO NOTHING;

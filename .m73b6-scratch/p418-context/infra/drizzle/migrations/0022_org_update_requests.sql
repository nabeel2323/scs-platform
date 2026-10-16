-- 0022: Organization update requests — merchants propose changes to legal
-- business details; admins review and approve/reject them.

CREATE TABLE IF NOT EXISTS organization_update_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  decision_notes TEXT,
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_update_requests_org
  ON organization_update_requests (org_id);

CREATE INDEX IF NOT EXISTS idx_org_update_requests_status
  ON organization_update_requests (status);

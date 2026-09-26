import { Pool } from 'pg';
const p = new Pool({ connectionString: 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform' });
async function main() {
  // Find admin user and platform org
  const admin = await p.query("SELECT id FROM users WHERE email = 'admin@scsp.dev'");
  const platformOrg = await p.query("SELECT id FROM organizations WHERE type = 'PLATFORM' LIMIT 1");
  const superAdminRole = await p.query("SELECT id FROM roles WHERE key = 'SUPER_ADMIN' LIMIT 1");

  if (!admin.rows[0] || !platformOrg.rows[0] || !superAdminRole.rows[0]) {
    console.log('Missing: admin=', !!admin.rows[0], 'org=', !!platformOrg.rows[0], 'role=', !!superAdminRole.rows[0]);
    console.log('Need to re-run seed script');
    await p.end();
    return;
  }

  const adminId = admin.rows[0].id;
  const orgId = platformOrg.rows[0].id;
  const roleId = superAdminRole.rows[0].id;

  // Check if membership exists
  const existing = await p.query(
    'SELECT id FROM organization_members WHERE user_id = $1 AND org_id = $2',
    [adminId, orgId],
  );

  if (existing.rows.length === 0) {
    await p.query(
      'INSERT INTO organization_members (id, org_id, user_id, role_id, status) VALUES ($1, $2, $3, $4, $5)',
      [crypto.randomUUID(), orgId, adminId, roleId, 'ACTIVE'],
    );
    console.log(`Restored admin membership: user=${adminId.substring(0,8)} org=${orgId.substring(0,8)} role=SUPER_ADMIN`);
  } else {
    console.log('Admin membership already exists');
  }

  await p.end();
}
main().catch(e => { console.error(e); process.exit(1); });

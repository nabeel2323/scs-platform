import { Pool } from "pg";
import fs from "node:fs";

async function main() {
  const connectionString = process.env["DATABASE_URL"];
  const caFile = process.env["PGSSLROOTCERT"];

  if (!connectionString || !caFile) {
    throw new Error("DATABASE_URL or PGSSLROOTCERT is not set");
  }

  const pool = new Pool({
    connectionString,
    ssl: {
      ca: fs.readFileSync(caFile, "utf8"),
      rejectUnauthorized: true,
    },
  });

  try {
    const roles = await pool.query(`
      SELECT
        r.id,
        r.key,
        r.name,
        COUNT(rp.permission_id)::int AS permission_count
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.key IN ('MERCHANT_OWNER', 'MERCHANT_STAFF')
      GROUP BY r.id, r.key, r.name
      ORDER BY r.key;
    `);

    console.table(roles.rows);

    const permissions = await pool.query(`
      SELECT
        p.id,
        p.key
      FROM permissions p
      WHERE p.key = 'merchant:products:write';
    `);

    console.table(permissions.rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

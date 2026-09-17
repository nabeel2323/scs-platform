import { Pool } from "pg";
import fs from "node:fs";

async function main() {
  const connectionString = process.env["DATABASE_URL"];
  const caFile = process.env["PGSSLROOTCERT"];

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!caFile) {
    throw new Error("PGSSLROOTCERT is not set");
  }

  const pool = new Pool({
    connectionString,
    ssl: {
      ca: fs.readFileSync(caFile, "utf8"),
      rejectUnauthorized: true,
    },
  });

  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.phone,
        u.email,
        u.full_name,
        u.status,
        r.key AS role,
        o.name AS organization
      FROM users u
      LEFT JOIN organization_members om ON om.user_id = u.id
      LEFT JOIN roles r ON r.id = om.role_id
      LEFT JOIN organizations o ON o.id = om.org_id
      ORDER BY u.created_at;
    `);

    console.table(result.rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

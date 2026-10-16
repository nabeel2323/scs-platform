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
    const user = await pool.query(`
      SELECT id, phone, email, full_name, status
      FROM users
      WHERE phone = '+966500000010';
    `);

    console.log("TEST USER");
    console.table(user.rows);

    const role = await pool.query(`
      SELECT id, key, name
      FROM roles
      WHERE key = 'MERCHANT_OWNER';
    `);

    console.log("MERCHANT OWNER ROLE");
    console.table(role.rows);

    const org = await pool.query(`
      SELECT id, name, type, country, verification_status, invite_code
      FROM organizations
      WHERE name = 'TAIF B2 Test Merchant';
    `);

    console.log("TEST ORGANIZATION");
    console.table(org.rows);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

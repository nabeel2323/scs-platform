import { Pool } from "pg";
import fs from "node:fs";
import crypto from "node:crypto";

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

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Dedicated staging merchant owner.
    const userId = crypto.randomUUID();

    const userResult = await client.query(
      `
      INSERT INTO users (
        id,
        phone,
        full_name,
        locale,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, phone, full_name, status
      `,
      [
        userId,
        "+966500000010",
        "TAIF Staging Merchant Owner",
        "en",
        "ACTIVE",
      ],
    );

    // Dedicated staging merchant organization.
    const orgId = crypto.randomUUID();
    const inviteCode = crypto.randomBytes(6).toString("hex");

    const orgResult = await client.query(
      `
      INSERT INTO organizations (
        id,
        type,
        name,
        legal_name,
        country,
        verification_status,
        invite_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, type, name, country, verification_status, invite_code
      `,
      [
        orgId,
        "WHOLESALER",
        "TAIF B2 Test Merchant",
        "TAIF B2 Test Merchant",
        "SA",
        "PENDING",
        inviteCode,
      ],
    );

    // MERCHANT_OWNER role.
    const roleResult = await client.query(
      `
      SELECT id, key, name
      FROM roles
      WHERE key = 'MERCHANT_OWNER'
      LIMIT 1
      `,
    );

    if (roleResult.rowCount !== 1) {
      throw new Error("MERCHANT_OWNER role was not found");
    }

    const roleId = roleResult.rows[0].id;

    // Connect merchant owner to the organization.
    const membershipId = crypto.randomUUID();

    const membershipResult = await client.query(
      `
      INSERT INTO organization_members (
        id,
        org_id,
        user_id,
        role_id,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, org_id, user_id, role_id, status
      `,
      [
        membershipId,
        orgId,
        userId,
        roleId,
        "ACTIVE",
      ],
    );

    await client.query("COMMIT");

    console.log("\nSTAGING MERCHANT BOOTSTRAP COMPLETE\n");

    console.log("USER");
    console.table(userResult.rows);

    console.log("ORGANIZATION");
    console.table(orgResult.rows);

    console.log("ROLE");
    console.table(roleResult.rows);

    console.log("MEMBERSHIP");
    console.table(membershipResult.rows);

    console.log("\nPhone: +966500000010");
    console.log("Organization: TAIF B2 Test Merchant");
    console.log("Role: MERCHANT_OWNER");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nBOOTSTRAP FAILED");
  console.error(error);
  process.exit(1);
});

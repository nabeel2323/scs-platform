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

    // Find the existing staging merchant.
    const orgResult = await client.query(
      `
      SELECT id, name, type, country, verification_status
      FROM organizations
      WHERE name = 'TAIF B2 Test Merchant'
        AND type = 'WHOLESALER'
      LIMIT 1
      `,
    );

    if (orgResult.rowCount !== 1) {
      throw new Error(
        "TAIF B2 Test Merchant organization was not found",
      );
    }

    const org = orgResult.rows[0];

    // Resolve MERCHANT_STAFF role.
    const roleResult = await client.query(
      `
      SELECT id, key, name
      FROM roles
      WHERE key = 'MERCHANT_STAFF'
      LIMIT 1
      `,
    );

    if (roleResult.rowCount !== 1) {
      throw new Error(
        "MERCHANT_STAFF role was not found. Run RBAC bootstrap first.",
      );
    }

    const role = roleResult.rows[0];

    // Safety check.
    const existingUser = await client.query(
      `
      SELECT id, phone, full_name, status
      FROM users
      WHERE phone = '+966500000011'
      LIMIT 1
      `,
    );

    if (existingUser.rowCount && existingUser.rowCount > 0) {
      throw new Error(
        `Staff user +966500000011 already exists (${existingUser.rows[0].id}).`,
      );
    }

    // Create staff user.
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
      RETURNING id, phone, full_name, locale, status
      `,
      [
        userId,
        "+966500000011",
        "TAIF Staging Merchant Staff",
        "en",
        "ACTIVE",
      ],
    );

    // Create membership.
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
        org.id,
        userId,
        role.id,
        "ACTIVE",
      ],
    );

    // Verify permission count for this role.
    const permissionResult = await client.query(
      `
      SELECT COUNT(*)::int AS permission_count
      FROM role_permissions
      WHERE role_id = $1
      `,
      [role.id],
    );

    if (permissionResult.rows[0].permission_count !== 15) {
      throw new Error(
        `MERCHANT_STAFF has ${permissionResult.rows[0].permission_count} permissions; expected 15.`,
      );
    }

    await client.query("COMMIT");

    console.log("\nSTAGING MERCHANT STAFF BOOTSTRAP COMPLETE\n");

    console.log("USER");
    console.table(userResult.rows);

    console.log("ORGANIZATION");
    console.table([org]);

    console.log("ROLE");
    console.table([role]);

    console.log("MEMBERSHIP");
    console.table(membershipResult.rows);

    console.log(
      `\nPhone: +966500000011`,
    );
    console.log(
      `Organization: ${org.name}`,
    );
    console.log(
      `Role: ${role.key}`,
    );
    console.log(
      `Permissions: ${permissionResult.rows[0].permission_count}`,
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failure.
    }

    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nSTAGING STAFF BOOTSTRAP FAILED");
  console.error(error);
  process.exit(1);
});
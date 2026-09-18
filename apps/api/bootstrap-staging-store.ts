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

    /*
     * Resolve the existing staging merchant organization.
     */
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

    /*
     * Safety check: do not create a second store.
     */
    const existingStore = await client.query(
      `
      SELECT
        id,
        org_id,
        slug,
        display_name,
        currency,
        timezone,
        locale,
        status,
        verification_status
      FROM stores
      WHERE slug = 'taif-b2-test-store'
      LIMIT 1
      `,
    );

    if (existingStore.rowCount && existingStore.rowCount > 0) {
      throw new Error(
        `Store taif-b2-test-store already exists (${existingStore.rows[0].id}).`,
      );
    }

    /*
     * Create the dedicated staging store.
     */
    const storeId = crypto.randomUUID();

    const storeResult = await client.query(
      `
      INSERT INTO stores (
        id,
        org_id,
        slug,
        display_name,
        description,
        currency,
        timezone,
        locale,
        status,
        verification_status,
        address,
        metadata
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11::jsonb,
        $12::jsonb
      )
      RETURNING
        id,
        org_id,
        slug,
        display_name,
        description,
        currency,
        timezone,
        locale,
        status,
        verification_status,
        address,
        metadata
      `,
      [
        storeId,
        org.id,
        "taif-b2-test-store",
        "TAIF B2 Test Store",
        "Dedicated staging store for TAIF B2 commerce testing",
        "SAR",
        "Asia/Riyadh",
        "ar",
        "DRAFT",
        "PENDING",
        JSON.stringify({}),
        JSON.stringify({
          environment: "staging",
          purpose: "b2-commerce-testing",
        }),
      ],
    );

    await client.query("COMMIT");

    console.log("\nSTAGING STORE BOOTSTRAP COMPLETE\n");

    console.log("ORGANIZATION");
    console.table([org]);

    console.log("STORE");
    console.table(storeResult.rows);

    console.log("\nSlug: taif-b2-test-store");
    console.log("Display name: TAIF B2 Test Store");
    console.log("Currency: SAR");
    console.log("Timezone: Asia/Riyadh");
    console.log("Locale: ar");
    console.log("Status: DRAFT");
    console.log("Verification: PENDING");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nSTAGING STORE BOOTSTRAP FAILED");
  console.error(error);
  process.exit(1);
});
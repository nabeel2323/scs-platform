import { Pool } from "pg";
import fs from "node:fs";
import crypto from "node:crypto";

const PERMISSIONS = [
  "identity:users:read",
  "identity:users:write",
  "identity:users:delete",
  "identity:roles:read",
  "identity:roles:write",

  "merchant:stores:read",
  "merchant:stores:write",
  "merchant:stores:verify",
  "merchant:stores:reject",
  "merchant:verification:review",
  "merchant:products:write",
  "merchant:orders:write",
  "merchant:promotions:write",

  "merchant:inventory:read",
  "merchant:inventory:write",
  "merchant:pricing:read",
  "merchant:pricing:write",

  "catalog:products:read",
  "catalog:products:write",
  "catalog:products:delete",
  "catalog:categories:read",
  "catalog:categories:write",
  "catalog:brands:manage",

  "orders:read",
  "orders:write",
  "orders:cancel",
  "orders:refund",

  "payments:read",
  "payments:refund",

  "analytics:read",
  "audit:read",

  "support:tickets:read",
  "support:tickets:write",
  "support:tickets:escalate",
  "support:disputes:resolve",
  "support:disputes:write",

  "identity:organizations:write",

  "ads:campaigns:read",
  "ads:campaigns:write",
  "ads:campaigns:approve",

  "admin:orders:read",
  "admin:merchants:read",
  "admin:kpis:read",
  "admin:audit:read",
  "admin:users:read",
  "admin:users:write",
];

const ROLES: {
  key: string;
  name: string;
  permissions: string[];
}[] = [
  {
    key: "SUPER_ADMIN",
    name: "Super Admin",
    permissions: PERMISSIONS,
  },
  {
    key: "ADMIN",
    name: "Platform Admin",
    permissions: [
      "identity:users:read",
      "identity:roles:read",
      "merchant:stores:read",
      "merchant:stores:write",
      "merchant:stores:verify",
      "merchant:stores:reject",
      "merchant:verification:review",
      "catalog:products:read",
      "orders:read",
      "orders:cancel",
      "orders:refund",
      "payments:read",
      "payments:refund",
      "analytics:read",
      "audit:read",
      "support:tickets:read",
      "support:tickets:write",
      "support:tickets:escalate",
      "support:disputes:resolve",
      "support:disputes:write",
      "merchant:inventory:read",
      "merchant:inventory:write",
      "merchant:pricing:read",
      "merchant:pricing:write",
      "identity:organizations:write",
      "admin:orders:read",
      "admin:merchants:read",
      "admin:kpis:read",
      "admin:audit:read",
      "admin:users:read",
      "admin:users:write",
    ],
  },
  {
    key: "MODERATOR",
    name: "Moderator",
    permissions: [
      "catalog:products:read",
      "catalog:products:write",
      "catalog:products:delete",
      "catalog:categories:read",
      "catalog:categories:write",
      "merchant:products:write",
      "support:tickets:read",
      "support:tickets:write",
      "support:tickets:escalate",
      "orders:read",
      "merchant:verification:review",
      "merchant:inventory:read",
      "merchant:pricing:read",
      "support:disputes:write",
    ],
  },
  {
    key: "MERCHANT_OWNER",
    name: "Merchant Owner",
    permissions: [
      "catalog:products:read",
      "catalog:products:write",
      "catalog:products:delete",
      "catalog:categories:read",
      "catalog:categories:write",
      "orders:read",
      "orders:write",
      "merchant:stores:read",
      "merchant:stores:write",
      "merchant:products:write",
      "merchant:orders:write",
      "merchant:promotions:write",
      "merchant:inventory:read",
      "merchant:inventory:write",
      "merchant:pricing:read",
      "merchant:pricing:write",
      "identity:organizations:write",
    ],
  },
  {
    key: "MERCHANT_STAFF",
    name: "Merchant Staff",
    permissions: [
      "catalog:products:read",
      "catalog:products:write",
      "catalog:categories:read",
      "catalog:categories:write",
      "orders:read",
      "orders:write",
      "merchant:products:write",
      "merchant:orders:write",
      "merchant:promotions:write",
      "merchant:inventory:read",
      "merchant:inventory:write",
      "merchant:pricing:read",
      "merchant:pricing:write",
    ],
  },
  {
    key: "BUYER",
    name: "Buyer",
    permissions: [
      "catalog:products:read",
      "orders:read",
      "orders:write",
      "orders:cancel",
      "merchant:stores:read",
    ],
  },
];

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

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("Creating permissions...");

    for (const key of PERMISSIONS) {
      await client.query(
        `
        INSERT INTO permissions (id, key)
        VALUES ($1, $2)
        ON CONFLICT (key) DO NOTHING
        `,
        [crypto.randomUUID(), key],
      );
    }

    console.log("Creating roles and role permissions...");

    for (const role of ROLES) {
      await client.query(
        `
        INSERT INTO roles (id, key, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO NOTHING
        `,
        [crypto.randomUUID(), role.key, role.name],
      );

      const roleResult = await client.query(
        `SELECT id FROM roles WHERE key = $1`,
        [role.key],
      );

      const roleId = roleResult.rows[0].id;

      for (const permissionKey of role.permissions) {
        const permissionResult = await client.query(
          `SELECT id FROM permissions WHERE key = $1`,
          [permissionKey],
        );

        if (permissionResult.rows.length === 0) {
          throw new Error(
            `Missing permission: ${permissionKey}`,
          );
        }

        await client.query(
          `
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
          `,
          [roleId, permissionResult.rows[0].id],
        );
      }
    }

    await client.query("COMMIT");

    console.log("");
    console.log("Staging RBAC bootstrap complete.");
    console.log(`Permissions: ${PERMISSIONS.length}`);
    console.log(`Roles: ${ROLES.length}`);

    const verification = await pool.query(`
      SELECT
        r.key AS role,
        COUNT(rp.permission_id)::int AS permissions
      FROM roles r
      LEFT JOIN role_permissions rp
        ON rp.role_id = r.id
      WHERE r.key IN (
        'SUPER_ADMIN',
        'ADMIN',
        'MODERATOR',
        'MERCHANT_OWNER',
        'MERCHANT_STAFF',
        'BUYER'
      )
      GROUP BY r.key
      ORDER BY r.key;
    `);

    console.table(verification.rows);

    const merchantPermission = await pool.query(`
      SELECT id, key
      FROM permissions
      WHERE key = 'merchant:products:write';
    `);

    console.table(merchantPermission.rows);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("RBAC bootstrap failed:", error);
  process.exit(1);
});

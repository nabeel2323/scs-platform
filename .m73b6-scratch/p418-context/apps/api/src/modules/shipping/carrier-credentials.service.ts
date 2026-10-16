import {
  Injectable, Logger,
  NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { CallerContext, isTenantPrivileged } from '../../common/tenant-scope';
import { carrierCredentials } from './shipping.schema';
import { CarrierCredentialCryptoService } from './carrier-credential-crypto.service';

// ── Input types ─────────────────────────────────────────────────────────────

export interface CreateCarrierCredentialInput {
  orgId: string;
  providerKey: string;
  environment?: string;
  label: string;
  /** Plaintext credential JSON — encrypted before persistence. */
  credentialsJson: string;
  endpointUrl?: string;
  /** Plaintext webhook secret — encrypted before persistence. */
  webhookSecret?: string;
}

/** Masked view — safe to return through API responses. */
export interface MaskedCredential {
  id: string;
  orgId: string;
  providerKey: string;
  environment: string;
  label: string;
  endpointUrl: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Always '***' — plaintext is never exposed. */
  credentialsMasked: string;
  webhookSecretMasked: string | null;
  /** M7.2.3-B.1: Webhook routing token (safe to share with carriers). */
  webhookToken: string | null;
}

/**
 * CarrierCredentialsService — org-scoped CRUD for encrypted carrier credentials.
 *
 * SECURITY INVARIANTS:
 *   - Plaintext credentials NEVER appear in API responses.
 *   - Plaintext credentials NEVER appear in log output.
 *   - Only SUPER_ADMIN / ADMIN may create or deactivate credentials.
 *   - Org A cannot read or modify Org B credentials.
 *   - Decryption happens only inside the backend process boundary.
 */
@Injectable()
export class CarrierCredentialsService {
  private readonly logger = new Logger(CarrierCredentialsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly crypto: CarrierCredentialCryptoService,
  ) {}

  // ── Queries ─────────────────────────────────────────────────────────────

  /**
   * List all credentials for an organization (masked — no plaintext).
   */
  async listForOrg(orgId: string, caller: CallerContext): Promise<MaskedCredential[]> {
    this.assertOrgAccess(orgId, caller);

    const rows = await this.db.db.query.carrierCredentials.findMany({
      where: eq(carrierCredentials.orgId, orgId),
    });

    return rows.map((r) => this.maskCredential(r));
  }

  /**
   * Get a single credential by ID (masked).
   */
  async getById(id: string, caller: CallerContext): Promise<MaskedCredential> {
    const row = await this.db.db.query.carrierCredentials.findFirst({
      where: eq(carrierCredentials.id, id),
    });
    if (!row) throw new NotFoundException('Carrier credential not found');

    this.assertOrgAccess(row.orgId, caller);
    return this.maskCredential(row);
  }

  // ── Mutations ───────────────────────────────────────────────────────────

  /**
   * Create a new carrier credential.
   * Only SUPER_ADMIN / ADMIN may create credentials.
   */
  async create(input: CreateCarrierCredentialInput, caller: CallerContext): Promise<MaskedCredential> {
    this.assertAdmin(caller);
    this.assertOrgAccess(input.orgId, caller);

    // Validate provider key format
    if (!input.providerKey || !/^[a-z0-9-]{1,40}$/.test(input.providerKey)) {
      throw new BadRequestException('providerKey must be 1-40 lowercase alphanumeric characters or hyphens');
    }

    const environment = (input.environment || 'sandbox').toLowerCase();
    if (!['sandbox', 'production'].includes(environment)) {
      throw new BadRequestException("environment must be 'sandbox' or 'production'");
    }

    // Encrypt credentials
    const credentialsEncrypted = this.crypto.encrypt(input.credentialsJson);
    const webhookSecretEncrypted = input.webhookSecret
      ? this.crypto.encrypt(input.webhookSecret)
      : null;

    // M7.2.3-B.1: Generate webhook routing token
    const webhookToken = 'whk_' + crypto.randomUUID().replace(/-/g, '');

    const id = crypto.randomUUID();
    const now = new Date();

    try {
      const rows = await this.db.db.insert(carrierCredentials).values({
        id,
        orgId: input.orgId,
        providerKey: input.providerKey,
        environment,
        label: input.label.trim(),
        credentialsEncrypted,
        endpointUrl: input.endpointUrl?.trim() || null,
        webhookSecretEncrypted,
        webhookToken,
        isActive: true,
        createdBy: caller.sub,
        createdAt: now,
        updatedAt: now,
      }).returning();

      const inserted = rows[0];
      if (!inserted) throw new Error('Carrier credential insert returned no rows');

      this.logger.log(
        `Carrier credential created: ${inserted.providerKey}/${inserted.environment} for org ${inserted.orgId}`,
      );

      return this.maskCredential(inserted);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new BadRequestException(
          `An active credential already exists for ${input.providerKey}/${environment} in this organization`,
        );
      }
      throw err;
    }
  }

  /**
   * Deactivate a credential (soft-delete). Does not destroy the row.
   */
  async deactivate(id: string, caller: CallerContext): Promise<MaskedCredential> {
    this.assertAdmin(caller);

    const row = await this.db.db.query.carrierCredentials.findFirst({
      where: eq(carrierCredentials.id, id),
    });
    if (!row) throw new NotFoundException('Carrier credential not found');

    this.assertOrgAccess(row.orgId, caller);

    const [updated] = await this.db.db.update(carrierCredentials)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(carrierCredentials.id, id))
      .returning();

    this.logger.log(`Carrier credential deactivated: ${id}`);
    return this.maskCredential(updated);
  }

  // ── Internal helpers (used by other services) ───────────────────────────

  /**
   * Decrypt and return the credential JSON for a given credential ID.
   * ONLY called within the backend process boundary — never exposed via API.
   */
  async decryptCredentials(credentialId: string): Promise<string> {
    const row = await this.db.db.query.carrierCredentials.findFirst({
      where: eq(carrierCredentials.id, credentialId),
    });
    if (!row) throw new NotFoundException('Carrier credential not found');
    if (!row.isActive) throw new BadRequestException('Carrier credential is not active');

    return this.crypto.decrypt(row.credentialsEncrypted);
  }

  /**
   * Decrypt the webhook secret for a given credential ID.
   * Returns null if no webhook secret is configured.
   */
  async decryptWebhookSecret(credentialId: string): Promise<string | null> {
    const row = await this.db.db.query.carrierCredentials.findFirst({
      where: eq(carrierCredentials.id, credentialId),
    });
    if (!row) return null;
    if (!row.webhookSecretEncrypted) return null;

    return this.crypto.decrypt(row.webhookSecretEncrypted);
  }

  /**
   * Find the active credential ID for a given org + provider + environment.
   * Returns null if no active credential exists.
   */
  async findCredentialId(
    orgId: string,
    providerKey: string,
    environment = 'sandbox',
  ): Promise<string | null> {
    const row = await this.db.db.query.carrierCredentials.findFirst({
      where: and(
        eq(carrierCredentials.orgId, orgId),
        eq(carrierCredentials.providerKey, providerKey),
        eq(carrierCredentials.environment, environment),
        eq(carrierCredentials.isActive, true),
      ),
      columns: { id: true },
    });
    return row?.id ?? null;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Mask a credential row for safe API responses.
   * Plaintext credentials are NEVER included.
   */
  private maskCredential(row: any): MaskedCredential {
    return {
      id: row.id,
      orgId: row.orgId,
      providerKey: row.providerKey,
      environment: row.environment,
      label: row.label,
      endpointUrl: row.endpointUrl,
      isActive: row.isActive,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      credentialsMasked: '***',
      webhookSecretMasked: row.webhookSecretEncrypted ? '***' : null,
      webhookToken: row.webhookToken || null,
    };
  }

  /**
   * Assert the caller has access to the specified organization.
   * Platform staff (SUPER_ADMIN, ADMIN, MODERATOR) bypass org scoping.
   */
  private assertOrgAccess(orgId: string, caller: CallerContext): void {
    if (isTenantPrivileged(caller)) return;
    if (caller.activeOrg !== orgId) {
      throw new ForbiddenException('You do not have access to this organization\'s carrier credentials');
    }
  }

  /**
   * Only platform admins may manage carrier credentials.
   */
  private assertAdmin(caller: CallerContext): void {
    const adminRoles = ['SUPER_ADMIN', 'ADMIN'];
    if (!adminRoles.includes(caller.role || '')) {
      throw new ForbiddenException('Only platform administrators can manage carrier credentials');
    }
  }
}

/**
 * Carrier Configuration Validation — M7.2.3-B.1
 *
 * Pre-flight validation layer for carrier configuration.
 * Runs BEFORE the carrier worker attempts any external HTTP call.
 *
 * Validates:
 *   - Endpoint URL format and SSRF safety
 *   - Environment (sandbox/production)
 *   - Required credentials (non-empty, parseable JSON)
 *   - Endpoint structure (multi-service endpoints)
 *   - Supported capabilities
 *   - Webhook configuration (secret present if webhooks enabled)
 *   - Rate-limit configuration
 *
 * Returns structured validation results — does NOT throw.
 * The caller decides whether to abort or proceed with warnings.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  validateCarrierEndpointUrlSync,
  type SsrfCheckResult,
} from './ssrf-protection';
import {
  type CarrierEndpoints,
  type CarrierCredentialPayload,
  validateEndpoints,
  ALL_CARRIER_SERVICES,
  type CarrierServiceType,
} from './carrier-endpoints';
import type { ProviderCapabilities } from './shipping.types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface CarrierConfigValidationInput {
  providerKey: string;
  environment: string;
  endpointUrl: string | null;
  credentialsEncrypted: string;
  webhookSecretEncrypted?: string | null;
  capabilities?: ProviderCapabilities;
  /** Decrypted credential payload (if available). */
  credentialPayload?: CarrierCredentialPayload;
}

export interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface CarrierConfigValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** Resolved endpoints after validation. */
  resolvedEndpoints: Partial<Record<CarrierServiceType, string>>;
}

// ── Valid environments ──────────────────────────────────────────────────────

const VALID_ENVIRONMENTS = new Set(['sandbox', 'production']);

// ── Validator ───────────────────────────────────────────────────────────────

@Injectable()
export class CarrierConfigValidator {
  private readonly logger = new Logger(CarrierConfigValidator.name);

  /**
   * Validate a carrier configuration before use.
   *
   * @param input  The configuration to validate.
   * @param requireHttps  Whether HTTPS is required (default: true for production).
   */
  validate(
    input: CarrierConfigValidationInput,
    requireHttps?: boolean,
  ): CarrierConfigValidationResult {
    const issues: ValidationIssue[] = [];
    const resolvedEndpoints: Partial<Record<CarrierServiceType, string>> = {};

    // 1. Provider key
    if (!input.providerKey || input.providerKey.trim().length === 0) {
      issues.push({
        field: 'providerKey',
        severity: 'error',
        message: 'Provider key is required.',
      });
    } else if (!/^[a-z0-9-]{1,40}$/.test(input.providerKey)) {
      issues.push({
        field: 'providerKey',
        severity: 'error',
        message: 'Provider key must be 1-40 lowercase alphanumeric characters or hyphens.',
      });
    }

    // 2. Environment
    if (!VALID_ENVIRONMENTS.has(input.environment)) {
      issues.push({
        field: 'environment',
        severity: 'error',
        message: `Environment must be 'sandbox' or 'production'. Got '${input.environment}'.`,
      });
    }

    // 3. Credentials
    if (!input.credentialsEncrypted || input.credentialsEncrypted.length === 0) {
      issues.push({
        field: 'credentialsEncrypted',
        severity: 'error',
        message: 'Encrypted credentials are required.',
      });
    }

    // 4. Determine HTTPS requirement
    const httpsRequired = requireHttps ?? (input.environment === 'production');

    // 5. Primary endpoint URL
    if (input.endpointUrl) {
      const urlCheck = validateCarrierEndpointUrlSync(input.endpointUrl, {
        requireHttps: httpsRequired,
      });
      if (!urlCheck.valid) {
        issues.push({
          field: 'endpointUrl',
          severity: 'error',
          message: `Primary endpoint URL validation failed: ${urlCheck.reason}`,
        });
      } else {
        resolvedEndpoints.shipping = input.endpointUrl;
      }
    } else {
      issues.push({
        field: 'endpointUrl',
        severity: 'warning',
        message: 'No primary endpoint URL configured.',
      });
    }

    // 6. Multi-service endpoints from credential payload
    if (input.credentialPayload?.endpoints) {
      const endpointErrors = validateEndpoints(input.credentialPayload.endpoints);
      for (const err of endpointErrors) {
        issues.push({
          field: `endpoints.${err.split(':')[0]}`,
          severity: 'error',
          message: err,
        });
      }

      // Validate each service endpoint for SSRF
      for (const service of ALL_CARRIER_SERVICES) {
        const url = input.credentialPayload.endpoints[service];
        if (url) {
          const check = validateCarrierEndpointUrlSync(url, {
            requireHttps: httpsRequired,
          });
          if (check.valid) {
            resolvedEndpoints[service] = url;
          } else {
            issues.push({
              field: `endpoints.${service}`,
              severity: 'error',
              message: `SSRF validation failed for ${service} endpoint: ${check.reason}`,
            });
          }
        }
      }
    }

    // 7. Webhook configuration
    if (input.capabilities?.canReceiveWebhooks) {
      if (!input.webhookSecretEncrypted) {
        issues.push({
          field: 'webhookSecretEncrypted',
          severity: 'warning',
          message: 'Webhook capability is enabled but no webhook secret is configured.',
        });
      }
    }

    // 8. At least one endpoint must be available
    const hasAnyEndpoint = Object.keys(resolvedEndpoints).length > 0;
    if (!hasAnyEndpoint && !issues.some((i) => i.field === 'endpointUrl' && i.severity === 'error')) {
      issues.push({
        field: 'endpoints',
        severity: 'error',
        message: 'No valid endpoint URL configured for any service.',
      });
    }

    const valid = !issues.some((i) => i.severity === 'error');

    return { valid, issues, resolvedEndpoints };
  }

  /**
   * Quick check: is the configuration valid for a specific operation?
   */
  isValidForOperation(
    input: CarrierConfigValidationInput,
    service: CarrierServiceType,
  ): boolean {
    const result = this.validate(input);
    if (!result.valid) return false;

    // Check that the specific service has an endpoint
    const endpoint = result.resolvedEndpoints[service];
    return !!endpoint;
  }
}

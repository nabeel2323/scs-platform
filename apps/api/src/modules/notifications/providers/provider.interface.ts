/**
 * Notification provider interfaces and types.
 *
 * This module defines the abstraction layer for OTP delivery providers (SMS,
 * WhatsApp, and email). Each provider implements the NotificationProvider
 * interface and handles delivery failures gracefully without exposing
 * sensitive data in logs.
 *
 * Channel types:
 * - `OtpDeliveryChannel` — public channels exposed in API DTOs (sms, whatsapp, email).
 * - `InternalDeliveryChannel` — extends public channels with 'mock' for test isolation.
 *   The mock channel is NEVER exposed through public DTOs or API responses.
 */

/**
 * Public delivery channels selectable via API request parameters.
 * 'mock' is deliberately excluded — see InternalDeliveryChannel below.
 */
export type OtpDeliveryChannel = 'sms' | 'whatsapp' | 'email';

/**
 * Internal channel type that includes the mock provider for automated tests
 * and controlled non-production development. Must NEVER appear in public DTOs.
 */
export type InternalDeliveryChannel = OtpDeliveryChannel | 'mock';

/**
 * The type of subject receiving an OTP challenge.
 */
export type ChallengeSubjectType = 'phone' | 'email';

/**
 * Result of an OTP delivery attempt.
 */
export interface OtpDeliveryResult {
  /** Whether the delivery was successfully accepted by the provider. */
  success: boolean;
  /** Human-readable status description for logging (no PII/secrets). */
  status: string;
  /** Provider-specific message ID for tracking (if available). */
  messageId?: string;
  /** Error reason if delivery failed. */
  errorReason?: string;
  /** Whether the failure is retryable (transient error vs permanent rejection). */
  retryable?: boolean;
  /**
   * Delivery outcome classification:
   * - 'accepted': Provider confirmed acceptance of the message.
   *   NOTE: For email, 'accepted' means the SMTP server accepted the message.
   *   It does NOT confirm the recipient's mailbox received it.
   * - 'rejected': Provider definitively rejected the message.
   * - 'unknown': Timeout or connection interruption — message may have been delivered.
   */
  deliveryOutcome: 'accepted' | 'rejected' | 'unknown';
}

/**
 * Generalized parameters for delivering an OTP challenge via any provider.
 *
 * Phone-based providers read `phone`; email-based providers read `email`.
 * The `subject` and `subjectType` fields provide a uniform way to identify
 * the recipient regardless of channel.
 */
export interface ChallengeDeliveryRequest {
  /** The OTP code to deliver (6 digits). */
  otp: string;
  /** Requested delivery channel. */
  channel: InternalDeliveryChannel;
  /** Optional correlation ID for tracking across logs (no PII). */
  correlationId?: string;
  /** Normalized recipient phone number in E.164 format (phone channels). */
  phone?: string;
  /** Normalized recipient email address (email channel). */
  email?: string;
  /** Masked subject identifier for logging (e.g. '***0000' or 'a****@example.com'). Optional — providers derive defaults. */
  subject?: string;
  /** Whether this challenge is addressed to a phone or email. Optional — providers infer from context. */
  subjectType?: ChallengeSubjectType;
}

/**
 * @deprecated Use ChallengeDeliveryRequest. Retained for backward compatibility
 * with existing phone-only provider implementations.
 */
export interface OtpDeliveryRequest {
  /** Destination phone number in E.164 format (e.g., +966500000000). */
  phone: string;
  /** The OTP code to deliver (6 digits). */
  otp: string;
  /** Requested delivery channel. */
  channel: OtpDeliveryChannel;
  /** Optional correlation ID for tracking across logs (no PII). */
  correlationId?: string;
}

/**
 * Configuration for a notification provider.
 */
export interface ProviderConfig {
  /** Whether the provider is enabled and configured. */
  enabled: boolean;
  /** Provider-specific configuration (credentials, endpoints, etc.). */
  config: Record<string, string | undefined>;
}

/**
 * Interface that all OTP delivery providers must implement.
 */
export interface NotificationProvider {
  /** Provider name for logging and configuration. */
  readonly name: string;

  /** Supported delivery channel. */
  readonly channel: InternalDeliveryChannel;

  /**
   * Deliver an OTP challenge to the recipient.
   *
   * Security requirements:
   * - Never log the OTP value or full phone/email address.
   * - Never expose provider credentials or raw API responses in logs.
   * - Return explicit failure if the provider is not configured.
   * - Handle transient errors and provider outages gracefully.
   *
   * @param request - The generalized challenge delivery request.
   * @returns The delivery result.
   */
  sendOtp(request: ChallengeDeliveryRequest): Promise<OtpDeliveryResult>;

  /**
   * Check if the provider is properly configured and ready to send.
   *
   * @returns Whether the provider can attempt delivery.
   */
  isConfigured(): boolean;
}

/**
 * Error thrown when a provider encounters a permanent failure.
 */
export class ProviderPermanentError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = 'ProviderPermanentError';
  }
}

/**
 * Error thrown when a provider encounters a transient failure.
 */
export class ProviderTransientError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly reason: string,
    public readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = 'ProviderTransientError';
  }
}

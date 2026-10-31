/**
 * Notification provider interfaces and types.
 *
 * This module defines the abstraction layer for OTP delivery providers (SMS and WhatsApp).
 * Each provider must implement the NotificationProvider interface and handle
 * delivery failures gracefully without exposing sensitive data in logs.
 */

/**
 * Supported delivery channels for OTP authentication.
 */
export type OtpDeliveryChannel = 'sms' | 'whatsapp';

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
   * - 'rejected': Provider definitively rejected the message.
   * - 'unknown': Timeout or connection interruption — message may have been delivered.
   */
  deliveryOutcome: 'accepted' | 'rejected' | 'unknown';
}

/**
 * Parameters for sending an OTP via a notification provider.
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
  readonly channel: OtpDeliveryChannel;

  /**
   * Send an OTP to the specified phone number.
   *
   * Security requirements:
   * - Never log the OTP value or full phone number.
   * - Never expose provider credentials or raw API responses in logs.
   * - Return explicit failure if the provider is not configured.
   * - Handle transient errors and provider outages gracefully.
   *
   * @param request - The OTP delivery request.
   * @returns The delivery result.
   */
  sendOtp(request: OtpDeliveryRequest): Promise<OtpDeliveryResult>;

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

/**
 * Aramex ClientInfo Builder — M7.2.3-B.2
 *
 * Builds the Aramex ClientInfo authentication block from a decrypted
 * credential payload.
 *
 * SECURITY:
 *   - NEVER logs the returned ClientInfo object.
 *   - NEVER includes ClientInfo in error messages.
 *   - NEVER persists ClientInfo outside the encrypted credential store.
 *   - The returned object is ephemeral — used for a single API call.
 */

import {
  ARAMEX_DEFAULT_VERSION,
  ARAMEX_DEFAULT_SOURCE,
} from './aramex.constants';
import type { AramexClientInfo, AramexCredentialPayload } from './aramex.types';

/**
 * Build an Aramex ClientInfo block from a decrypted credential payload.
 *
 * @param payload  Decrypted credential JSON (AramexCredentialPayload).
 * @returns AramexClientInfo ready for inclusion in an API request.
 *
 * @throws Error if required credential fields are missing.
 *         The error message does NOT include credential values.
 */
export function buildClientInfo(payload: AramexCredentialPayload): AramexClientInfo {
  // Validate required fields — error messages never include actual values
  if (!payload.userName || typeof payload.userName !== 'string') {
    throw new Error('Aramex credential missing required field: userName');
  }
  if (!payload.password || typeof payload.password !== 'string') {
    throw new Error('Aramex credential missing required field: password');
  }
  if (!payload.accountNumber || typeof payload.accountNumber !== 'string') {
    throw new Error('Aramex credential missing required field: accountNumber');
  }
  if (!payload.accountPin || typeof payload.accountPin !== 'string') {
    throw new Error('Aramex credential missing required field: accountPin');
  }
  if (!payload.accountEntity || typeof payload.accountEntity !== 'string') {
    throw new Error('Aramex credential missing required field: accountEntity');
  }
  if (!payload.accountCountryCode || typeof payload.accountCountryCode !== 'string') {
    throw new Error('Aramex credential missing required field: accountCountryCode');
  }

  return {
    UserName: payload.userName,
    Password: payload.password,
    Version: payload.version || ARAMEX_DEFAULT_VERSION,
    AccountNumber: payload.accountNumber,
    AccountPin: payload.accountPin,
    AccountEntity: payload.accountEntity,
    AccountCountryCode: payload.accountCountryCode,
    Source: payload.source ?? ARAMEX_DEFAULT_SOURCE,
  };
}

/**
 * Device ID generation and management for web app.
 * Generates a persistent device identifier stored in localStorage.
 * Used for device trust logic in dual authentication.
 */

const DEVICE_ID_KEY = 'scs_device_id';

/**
 * Get or generate a persistent device ID.
 * Stored in localStorage to persist across page reloads.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'server-side';
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  
  if (!deviceId) {
    // Generate a new UUID for this device
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  return deviceId;
}

/**
 * Clear the device ID (used for logout/clear data scenarios).
 */
export function clearDeviceId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DEVICE_ID_KEY);
}

/**
 * Check if a device ID exists.
 */
export function hasDeviceId(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem(DEVICE_ID_KEY);
}

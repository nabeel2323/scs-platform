/**
 * Password validation utilities
 * Enforces strong password policies per NIST SP 800-63B
 */

// Common passwords list (top 100 - abbreviated for brevity)
const COMMON_PASSWORDS = new Set([
  'password', '123456789012', 'qwertyuiopasd', '1234567890123', 'password123',
  'qwerty12345678', '12345678901234', 'admin12345678', 'letmein123456', 'welcome12345',
  'monkey12345678', 'dragon12345678', 'master12345678', 'abc1234567890', 'football12345',
  'shadow12345678', 'michael1234567', 'login12345678', 'starwars12345', 'trustno1123456',
]);

/**
 * Validate password strength
 * Requirements:
 * - Minimum 12 characters (NIST recommendation)
 * - At least 3 of 4 character classes (uppercase, lowercase, digits, symbols)
 * - Not a common password
 * - Does not contain personal information (email prefix, phone)
 */
export function validatePasswordStrength(
  password: string,
  userEmail?: string,
  userPhone?: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Length check
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }

  // Character class check
  let classCount = 0;
  if (/[a-z]/.test(password)) classCount++;
  if (/[A-Z]/.test(password)) classCount++;
  if (/[0-9]/.test(password)) classCount++;
  if (/[^A-Za-z0-9]/.test(password)) classCount++;

  if (classCount < 3) {
    errors.push('Password must contain at least 3 character classes (uppercase, lowercase, digits, symbols)');
  }

  // Common password check
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common. Please choose a stronger password');
  }

  // Personal information check
  if (userEmail) {
    const emailPrefix = userEmail.split('@')[0]?.toLowerCase();
    if (emailPrefix && emailPrefix.length >= 3 && password.toLowerCase().includes(emailPrefix)) {
      errors.push('Password should not contain your email address');
    }
  }

  if (userPhone) {
    const phoneDigits = userPhone.replace(/\D/g, '');
    if (phoneDigits.length >= 6 && password.includes(phoneDigits)) {
      errors.push('Password should not contain your phone number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate password entropy (bits)
 * Used for strength indicator in UI
 */
export function calculatePasswordEntropy(password: string): number {
  let charsetSize = 0;
  
  if (/[a-z]/.test(password)) charsetSize += 26;
  if (/[A-Z]/.test(password)) charsetSize += 26;
  if (/[0-9]/.test(password)) charsetSize += 10;
  if (/[^A-Za-z0-9]/.test(password)) charsetSize += 32;

  return Math.log2(Math.pow(charsetSize, password.length));
}

/**
 * Get password strength label for UI
 */
export function getPasswordStrengthLabel(entropy: number): 'weak' | 'fair' | 'good' | 'strong' {
  if (entropy < 40) return 'weak';
  if (entropy < 60) return 'fair';
  if (entropy < 80) return 'good';
  return 'strong';
}

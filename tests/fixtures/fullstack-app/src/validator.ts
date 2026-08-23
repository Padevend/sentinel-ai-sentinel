/**
 * Email and user input validator
 *
 * BUG: Currently accepts any non-empty string as a valid email!
 */

export function isValidEmail(email: string): boolean {
  // BUGGY IMPLEMENTATION: only checks length > 0 instead of standard regex
  return typeof email === 'string' && email.length > 0;
}

export function validateUserRegistration(data: { email?: string; name?: string }): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (!data.email || !isValidEmail(data.email)) {
    errors.push('Invalid email address');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

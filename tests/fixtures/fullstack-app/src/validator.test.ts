import { describe, it, expect } from 'vitest';
import { isValidEmail, validateUserRegistration } from './validator.js';

describe('User Registration Validation', () => {
  it('should accept valid email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('test.name+tag@domain.co.uk')).toBe(true);
  });

  it('should reject invalid email addresses', () => {
    expect(isValidEmail('invalid-email')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user@.com')).toBe(false);
  });

  it('should validate full user registration data', () => {
    const valid = validateUserRegistration({ name: 'Alice', email: 'alice@example.com' });
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const invalid = validateUserRegistration({ name: '', email: 'not-an-email' });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toContain('Name is required');
    expect(invalid.errors).toContain('Invalid email address');
  });
});

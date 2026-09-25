import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';

import { env } from '../../config/env.js';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, env.AUTH_PASSWORD_SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function generateOtpCode() {
  const value = crypto.randomInt(0, 1000000);
  return value.toString().padStart(6, '0');
}

export function hashOtp(otp: string) {
  return crypto.createHmac('sha256', env.AUTH_OTP_SECRET).update(otp).digest('hex');
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string) {
  return crypto.createHmac('sha256', env.AUTH_SESSION_SECRET).update(token).digest('hex');
}

export function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function secondsFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000);
}

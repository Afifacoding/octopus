import { z } from 'zod';

const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

export const signupSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
    email: z.string().trim().email().regex(gmailRegex, 'Only Gmail addresses are allowed'),
    password: z
      .string()
      .min(10)
      .max(128)
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string().min(1),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const verifyOtpSchema = z.object({
  email: z.string().trim().email().regex(gmailRegex, 'Only Gmail addresses are allowed'),
  otp: z.string().trim().length(6).regex(/^[0-9]{6}$/),
});

export const requestOtpSchema = z.object({
  email: z.string().trim().email().regex(gmailRegex, 'Only Gmail addresses are allowed'),
});

export const loginSchema = z.object({
  emailOrUsername: z.string().trim().min(3).max(254),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
});

export type SignupPayload = z.infer<typeof signupSchema>;
export type VerifyOtpPayload = z.infer<typeof verifyOtpSchema>;
export type RequestOtpPayload = z.infer<typeof requestOtpSchema>;
export type LoginPayload = z.infer<typeof loginSchema>;
export type UpdateProfilePayload = z.infer<typeof updateProfileSchema>;

import { apiRequest } from '../api/client';
import type {
  ApiEnvelope,
  AuthUser,
  ExtensionConnectionStatus,
  OtpDeliveryPayload,
} from './types';

export type SignupInput = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type LoginInput = {
  emailOrUsername: string;
  password: string;
};

export async function signup(input: SignupInput) {
  return apiRequest<{ user: AuthUser } & OtpDeliveryPayload>('/auth/signup', {
    method: 'POST',
    body: input,
  }) as Promise<ApiEnvelope<{ user: AuthUser } & OtpDeliveryPayload>>;
}

export async function requestOtp(email: string) {
  return apiRequest<OtpDeliveryPayload>('/auth/request-otp', {
    method: 'POST',
    body: { email },
  }) as Promise<ApiEnvelope<OtpDeliveryPayload>>;
}

export async function verifyOtp(email: string, otp: string) {
  return apiRequest<{ verified: true; user?: AuthUser }>('/auth/verify-otp', {
    method: 'POST',
    body: { email, otp },
  }) as Promise<ApiEnvelope<{ verified: true; user?: AuthUser }>>;
}

export async function login(input: LoginInput) {
  return apiRequest<{ user: AuthUser; emailVerified: boolean }>('/auth/login', {
    method: 'POST',
    body: input,
  }) as Promise<ApiEnvelope<{ user: AuthUser; emailVerified: boolean }>>;
}

export async function logout() {
  return apiRequest<{ loggedOut: true }>('/auth/logout', {
    method: 'POST',
  }) as Promise<ApiEnvelope<{ loggedOut: true }>>;
}

export async function getCurrentUser() {
  return apiRequest<{ user: AuthUser }>('/auth/me', {
    method: 'GET',
  }) as Promise<ApiEnvelope<{ user: AuthUser }>>;
}

export async function updateProfile(input: { username?: string }) {
  return apiRequest<{ user: AuthUser }>('/auth/profile', {
    method: 'PATCH',
    body: input,
  }) as Promise<ApiEnvelope<{ user: AuthUser }>>;
}

export async function getExtensionConnectionStatus() {
  return apiRequest<ExtensionConnectionStatus>('/auth/extension-connection', {
    method: 'GET',
  }) as Promise<ApiEnvelope<ExtensionConnectionStatus>>;
}

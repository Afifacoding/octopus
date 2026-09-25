export type PublicUser = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
};

export type SessionContext = {
  sessionId: string;
  userId: string;
  token: string;
  expiresAt: Date;
};

export type SignupInput = {
  username: string;
  email: string;
  password: string;
};

export type LoginInput = {
  emailOrUsername: string;
  password: string;
};

export type VerifyOtpInput = {
  email: string;
  otp: string;
};

export type RequestOtpInput = {
  email: string;
};

export type UpdateProfileInput = {
  username?: string;
};

export type OtpDeliveryMetadata = {
  otpSent: true;
  developmentOtp?: string;
  deliveryMode?: 'DEVELOPMENT_FALLBACK';
};

export type ExtensionConnectionStatus = {
  connected: boolean;
  status: 'CONNECTED' | 'NOT_CONNECTED';
  workspaceName: string | null;
  projectId: string | null;
  projectName: string | null;
  sessionLastSeenAt: string | null;
};

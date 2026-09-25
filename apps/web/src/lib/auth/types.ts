export type AuthUser = {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
};

export type OtpDeliveryPayload = {
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

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiFailure = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

import type { ApiResponse } from '@octopus/shared';

import { apiRequest } from './client';

type HealthPayload = {
  status: 'ok';
  service: string;
  timestamp: string;
};

export function fetchHealth() {
  return apiRequest<HealthPayload>('/health') as Promise<ApiResponse<HealthPayload>>;
}

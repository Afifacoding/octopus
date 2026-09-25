export function getHealthStatus() {
  return {
    status: 'ok' as const,
    service: 'octopus-api',
    timestamp: new Date().toISOString(),
  };
}

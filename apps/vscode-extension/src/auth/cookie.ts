export function extractSessionCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return null;
  }

  const match = setCookieHeader.match(/(octopus_session=[^;]+)/i);
  return match ? match[1] : null;
}

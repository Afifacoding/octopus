import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as authApi from '../api/auth';
import * as sessionStore from './session';
import { startHeartbeat, stopHeartbeat } from './heartbeat';

const fakeContext = {} as never;

describe('extension heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopHeartbeat();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does nothing when there is no stored session cookie', async () => {
    vi.spyOn(sessionStore, 'getSessionCookie').mockResolvedValue(undefined);
    const meSpy = vi.spyOn(authApi, 'me').mockResolvedValue({ user: { id: 'u1', username: 'a', email: 'a@a.com' } });

    startHeartbeat(fakeContext);
    await vi.advanceTimersByTimeAsync(0);

    expect(meSpy).not.toHaveBeenCalled();
  });

  it('sends an immediate ping when a session cookie exists', async () => {
    vi.spyOn(sessionStore, 'getSessionCookie').mockResolvedValue('octopus_session=abc');
    const meSpy = vi.spyOn(authApi, 'me').mockResolvedValue({ user: { id: 'u1', username: 'a', email: 'a@a.com' } });

    startHeartbeat(fakeContext);
    await vi.advanceTimersByTimeAsync(0);

    expect(meSpy).toHaveBeenCalledTimes(1);
    expect(meSpy).toHaveBeenCalledWith(expect.objectContaining({ cookie: 'octopus_session=abc' }));
  });

  it('pings again after each 60 second interval', async () => {
    vi.spyOn(sessionStore, 'getSessionCookie').mockResolvedValue('octopus_session=abc');
    const meSpy = vi.spyOn(authApi, 'me').mockResolvedValue({ user: { id: 'u1', username: 'a', email: 'a@a.com' } });

    startHeartbeat(fakeContext);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);

    // One immediate ping plus one for each elapsed interval.
    expect(meSpy).toHaveBeenCalledTimes(3);
  });

  it('stops pinging once stopHeartbeat is called', async () => {
    vi.spyOn(sessionStore, 'getSessionCookie').mockResolvedValue('octopus_session=abc');
    const meSpy = vi.spyOn(authApi, 'me').mockResolvedValue({ user: { id: 'u1', username: 'a', email: 'a@a.com' } });

    startHeartbeat(fakeContext);
    await vi.advanceTimersByTimeAsync(0);
    stopHeartbeat();

    await vi.advanceTimersByTimeAsync(120_000);

    expect(meSpy).toHaveBeenCalledTimes(1);
  });

  it('does not start a second interval when called again while already running', async () => {
    vi.spyOn(sessionStore, 'getSessionCookie').mockResolvedValue('octopus_session=abc');
    const meSpy = vi.spyOn(authApi, 'me').mockResolvedValue({ user: { id: 'u1', username: 'a', email: 'a@a.com' } });

    startHeartbeat(fakeContext);
    startHeartbeat(fakeContext);
    await vi.advanceTimersByTimeAsync(0);

    // Two immediate pings from the two calls, but only one interval was registered.
    expect(meSpy).toHaveBeenCalledTimes(2);

    meSpy.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(meSpy).toHaveBeenCalledTimes(1);
  });

  it('swallows heartbeat request failures without throwing', async () => {
    vi.spyOn(sessionStore, 'getSessionCookie').mockResolvedValue('octopus_session=abc');
    vi.spyOn(authApi, 'me').mockRejectedValue(new Error('network error'));

    expect(() => startHeartbeat(fakeContext)).not.toThrow();
    await expect(vi.advanceTimersByTimeAsync(0)).resolves.not.toThrow();
  });

  it('never sends workspace files, secrets, or tokens in the heartbeat request', async () => {
    vi.spyOn(sessionStore, 'getSessionCookie').mockResolvedValue('octopus_session=abc');
    const meSpy = vi.spyOn(authApi, 'me').mockResolvedValue({ user: { id: 'u1', username: 'a', email: 'a@a.com' } });

    startHeartbeat(fakeContext);
    await vi.advanceTimersByTimeAsync(0);

    const callArgs = meSpy.mock.calls[0]?.[0];
    expect(callArgs).toEqual({ cookie: 'octopus_session=abc', timeoutMs: expect.any(Number) });
  });
});

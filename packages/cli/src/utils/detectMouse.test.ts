/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectMouseSupport } from './detectMouse.js';

describe('detectMouseSupport', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalPlatform: string;
  let originalIsTTY: boolean | undefined;
  let originalStdoutWrite: typeof process.stdout.write;
  let originalStdinOn: typeof process.stdin.on;
  let originalStdinRemoveListener: typeof process.stdin.removeListener;
  let originalStdinSetRawMode: typeof process.stdin.setRawMode;
  let originalStdinResume: typeof process.stdin.resume;
  let originalStdinPause: typeof process.stdin.pause;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalPlatform = process.platform;
    originalIsTTY = process.stdout.isTTY;
    originalStdoutWrite = process.stdout.write;
    originalStdinOn = process.stdin.on;
    originalStdinRemoveListener = process.stdin.removeListener;
    originalStdinSetRawMode = process.stdin.setRawMode;
    originalStdinResume = process.stdin.resume;
    originalStdinPause = process.stdin.pause;

    // Reset env
    process.env = {};
    // Default to TTY
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });

    // Mock stdin/stdout for active query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stdout.write = vi.fn() as any;
    process.stdin.on = vi.fn();
    process.stdin.removeListener = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stdin.setRawMode = vi.fn() as any;
    process.stdin.resume = vi.fn();
    process.stdin.pause = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    if (originalIsTTY !== undefined) {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
    }
    process.stdout.write = originalStdoutWrite;
    process.stdin.on = originalStdinOn;
    process.stdin.removeListener = originalStdinRemoveListener;
    process.stdin.setRawMode = originalStdinSetRawMode;
    process.stdin.resume = originalStdinResume;
    process.stdin.pause = originalStdinPause;
  });

  it('should return false if not TTY', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false });
    const supported = await detectMouseSupport();
    expect(supported).toBe(false);
  });

  it('should return false if CI', async () => {
    process.env['CI'] = 'true';
    const supported = await detectMouseSupport();
    expect(supported).toBe(false);
  });

  it('should return true if terminal responds with escape sequence', async () => {
    // Mock stdin.on to simulate response
    vi.mocked(process.stdin.on).mockImplementation((event, callback) => {
      if (event === 'data') {
        // Respond immediately with a DA response
        // @ts-expect-error - mock implementation
        callback(Buffer.from('\x1b[?1;2c'));
      }
      return process.stdin;
    });

    const supported = await detectMouseSupport();
    expect(supported).toBe(true);
    expect(process.stdout.write).toHaveBeenCalledWith('\x1b[c');
  });

  it('should return false if terminal does not respond (timeout)', async () => {
    // Mock stdin.on to do nothing (timeout)
    vi.useFakeTimers();
    const promise = detectMouseSupport();

    // Fast-forward time to trigger timeout
    vi.advanceTimersByTime(1000);

    const supported = await promise;
    expect(supported).toBe(false);

    vi.useRealTimers();
  });

  it('should return false if response is garbage', async () => {
    vi.mocked(process.stdin.on).mockImplementation((event, callback) => {
      if (event === 'data') {
        // Respond with something that doesn't look like an escape sequence
        // But ends with 'c' to trigger the resolve condition in our code?
        // Our code checks: if (buffer.endsWith('c')) resolve(buffer);
        // Then: if (response && response.includes('\x1b[')) return true;
        // So we send 'abc'
        // @ts-expect-error - mock implementation
        callback(Buffer.from('abc'));
      }
      return process.stdin;
    });

    const supported = await detectMouseSupport();
    expect(supported).toBe(false);
  });
});

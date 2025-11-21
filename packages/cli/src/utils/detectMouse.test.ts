/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMouseSupport } from './detectMouse.js';

describe('getMouseSupport', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalPlatform: string;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalPlatform = process.platform;
    originalIsTTY = process.stdout.isTTY;

    // Reset env
    process.env = {};
    // Default to TTY
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
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
  });

  it('should return false for unknown terminal', () => {
    process.env['TERM'] = 'unknown';
    const support = getMouseSupport();
    expect(support.mouse).toBe(false);
  });

  it('should return true for xterm', () => {
    process.env['TERM'] = 'xterm';
    const support = getMouseSupport();
    expect(support.mouse).toBe(true);
    expect(support.mouseProtocol).toBe('xterm');
  });

  it('should return true for vscode in TERM_PROGRAM', () => {
    process.env['TERM_PROGRAM'] = 'vscode';
    const support = getMouseSupport();
    expect(support.mouse).toBe(true);
  });
});

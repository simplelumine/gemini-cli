/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Actively queries the terminal using escape sequences to check for capabilities.
 * This is more reliable than env vars but requires an async round-trip.
 */
export async function detectMouseSupport(timeout = 300): Promise<boolean> {
  // 1. Safety Checks (Environment blocking)
  if (!process.stdout.isTTY || process.env['CI']) {
    return false;
  }

  // 2. Active Query (The "Sequence" Method)
  // We send Primary Device Attributes (\x1b[c).
  // If the terminal responds, it supports escape sequences.
  // Almost all terminals that support mouse also support DA queries.
  try {
    const response = await queryTerminal('\x1b[c', timeout);
    if (response && response.includes('\x1b[')) {
      return true;
    }
  } catch {
    // Timeout or error
  }

  // 3. Fallback to False if active query fails
  return false;
}

function queryTerminal(
  sequence: string,
  timeoutMs: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(null);
      return;
    }

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    // We need raw mode to read the response byte-by-byte without hitting enter
    stdin.setRawMode(true);
    stdin.resume();

    let buffer = '';
    // eslint-disable-next-line prefer-const
    let timer: NodeJS.Timeout;

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw);
      if (!wasRaw) {
        stdin.pause();
      }
      clearTimeout(timer);
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      // DA response usually ends with 'c' (e.g. \x1b[?1;2c)
      if (buffer.endsWith('c')) {
        cleanup();
        resolve(buffer);
      }
    };

    timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    stdin.on('data', onData);
    process.stdout.write(sequence);
  });
}

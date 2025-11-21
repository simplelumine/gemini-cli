/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import path from 'node:path';

interface TerminalInfo {
  isTTY: boolean;
  isSSH: boolean;
  appId: string;
  safe: boolean;
  generic: string;
}

interface MouseSupport extends TerminalInfo {
  mouse: boolean;
  mouseProtocol: string;
}

// Try to guess the terminal without any async system call, using TERM and COLORTERM.
function guessTerminal(): TerminalInfo {
  let version: number;

  const isSSH = !!process.env['SSH_CONNECTION'];
  const isTTY = !!process.stdout.isTTY;

  if (!isTTY) {
    return {
      isTTY,
      isSSH,
      appId: 'none',
      safe: true,
      generic: 'none',
    };
  }

  const platform = os.platform();

  const t256color =
    (process.env['TERM'] && process.env['TERM'].match(/256/)) ||
    (process.env['COLORTERM'] && process.env['COLORTERM'].match(/256/));

  const tTrueColor =
    process.env['COLORTERM'] &&
    process.env['COLORTERM'].match(/^(truecolor|24bits?)$/);

  let appId =
    process.env['COLORTERM'] && !tTrueColor
      ? process.env['COLORTERM']
      : process.env['TERM_PROGRAM']
        ? process.env['TERM_PROGRAM']
        : process.env['TERM'];

  if (platform === 'darwin') {
    // Some macOS terminals put the full path in TERM_PROGRAM
    appId = path.parse(appId || '').name;
  } else if (platform === 'android' && process.env['TERMUX_VERSION']) {
    appId = 'termux';
  }

  if (!appId) {
    return {
      isTTY,
      isSSH,
      appId: 'unknown',
      safe: false,
      generic: 'unknown',
    };
  }

  // safe is true if we are sure about our guess
  let safe = !!(
    appId !== process.env['TERM'] ||
    (process.env['TERM'] &&
      process.env['TERM'] !== 'xterm' &&
      process.env['TERM'] !== 'xterm-256color')
  );

  let generic = appId;

  switch (appId) {
    case 'xterm':
    case 'xterm-256color':
      if (safe) {
        break;
      }

      if (tTrueColor) {
        appId = generic = 'xterm-truecolor';
      }

      // Many terminal advertise them as xterm, we will try to guess some of them here,
      // using environment variable
      if (process.env['VTE_VERSION']) {
        version = parseInt(process.env['VTE_VERSION'], 10);

        if (version >= 3803) {
          appId = t256color || tTrueColor ? 'gnome-256color' : 'gnome';
          safe = true;
          break;
        }
      }

      // BTW OSX terminals advertise them as xterm, while having their own key mapping...
      if (platform === 'darwin') {
        appId = 'osx-256color';
        break;
      }

      for (const envVar in process.env) {
        if (envVar.match(/KONSOLE/)) {
          appId = t256color || tTrueColor ? 'konsole-256color' : 'konsole';
          safe = true;
          break;
        }
      }

      break;

    case 'linux':
    case 'aterm':
    case 'kuake':
    case 'tilda':
    case 'terminology':
    case 'wterm':
    case 'mrxvt':
      break;

    case 'gnome':
    case 'gnome-256color':
    case 'gnome-terminal':
    case 'gnome-terminal-256color':
    case 'terminator': // it uses gnome terminal lib
    case 'guake': // same here
      appId = t256color || tTrueColor ? 'gnome-256color' : 'gnome';
      break;
    case 'konsole':
      appId = t256color || tTrueColor ? 'konsole-256color' : 'konsole';
      break;
    case 'rxvt':
    case 'rxvt-xpm':
    case 'rxvt-unicode-256color':
    case 'urxvt256c':
    case 'urxvt256c-ml':
    case 'rxvt-unicode':
    case 'urxvt':
    case 'urxvt-ml':
      if (process.env['TERM'] === 'rxvt') {
        appId = 'rxvt-256color';
      } else {
        appId = t256color || tTrueColor ? 'rxvt-256color' : 'rxvt';
      }
      break;
    case 'xfce':
    case 'xfce-terminal':
    case 'xfce4-terminal':
      appId = 'xfce';
      break;
    case 'eterm':
    case 'Eterm':
      appId = t256color || tTrueColor ? 'eterm-256color' : 'eterm';
      break;
    case 'atomic-terminal':
      appId = 'atomic-terminal';
      break;
    case 'xterm-kitty':
    case 'kitty':
      appId = 'kitty';
      break;

    // OSX Terminals

    case 'iTerm':
    case 'iterm':
    case 'iTerm2':
    case 'iterm2':
    case 'Terminal':
    case 'terminal':
    case 'Apple_Terminal':
      appId = 'osx-256color';
      break;

    // Android

    case 'termux':
      break;

    default:
      if (!appId) {
        generic = 'unknown';
      } else {
        generic = appId = appId.toLowerCase();
      }
      break;
  }

  return {
    isTTY,
    isSSH,
    appId,
    safe,
    generic: safe ? appId : generic,
  };
}

// Determines mouse support based on the guessed terminal ID
export function getMouseSupport(): MouseSupport {
  const detected = guessTerminal();
  const appId = detected.appId;

  const result: MouseSupport = {
    ...detected,
    mouse: false,
    mouseProtocol: 'none',
  };

  // Known terminals with X11/SGR mouse support
  const xtermMouseSupported = [
    'xterm',
    'xterm-256color',
    'xterm-truecolor',
    'gnome',
    'gnome-256color',
    'rxvt',
    'rxvt-256color',
    'konsole',
    'konsole-256color',
    'xfce',
    'eterm',
    'eterm-256color',
    'kitty',
    'osx-256color',
    'termux',
    'atomic-terminal',
    'vscode',
  ];

  if (xtermMouseSupported.includes(appId)) {
    result.mouse = true;
    result.mouseProtocol = 'xterm';
  } else if (appId === 'linux') {
    // Linux console requires GPM daemon
    result.mouse = true; // Potentially
    result.mouseProtocol = 'gpm';
  }

  return result;
}

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

  // 3. Fallback to Heuristics if active query fails (or times out)
  // This covers cases where stdin/out might be intercepted or very slow.
  const heuristic = getMouseSupport();
  return heuristic.mouse;
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

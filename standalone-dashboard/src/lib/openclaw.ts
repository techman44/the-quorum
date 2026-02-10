import { execSync } from 'child_process';

/**
 * Find the openclaw binary by checking common locations.
 * Returns the path to openclaw, or a default that will fail with a clear error.
 */
export function findOpenClaw(): string {
  // Try OPENCLAW_PATH env var first
  if (process.env.OPENCLAW_PATH) {
    return process.env.OPENCLAW_PATH;
  }

  // Try common locations in order
  const candidates = [
    '/usr/bin/openclaw',
    '/usr/local/bin/openclaw',
    '/opt/homebrew/bin/openclaw',
  ];

  for (const candidate of candidates) {
    try {
      execSync(`test -x ${candidate}`);
      return candidate;
    } catch {
      // Continue to next candidate
    }
  }

  // Try nvm location (check user home)
  const home = process.env.HOME || '/Users/deanmcintosh';
  const nvmBase = `${home}/.nvm/versions/node`;

  try {
    // Find the latest node version with openclaw
    const versions = execSync(`ls -1 ${nvmBase} 2>/dev/null || true`).toString().trim().split('\n');
    for (const version of versions.reverse()) {
      const openclawPath = `${nvmBase}/${version}/bin/openclaw`;
      try {
        execSync(`test -x ${openclawPath}`);
        return openclawPath;
      } catch {
        // Continue
      }
    }
  } catch {
    // nvm directory doesn't exist or has no versions
  }

  // Try which as last resort
  try {
    return execSync('which openclaw').toString().trim();
  } catch {
    // Default fallback - will fail with clear error
    return '/usr/bin/openclaw';
  }
}

// Cache the result so we don't search every time
let cachedOpenClawPath: string | null = null;

export function getOpenClawPath(): string {
  if (!cachedOpenClawPath) {
    cachedOpenClawPath = findOpenClaw();
  }
  return cachedOpenClawPath;
}

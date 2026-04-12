import { compare } from 'compare-versions';
import log from '../utils/log';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Parse version string "A.B.C" into components
 */
export function parseVersion(version: string): ParsedVersion | null {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    log.warn(`[versionUtils] Invalid version format: ${version}`);
    return null;
  }
  return {
    major: parts[0],
    minor: parts[1],
    patch: parts[2],
  };
}

/**
 * Compare local and remote versions to determine update type.
 *
 * Returns:
 * - 'major' — A or B changed (requires full installer download)
 * - 'minor' — only C changed (hotfix, download specific files)
 * - 'equal' — versions are the same, no update needed
 * - 'older' — local version is newer than remote
 */
export function compareUpdateType(
  localVersion: string,
  remoteVersion: string,
): 'major' | 'minor' | 'equal' | 'older' {
  const local = parseVersion(localVersion);
  const remote = parseVersion(remoteVersion);

  if (!local || !remote) {
    log.warn('[versionUtils] Cannot compare versions, defaulting to equal');
    return 'equal';
  }

  // Use compare-versions for reliable comparison
  const cmp = compare(localVersion, remoteVersion, '=');

  if (cmp) {
    return 'equal';
  }

  const localNewer = compare(localVersion, remoteVersion, '>');
  if (localNewer) {
    return 'older';
  }

  // Remote is newer — determine if major or minor
  if (local.major !== remote.major || local.minor !== remote.minor) {
    return 'major';
  }

  // Only patch (C) changed
  return 'minor';
}

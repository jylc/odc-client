/**
 * Update types for the update service
 */

export type UpdateType = 'major' | 'minor';

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  downloadUrl?: string;
  updateType?: UpdateType;
}

export interface UpdateProgress {
  progress: number;
}

export interface HotfixProgress {
  status: 'downloading' | 'extracting' | 'pending-restart' | 'error';
  version: string;
  progress?: number;
  error?: string;
}

export interface UpdaterConfig {
  links: {
    home: string;
    help: string;
    update: string;
  };
}

export const UPDATE_EVENTS = {
  UPDATE_CHECKING: 'update:checking',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_NOT_AVAILABLE: 'update:not-available',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_ERROR: 'update:error',
  UPDATE_HOTFIX_PROGRESS: 'update:hotfix-progress',
} as const;

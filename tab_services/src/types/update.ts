/**
 * Update types for the update service
 */

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

export interface UpdateProgress {
  progress: number;
}

export const UPDATE_EVENTS = {
  UPDATE_CHECKING: 'update:checking',
  UPDATE_AVAILABLE: 'update:available',
  UPDATE_NOT_AVAILABLE: 'update:not-available',
  UPDATE_PROGRESS: 'update:progress',
  UPDATE_DOWNLOADED: 'update:downloaded',
  UPDATE_ERROR: 'update:error',
} as const;

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import log from '../utils/log';

export interface UpdaterConfig {
  updateServerUrl: string;
  links: {
    home: string;
    help: string;
    update: string;
  };
}

const DEFAULT_CONFIG: UpdaterConfig = {
  updateServerUrl: '',
  links: {
    home: 'https://www.oceanbase.com/',
    help: 'https://www.oceanbase.com/docs/',
    update: 'https://www.oceanbase.com/download/',
  },
};

/**
 * Simple YAML parser for flat and one-level-nested key-value pairs.
 * Handles format:
 *   key: 'value'
 *   key: value
 *   nested:
 *     key: 'value'
 */
function parseSimpleYaml(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  let currentParent: string | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    // Skip comments and empty lines
    if (!line || line.startsWith('#')) continue;

    // Check if this is a nested section (e.g., "links:")
    if (line.endsWith(':') && !line.includes(': ')) {
      currentParent = line.slice(0, -1).trim();
      result[currentParent] = {};
      continue;
    }

    // Parse key: value pair
    const colonIndex = line.indexOf(': ');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: string = line.slice(colonIndex + 2).trim();

    // Remove surrounding quotes
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }

    if (currentParent) {
      result[currentParent][key] = value;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Get the base path for config files
 */
function getConfigBasePath(): string {
  const isDev = process.env.NODE_ENV === 'development';
  return isDev ? process.cwd() : process.resourcesPath || '';
}

/**
 * Load updater configuration from YAML file
 */
export function loadUpdaterConfig(): UpdaterConfig {
  const basePath = getConfigBasePath();
  const isDev = process.env.NODE_ENV === 'development';
  const configFileName = isDev ? 'app-updater-dev.yml' : 'app-updater.yml';
  const configPath = path.join(basePath, 'libraries', 'script', configFileName);

  try {
    if (!fs.existsSync(configPath)) {
      log.warn(`[configLoader] Config file not found: ${configPath}, using defaults`);
      return DEFAULT_CONFIG;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = parseSimpleYaml(content);

    return {
      updateServerUrl: parsed.updateServerUrl || DEFAULT_CONFIG.updateServerUrl,
      links: {
        home: parsed.links?.home || DEFAULT_CONFIG.links.home,
        help: parsed.links?.help || DEFAULT_CONFIG.links.help,
        update: parsed.links?.update || DEFAULT_CONFIG.links.update,
      },
    };
  } catch (error) {
    log.error('[configLoader] Failed to load config:', error);
    return DEFAULT_CONFIG;
  }
}

let cachedConfig: UpdaterConfig | null = null;

/**
 * Get updater configuration (cached after first load)
 */
export function getUpdaterConfig(): UpdaterConfig {
  if (!cachedConfig) {
    cachedConfig = loadUpdaterConfig();
    log.info('[configLoader] Loaded config:', {
      updateServerUrl: cachedConfig.updateServerUrl,
      links: cachedConfig.links,
    });
  }
  return cachedConfig;
}

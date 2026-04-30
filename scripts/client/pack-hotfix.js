/*
 * Copyright 2023 OceanBase
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * Pack hotfix zip for auto-update
 *
 * Creates a zip file from the built release:
 * - app.asar          → {resourcesPath}/app.asar
 * - renderer/         → {resourcesPath}/renderer
 * - tab_services/     → {resourcesPath}/tab_services
 * - version.json      → {resourcesPath}/version.json
 *
 * Source: release/win-unpacked/resources/
 */
async function packHotfix() {
  const projectRoot = path.resolve(__dirname, '../..');
  const releaseDir = path.join(projectRoot, 'release');
  const resourcesDir = path.join(releaseDir, 'win-unpacked', 'resources');

  // Verify resources directory exists
  if (!fs.existsSync(resourcesDir)) {
    throw new Error(
      `Resources directory not found at ${resourcesDir}. Run 'npm run build:client' first.`,
    );
  }

  // Read version from version.json in resources
  const versionJsonPath = path.join(resourcesDir, 'version.json');
  if (!fs.existsSync(versionJsonPath)) {
    throw new Error(`version.json not found at ${versionJsonPath}. Run 'npm run build:client' first.`);
  }

  const versionContent = fs.readFileSync(versionJsonPath, 'utf-8');
  const versionData = JSON.parse(versionContent);
  const version = versionData.version;

  if (!version) {
    throw new Error('Version not found in version.json');
  }

  console.log(`[pack-hotfix] Creating hotfix for version ${version}`);

  // Verify required files/directories exist
  const appAsarPath = path.join(resourcesDir, 'app.asar');
  const rendererDir = path.join(resourcesDir, 'renderer');
  const tabServicesDir = path.join(resourcesDir, 'tab_services');

  if (!fs.existsSync(appAsarPath)) {
    throw new Error(`app.asar not found at ${appAsarPath}`);
  }
  if (!fs.existsSync(rendererDir)) {
    throw new Error(`Renderer directory not found at ${rendererDir}`);
  }
  if (!fs.existsSync(tabServicesDir)) {
    throw new Error(`Tab services directory not found at ${tabServicesDir}`);
  }

  // Ensure release directory exists
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }

  // Create zip file
  const zip = new AdmZip();

  // Add app.asar
  console.log(`[pack-hotfix] Adding app.asar from ${appAsarPath}`);
  zip.addLocalFile(appAsarPath);

  // Add renderer directory
  console.log(`[pack-hotfix] Adding renderer from ${rendererDir}`);
  zip.addLocalFolder(rendererDir, 'renderer');

  // Add tab_services directory
  console.log(`[pack-hotfix] Adding tab_services from ${tabServicesDir}`);
  zip.addLocalFolder(tabServicesDir, 'tab_services');

  // Add version.json
  console.log(`[pack-hotfix] Adding version.json from ${versionJsonPath}`);
  const versionContentBuffer = Buffer.from(JSON.stringify(versionData, null, 2));
  zip.addFile('version.json', versionContentBuffer);

  // Output zip file to release directory
  const outputFileName = `hotfix-${version}.zip`;
  const outputPath = path.join(releaseDir, outputFileName);

  zip.writeZip(outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`[pack-hotfix] Created ${outputFileName} (${stats.size} bytes) at ${outputPath}`);

  return {
    version,
    outputPath,
    size: stats.size,
  };
}

module.exports = { packHotfix };

// Allow running directly: node scripts/client/pack-hotfix.js
if (require.main === module) {
  packHotfix()
    .then((result) => {
      console.log('[pack-hotfix] Done:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('[pack-hotfix] Error:', error.message);
      process.exit(1);
    });
}

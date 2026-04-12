const fs = require('fs');
const path = require('path');

const distDir = 'dist';
const buildMode = process.env.ELECTRON_COMPRESSION_MODE

console.log('buildMode: ', buildMode)

// Read release notes from markdown file
const releaseNotePath = path.join(__dirname, '..', 'release-note.md');
const releaseNotes = fs.existsSync(releaseNotePath)
  ? fs.readFileSync(releaseNotePath, 'utf-8').trim()
  : '';

if (releaseNotes) {
  console.log('releaseNotes: loaded from release-note.md');
}

/**
 * afterAllArtifactBuild hook:
 * Injects releaseNotes into the generated latest.yml after electron-builder finishes.
 */
function injectReleaseNotes(context) {
  const releaseDir = path.join(__dirname, '..', 'release');

  // Inject into latest.yml (Windows)
  const latestYmlPath = path.join(releaseDir, 'latest.yml');
  if (fs.existsSync(latestYmlPath)) {
    let ymlContent = fs.readFileSync(latestYmlPath, 'utf-8');
    // Remove any existing releaseNotes line to avoid duplicates
    ymlContent = ymlContent.replace(/\nreleaseNotes:.*(\n|$)/g, '\n');
    ymlContent += `releaseNotes: ${JSON.stringify(releaseNotes)}\n`;
    fs.writeFileSync(latestYmlPath, ymlContent);
    console.log('[afterAllArtifactBuild] Injected releaseNotes into latest.yml');
  }

  // Generate latest.json (easier to parse than YAML)
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
  const latestJson = {
    version: pkg.version,
    releaseNotes: releaseNotes,
    downloadUrl: '',
  };
  fs.writeFileSync(path.join(releaseDir, 'latest.json'), JSON.stringify(latestJson, null, 2));
  console.log(`[afterAllArtifactBuild] Generated latest.json for version ${pkg.version}`);
}

const config = {
  productName: 'OceanBase Developer Center',
  compression: buildMode || 'normal',
  afterSign: "electron-builder-notarize",
  afterAllArtifactBuild: injectReleaseNotes,
  publish: {
    provider: 'generic',
    url: 'http://192.168.1.26:12345/',
    channel: 'latest',
  },
  mac: {
    hardenedRuntime: true,
    category: 'public.app-category.developer-tools',
    entitlements: "./node_modules/electron-builder-notarize/entitlements.mac.inherit.plist",
    entitlementsInherit: "./node_modules/electron-builder-notarize/entitlements.mac.inherit.plist",
    gatekeeperAssess: false,
    target: 'dmg',
    notarize: false
  },
  dmg: {
    artifactName: 'odc_${version}${env.ENV}.${ext}',
    writeUpdateInfo: false
  },
  win: {
    target: 'nsis',
    signtoolOptions: {
      sign: "./scripts/client/winsign.js",
      publisherName: 'OceanBase',
      rfc3161TimeStampServer: "http://sha256timestamp.ws.symantec.com/sha256/timestamp",
      signingHashAlgorithms: ["sha256"],
    }
  },
  nsis: {
    differentialPackage: false,
    artifactName: 'odc_Setup_${version}_${env.ARCH}${env.ENV}.${ext}',
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    runAfterFinish: false,
    perMachine: true,
    menuCategory: 'OceanBase Developer Center',
    warningsAsErrors: false,
  },
  linux: {
    target: [
      {
       target: "deb"
      },
      {
       target: "rpm"
      },
      {
       target: "AppImage"
      }
    ],
    category: 'Development',
    maintainer: 'OceanBase'
  },
  directories: {
    output: 'release',
  },
  appId: 'com.antfin.odc',
  asar: true,
  extraMetadata: {
    main: 'main.js',
  },
  files: [
    {
      from: '.',
      filter: ['package.json'],
    },
    {
      from: `${distDir}/main`,
    },
    {
      from: `${distDir}/renderer-dll`,
    },
  ],
  extraResources: [
    'libraries',
    {
      from: `${distDir}/renderer`,
      to: 'renderer',
    },
    {
      from: `${distDir}/tab_services`,
      to: 'tab_services',
    },
    {
      from: `${distDir}/version.json`,
      to: 'version.json',
    },
    {
      from: `build/setting.json`,
      to: 'setting.json',
    },

  ],
};

module.exports = config;

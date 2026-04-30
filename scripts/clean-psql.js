/*
 * Clean PostgreSQL client directory - keep only psql.exe and its dependencies
 *
 * Run: node scripts/clean-psql.js
 */

const fs = require('fs');
const path = require('path');

const psqlDir = path.join(__dirname, '../libraries/psql');

// Files to keep for psql.exe minimal setup
const filesToKeep = new Set([
  // Core executable
  'psql.exe',

  // Core PostgreSQL client library
  'libpq.dll',

  // OpenSSL
  'libssl-3-x64.dll',
  'libcrypto-3-x64.dll',

  // ICU internationalization
  'icudt77.dll',
  'icuin77.dll',
  'icuio77.dll',
  'icutu77.dll',
  'icuuc77.dll',

  // Runtime libraries
  'libiconv-2.dll',
  'libintl-9.dll',
  'libwinpthread-1.dll',
  'zlib1.dll',
]);

// Optional: keep if you need XML/HTTP features
const optionalFiles = new Set([
  'libxml2.dll',
  'libcurl.dll',
]);

function cleanPsqlDirectory() {
  if (!fs.existsSync(psqlDir)) {
    console.error(`Directory not found: ${psqlDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(psqlDir);
  const deletedFiles = [];
  const keptFiles = [];

  for (const file of files) {
    const filePath = path.join(psqlDir, file);
    const stat = fs.statSync(filePath);

    // Skip directories
    if (stat.isDirectory()) {
      console.log(`[SKIP] Directory: ${file}`);
      continue;
    }

    if (filesToKeep.has(file)) {
      keptFiles.push(file);
    } else {
      try {
        fs.unlinkSync(filePath);
        deletedFiles.push(file);
        console.log(`[DELETE] ${file}`);
      } catch (error) {
        console.error(`[ERROR] Failed to delete ${file}:`, error.message);
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Kept: ${keptFiles.length} files`);
  console.log(`Deleted: ${deletedFiles.length} files`);
  console.log(`\nTotal size before: ${(files.length * 1).toFixed(0)} files`);
  console.log(`Total size after: ${(keptFiles.length * 1).toFixed(0)} files`);
  console.log(`Reduced by: ${((deletedFiles.length / files.length) * 100).toFixed(1)}%`);

  if (keptFiles.length > 0) {
    console.log('\n[KEEP] Remaining files:');
    keptFiles.forEach(f => console.log(`  - ${f}`));
  }

  return { keptFiles, deletedFiles };
}

// Run cleanup
cleanPsqlDirectory();

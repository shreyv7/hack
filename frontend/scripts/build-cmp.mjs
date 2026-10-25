import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// fileURLToPath handles Windows drive letters correctly (new URL().pathname does not).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.resolve(__dirname);
const publicDir = path.resolve(__dirname, '../public');

// Source lives outside public/ so it is never served raw
const sourceFile = path.join(scriptsDir, 'cmp.source.js');
// Output overwrites public/cmp.js — integrators keep the same URL, but get minified code
const outputFile = path.join(publicDir, 'cmp.js');
const manifestFile = path.join(publicDir, 'cmp.manifest.json');

async function build() {
  console.log('📦 Building & Obfuscating Vajra CMP SDK...');

  if (!fs.existsSync(sourceFile)) {
    // The CMP source is proprietary and git-ignored, so it isn't present in fresh
    // checkouts / Docker builds. The minified bundle (public/cmp.js) is committed
    // and served as-is, so when the source is absent we simply skip regeneration
    // instead of failing the whole frontend build.
    if (fs.existsSync(outputFile)) {
      console.warn(
        `⚠️  ${sourceFile} not found — using the committed public/cmp.js and skipping regeneration.`,
      );
      return;
    }
    console.error(`❌ Source SDK file not found at ${sourceFile}, and no prebuilt public/cmp.js exists.`);
    console.error('   Provide scripts/cmp.source.js, or commit a built public/cmp.js.');
    process.exit(1);
  }

  const code = fs.readFileSync(sourceFile, 'utf8');

  // Loaded lazily so the skip-path above doesn't require terser to be installed.
  const { minify } = await import('terser');
  const result = await minify(code, {
    compress: {
      drop_console: false, // keep warn/error console output
      drop_debugger: true,
      passes: 2,
    },
    mangle: {
      toplevel: false, // preserve window.Vajra API interface
      reserved: ['Vajra', 'VajraBanner'],
    },
    output: {
      comments: /^!|Vajra CMP SDK/,
    },
  });

  if (result.error) {
    console.error('❌ Terser minification error:', result.error);
    process.exit(1);
  }

  const minifiedCode = result.code;

  // Overwrite public/cmp.js with minified output — source stays in scripts/
  fs.writeFileSync(outputFile, minifiedCode, 'utf8');

  // Remove stale cmp.min.js if it exists from older builds
  const legacyMinFile = path.join(publicDir, 'cmp.min.js');
  if (fs.existsSync(legacyMinFile)) {
    fs.unlinkSync(legacyMinFile);
    console.log('   🗑️  Removed legacy cmp.min.js');
  }

  // Compute Hashes & SRI
  const sha256Buffer = crypto.createHash('sha256').update(minifiedCode).digest();
  const sha256Base64 = sha256Buffer.toString('base64');
  const sriHash = `sha256-${sha256Base64}`;
  const contentHash = crypto.createHash('md5').update(minifiedCode).digest('hex').substring(0, 12);

  const manifest = {
    version: '1.2.0',
    build_timestamp: new Date().toISOString(),
    content_hash: contentHash,
    sri_hash: sriHash,
    raw_size: Buffer.byteLength(code, 'utf8'),
    minified_size: Buffer.byteLength(minifiedCode, 'utf8'),
    bundle_file: 'cmp.js',
    source_file: 'scripts/cmp.source.js (not served)',
  };

  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`✅ CMP SDK Built Successfully!`);
  console.log(`   Source        : scripts/cmp.source.js`);
  console.log(`   Served as     : public/cmp.js  (minified — source never exposed)`);
  console.log(`   Original Size : ${(manifest.raw_size / 1024).toFixed(2)} KB`);
  console.log(`   Minified Size : ${(manifest.minified_size / 1024).toFixed(2)} KB`);
  console.log(`   SRI Hash      : ${sriHash}`);
  console.log(`   Manifest      : ${manifestFile}`);
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});

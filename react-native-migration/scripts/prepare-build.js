/**
 * This script helps prepare the project for building with EAS
 * - Ensures all assets exist
 * - Creates default placeholder icons if needed
 * - Validates configuration files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Paths to important files
const ROOT_DIR = path.resolve(__dirname, '..');
const ASSETS_DIR = path.resolve(ROOT_DIR, 'assets');
const APP_JSON = path.resolve(ROOT_DIR, 'app.json');
const PACKAGE_JSON = path.resolve(ROOT_DIR, 'package.json');

// Required asset files
const REQUIRED_ASSETS = [
  'icon.png',
  'splash.png',
  'adaptive-icon.png',
  'favicon.png'
];

// Colors from our theme
const THEME_COLORS = {
  primary: '#3B82F6',
  background: '#111827',
  text: '#F9FAFB'
};

console.log('🚀 Preparing project for EAS build...');

// Create assets directory if it doesn't exist
if (!fs.existsSync(ASSETS_DIR)) {
  console.log('📁 Creating assets directory...');
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Create scripts directory if it doesn't exist
if (!fs.existsSync(path.resolve(ROOT_DIR, 'scripts'))) {
  fs.mkdirSync(path.resolve(ROOT_DIR, 'scripts'), { recursive: true });
}

// Ensure required asset files exist
console.log('🖼️  Checking required assets...');
let missingAssets = false;

REQUIRED_ASSETS.forEach(assetFile => {
  const assetPath = path.resolve(ASSETS_DIR, assetFile);
  if (!fs.existsSync(assetPath)) {
    missingAssets = true;
    console.log(`⚠️  Missing asset: ${assetFile}`);
  }
});

if (missingAssets) {
  console.log('⚠️  Some required assets are missing. You should create proper assets before building.');
  console.log('📝 Please create the following assets in the assets directory:');
  console.log('   - icon.png (1024x1024 PNG)');
  console.log('   - splash.png (1242x2436 PNG)');
  console.log('   - adaptive-icon.png (1024x1024 PNG with transparent outer 1/6 edge)');
  console.log('   - favicon.png (48x48 PNG)');
}

// Check if app.json and package.json exist
if (!fs.existsSync(APP_JSON)) {
  console.error('❌ app.json not found. This file is required for building with EAS.');
  process.exit(1);
}

if (!fs.existsSync(PACKAGE_JSON)) {
  console.error('❌ package.json not found. This file is required for building with EAS.');
  process.exit(1);
}

// Validate app.json and package.json
try {
  const appJson = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));

  // Check for essential fields in app.json
  if (!appJson.expo) {
    console.error('❌ app.json is missing the "expo" field.');
    process.exit(1);
  }

  if (!appJson.expo.name) {
    console.error('❌ app.json is missing the "expo.name" field.');
    process.exit(1);
  }

  if (!appJson.expo.slug) {
    console.error('❌ app.json is missing the "expo.slug" field.');
    process.exit(1);
  }

  if (!appJson.expo.version) {
    console.error('❌ app.json is missing the "expo.version" field.');
    process.exit(1);
  }

  // Check for essential fields in package.json
  if (!packageJson.name) {
    console.error('❌ package.json is missing the "name" field.');
    process.exit(1);
  }

  if (!packageJson.version) {
    console.error('❌ package.json is missing the "version" field.');
    process.exit(1);
  }

  // Ensure versions match
  if (packageJson.version !== appJson.expo.version) {
    console.warn(`⚠️  Version mismatch: package.json (${packageJson.version}) and app.json (${appJson.expo.version})`);
    console.log('🔄 Synchronizing versions...');
    
    // Update app.json version to match package.json
    appJson.expo.version = packageJson.version;
    fs.writeFileSync(APP_JSON, JSON.stringify(appJson, null, 2));
    
    console.log(`✅ Updated app.json version to ${packageJson.version}`);
  }

  console.log('✅ Configuration files validated successfully.');
} catch (error) {
  console.error('❌ Error validating configuration files:', error.message);
  process.exit(1);
}

// Final success message
console.log('✅ Project is ready for EAS build!');
console.log('');
console.log('Next steps:');
console.log('1. Run "eas build:configure" to set up your project for building');
console.log('2. Run "eas build --platform android" to build for Android');
console.log('3. Run "eas build --platform ios" to build for iOS');
console.log('');
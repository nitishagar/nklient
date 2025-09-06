#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

// Get the new version from package.json
const packageJson = require('../package.json');
const version = packageJson.version;
const date = new Date().toISOString().split('T')[0];

// Update CHANGELOG.md
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const newEntry = `## [${version}] - ${date}\n\n### Changed\n- Updated version to ${version}\n\n`;

const updatedChangelog = changelog.replace(
  '## [1.0.0]',
  `${newEntry}## [1.0.0]`
);

fs.writeFileSync('CHANGELOG.md', updatedChangelog);

console.log(`✅ Updated CHANGELOG.md for version ${version}`);
console.log('📝 Please update the CHANGELOG entry with actual changes before releasing');
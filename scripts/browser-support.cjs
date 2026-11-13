const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const artifactDir=path.resolve(process.env.BROWSER_ARTIFACT_DIR || path.join(__dirname,'..','.artifacts'));
function artifactPath(name) { fs.mkdirSync(artifactDir,{recursive:true});return path.join(artifactDir,name); }
function launchBrowser() {
  return chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
}
module.exports={artifactPath,launchBrowser};

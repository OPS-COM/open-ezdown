const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'res', 'logo.png');

// Create directories
['res/icons', 'extension/icons'].forEach(d => {
    const full = path.join(__dirname, d);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

async function generate() {
    // App icons
    await sharp(src).resize(512, 512).toFile('res/icons/icon.png');
    await sharp(src).resize(256, 256).toFile('res/icons/icon256.png');
    await sharp(src).resize(32, 32).toFile('res/icons/tray.png');
    await sharp(src).resize(16, 16).toFile('res/icons/tray16.png');

    // Extension icons
    await sharp(src).resize(16, 16).toFile('extension/icons/icon16.png');
    await sharp(src).resize(32, 32).toFile('extension/icons/icon32.png');
    await sharp(src).resize(48, 48).toFile('extension/icons/icon48.png');
    await sharp(src).resize(128, 128).toFile('extension/icons/icon128.png');

    console.log('All icons generated successfully.');
}

generate().catch(console.error);

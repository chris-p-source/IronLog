const sharp = require('sharp');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#e63030"/>
  <rect x="22" y="45" width="56" height="11" rx="5.5" fill="white"/>
  <rect x="9" y="31" width="15" height="38" rx="5" fill="white"/>
  <rect x="76" y="31" width="15" height="38" rx="5" fill="white"/>
  <rect x="22" y="38" width="9" height="24" rx="3" fill="rgba(255,255,255,0.55)"/>
  <rect x="69" y="38" width="9" height="24" rx="3" fill="rgba(255,255,255,0.55)"/>
</svg>`;

const buf = Buffer.from(svg);
const pub = path.join(__dirname, '..', 'public');

async function run() {
  await sharp(buf).resize(180, 180).png().toFile(`${pub}/apple-touch-icon.png`);
  await sharp(buf).resize(192, 192).png().toFile(`${pub}/icon-192.png`);
  await sharp(buf).resize(512, 512).png().toFile(`${pub}/icon-512.png`);
  await sharp(buf).resize(32, 32).png().toFile(`${pub}/favicon-32.png`);
  console.log('Icons generated: apple-touch-icon.png, icon-192.png, icon-512.png, favicon-32.png');
}

run().catch(console.error);

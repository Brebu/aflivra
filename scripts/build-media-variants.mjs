import {createRequire} from 'node:module';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
// Builds width-tuned WebP variants of the hero and the AI editorial
// illustrations, and registers every variant (bytes + SHA-256) in the
// provenance registers the media budget gate reads. Re-runnable: deriving
// from the registered originals, byte-for-byte deterministic at a fixed
// sharp version.
const require = createRequire(fileURLToPath(new URL('../node_modules/.pnpm/sharp@0.35.4_@types+node@22.19.19/node_modules/sharp/package.json', import.meta.url)));
const sharp = require('sharp');
const root = new URL('../', import.meta.url);
const media = (f) => fileURLToPath(new URL('public/media/' + f, root));
const read = (f) => fs.readFileSync(media(f));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const QUALITY = 82;

// The hero renders behind object-fit: cover in a portrait hero on mobile, so
// only a horizontal slice of the landscape source is visible there — and
// mobile CSS pins that slice with object-position:59% center. A width variant
// crops the source so the same object-position maps to the same source
// pixels: left = (srcWidth - variantWidth) * 0.59. sizes then offers the
// variants to max-width:640px layouts only; wider layouts keep the original
// and its centered positioning.
const heroStyle = JSON.parse(fs.readFileSync(fileURLToPath(new URL('public/media/hero-style.json', root))));
const hero = read('hero-graphite-blue.webp');
const heroImg = sharp(hero);
const heroMeta = await heroImg.metadata();
if (heroMeta.width !== heroStyle.width || heroMeta.height !== heroStyle.height) throw new Error('hero dimensions drifted from the register: ' + heroMeta.width + 'x' + heroMeta.height);
const HERO_POSITION_X = 0.59;
const heroVariants = [];
for (const width of [960, 1170]) {
  if (width >= heroStyle.width) continue;
  const left = Math.round((heroStyle.width - width) * HERO_POSITION_X);
  const out = 'hero-graphite-blue-' + width + '.webp';
  const buf = await sharp(hero).extract({left, top: 0, width, height: heroStyle.height}).webp({quality: QUALITY}).toBuffer();
  fs.writeFileSync(media(out), buf);
  heroVariants.push({file: out, width, height: heroStyle.height, bytes: buf.length, sha256: sha256(buf), objectPositionX: HERO_POSITION_X});
  console.log('hero variant ' + out + ' ' + buf.length + ' bytes (from ' + hero.length + '), left=' + left);
}
heroStyle.variants = heroVariants;
fs.writeFileSync(fileURLToPath(new URL('public/media/hero-style.json', root)), JSON.stringify(heroStyle, null, 2) + '\n');

// Illustration variants: the rail covers render ~318-390 CSS px wide, so a
// 960px wide variant serves DPR3 phones without the 1672px original.
const illustrations = JSON.parse(fs.readFileSync(fileURLToPath(new URL('public/media/category-illustrations.json', root))));
for (const entry of illustrations) {
  const buf = await sharp(read(entry.file)).resize({width: 960}).webp({quality: QUALITY}).toBuffer();
  const out = entry.file.replace(/\.webp$/, '-960.webp');
  fs.writeFileSync(media(out), buf);
  entry.variants = [{file: out, width: 960, height: Math.round(entry.height * 960 / entry.width), bytes: buf.length, sha256: sha256(buf)}];
  console.log('illustration variant ' + out + ' ' + buf.length + ' bytes (from ' + entry.bytes + ')');
}
fs.writeFileSync(fileURLToPath(new URL('public/media/category-illustrations.json', root)), JSON.stringify(illustrations, null, 2) + '\n');
console.log('variants built and registered: ' + heroVariants.length + ' hero, ' + illustrations.length + ' illustrations');

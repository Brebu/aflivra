import {chromium} from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/');
const result = await page.evaluate(async () => {
  const manifest = await (await fetch('/stories/manifest.json', {cache: 'no-store'})).json();
  const response = await fetch('/stories/index.json.gz');
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  return {
    proof: manifest.index,
    bytesLength: bytes.byteLength,
    sha256: hex,
    gzipMagic: bytes[0] === 0x1f && bytes[1] === 0x8b,
    itemCount: (JSON.parse(new TextDecoder().decode(bytes)).items || []).length,
  };
});
console.log(JSON.stringify(result, null, 1));
const ok = result.proof.bytes === result.bytesLength && result.proof.sha256 === result.sha256;
console.log('PROOF MATCHES:', ok);
await browser.close();

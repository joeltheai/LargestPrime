import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { digitCount, digitsPerBlock } from './digits.mjs';

const output = new URL('./dist/', import.meta.url);
const chunks = new URL('digits/', output);
const source = await readFile(new URL('./m136279841.txt', import.meta.url), 'utf8');
const digits = source.replace(/\r?\n/g, '');

if (digits.length !== digitCount || /[^0-9]/.test(digits)) {
  throw new Error(`Expected exactly ${digitCount} decimal digits in m136279841.txt.`);
}

await rm(output, { recursive: true, force: true });
await mkdir(chunks, { recursive: true });

const template = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const seed = '<script id="initial-digits" type="text/plain">';
await writeFile(new URL('index.html', output), template.replace(seed, seed + digits.slice(0, digitsPerBlock)));

for (const asset of ['favicon.svg', 'styles.css', 'viewer.mjs', 'digits.mjs']) {
  await copyFile(new URL(asset, import.meta.url), new URL(asset, output));
}

for (let start = 0; start < digitCount; start += digitsPerBlock) {
  const block = start / digitsPerBlock;
  await writeFile(new URL(`${block}.txt`, chunks), digits.slice(start, start + digitsPerBlock));
}

console.log(`Built dist/ with ${Math.ceil(digitCount / digitsPerBlock)} digit files.`);

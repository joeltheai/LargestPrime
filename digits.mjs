export const digitCount = 41_024_320;

export const digitsPerBlock = 20_000;

export async function fetchDigitBlock(block, signal) {
  const firstDigit = block * digitsPerBlock;
  const endDigit = Math.min(firstDigit + digitsPerBlock, digitCount);
  const response = await fetch(new URL(`./digits/${block}.txt`, import.meta.url), { signal });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('The server could not return the requested digit block.');
  }

  const digits = await response.text();
  if (digits.length !== endDigit - firstDigit || /[^0-9]/.test(digits)) {
    throw new Error('The digit file returned an invalid block.');
  }

  return digits;
}

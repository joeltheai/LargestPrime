export const digitCount = 41_024_320;

const sourceRowDigits = 100;
const sourceRowBytes = 102; // Two extra bytes for CRLF.
const fileBytes = digitCount + 2 * Math.ceil(digitCount / sourceRowDigits);

export const digitsPerBlock = 20_000;

export async function fetchDigitBlock(block, signal) {
  const firstDigit = block * digitsPerBlock;
  const endDigit = Math.min(firstDigit + digitsPerBlock, digitCount);
  const firstByte = firstDigit / sourceRowDigits * sourceRowBytes;
  const endByte = (endDigit === digitCount ? fileBytes : endDigit / sourceRowDigits * sourceRowBytes) - 1;

  const response = await fetch(new URL('./m136279841.txt', import.meta.url), {
    headers: { Range: `bytes=${firstByte}-${endByte}` },
    signal,
  });

  if (response.status !== 206 ||
      response.headers.get('Content-Range') !== `bytes ${firstByte}-${endByte}/${fileBytes}`) {
    await response.body?.cancel();
    throw new Error('The server could not return the requested digit range.');
  }

  const digits = (await response.text()).replaceAll('\r\n', '');
  if (digits.length !== endDigit - firstDigit || /[^0-9]/.test(digits)) {
    throw new Error('The digit file returned an invalid block.');
  }

  return digits;
}

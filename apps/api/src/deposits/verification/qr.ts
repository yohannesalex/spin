import { Logger } from '@nestjs/common';
import jsQR from 'jsqr';
import sharp from 'sharp';

const log = new Logger('QR');

/** §4.3 step 1: decode the receipt QR code. Tries several scales because phone photos vary. */
export async function decodeQr(image: Buffer): Promise<string | null> {
  const meta = await sharp(image).metadata();
  const width = meta.width ?? 1000;
  const targets = [Math.min(width, 1600), 1000, 700, 1400, 500].filter((w, i, a) => w > 0 && a.indexOf(w) === i);
  for (const w of targets) {
    for (const normalise of [false, true]) {
      let pipeline = sharp(image).rotate().resize({ width: w, withoutEnlargement: false });
      if (normalise) pipeline = pipeline.grayscale().normalise();
      const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const result = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (result?.data) return result.data;
    }
  }
  return null;
}

/** OCR fallback (Tesseract). Returns null if OCR is unavailable or fails. */
export async function ocrText(image: Buffer): Promise<string | null> {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    try {
      const prepared = await sharp(image).rotate().grayscale().normalise().resize({ width: 1600 }).png().toBuffer();
      const { data } = await worker.recognize(prepared);
      return data.text;
    } finally {
      await worker.terminate();
    }
  } catch (e) {
    log.warn(`OCR unavailable: ${(e as Error).message}`);
    return null;
  }
}

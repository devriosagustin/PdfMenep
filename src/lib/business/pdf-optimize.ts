import 'server-only';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';

import {
  type PdfOptimizeLevel,
  PdfOptimizeLevel as PdfOptimizeLevelZ,
} from '@/lib/contracts/pdf-optimize';

export class PdfOptimizeError extends Error {
  constructor(
    public readonly code: 'invalid_pdf' | 'compress_failed' | 'timeout',
    public readonly reason: 'password' | 'corrupt' | 'empty' | 'compress' | 'timeout' | null = null,
    message = '',
  ) {
    super(message);
  }
}

export interface PdfOptimizeInput {
  filename: string;
  bytes: Uint8Array;
}

export interface PdfOptimizeResult {
  pdf: Uint8Array;
  pageCount: number;
}

const OPTIMIZE_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfOptimizeError('timeout', 'timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function stripMetadataInPlace(doc: PDFDocument): void {
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setProducer('');
  doc.setCreator('');
}

async function reencodeRawImage(
  raw: Uint8Array,
  filterName: string,
  quality: number,
): Promise<Uint8Array | null> {
  try {
    let buf: Buffer;
    if (filterName === 'DCTDecode') {
      buf = await sharp(raw).jpeg({ quality, mozjpeg: true }).toBuffer();
    } else if (filterName === 'FlateDecode') {
      buf = await sharp(raw).png({ compressionLevel: 9 }).toBuffer();
    } else {
      return null;
    }
    if (buf.byteLength === 0) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

function decodePdfName(value: unknown): string {
  if (!value) return '';
  const v = value as { decodeName?: () => string };
  if (typeof v.decodeName === 'function') {
    try {
      return v.decodeName();
    } catch {
      return '';
    }
  }
  return '';
}

interface ImageStreamInfo {
  ref: unknown;
  filter: string;
}

function findPageImageStreams(doc: PDFDocument, pageIndex: number): ImageStreamInfo[] {
  const page = doc.getPage(pageIndex);
  const resources = page.node.Resources();
  if (!resources) return [];
  let xobjects: unknown;
  try {
    xobjects = resources.lookup(PDFName.of('XObject'));
  } catch {
    return [];
  }
  if (!xobjects) return [];
  const map = xobjects as { entries?: () => Iterable<[unknown, unknown]> };
  if (typeof map.entries !== 'function') return [];
  const out: ImageStreamInfo[] = [];
  for (const [name, ref] of map.entries()) {
    void name;
    try {
      const looked = doc.context.lookup(ref as Parameters<typeof doc.context.lookup>[0]);
      if (!(looked instanceof PDFRawStream)) continue;
      const subtype = decodePdfName(looked.dict.get(PDFName.of('Subtype')));
      if (subtype !== 'Image') continue;
      const filter = decodePdfName(looked.dict.get(PDFName.of('Filter')));
      out.push({ ref, filter });
    } catch {}
  }
  return out;
}

async function reencodeImagesOnDocument(
  doc: PDFDocument,
  level: 'media' | 'alta',
): Promise<number> {
  const quality = level === 'alta' ? 50 : 70;
  const pages = doc.getPages();
  let swapped = 0;
  for (let i = 0; i < pages.length; i++) {
    const targets = findPageImageStreams(doc, i);
    for (const target of targets) {
      if (target.filter !== 'DCTDecode' && target.filter !== 'FlateDecode') continue;
      let stream: PDFRawStream;
      try {
        const looked = doc.context.lookup(target.ref as Parameters<typeof doc.context.lookup>[0]);
        if (!(looked instanceof PDFRawStream)) continue;
        stream = looked;
      } catch {
        continue;
      }
      const originalBytes = stream.getContents();
      if (originalBytes.byteLength === 0) continue;
      const reencoded = await reencodeRawImage(originalBytes, target.filter, quality);
      if (!reencoded) continue;
      if (reencoded.byteLength >= originalBytes.byteLength) continue;
      // Replace the indirect object pointed to by `target.ref` with a fresh
      // PDFRawStream built from the original dict and re-encoded bytes.
      // Clear /Length so pdf-lib recomputes on save.
      try {
        stream.dict.delete(PDFName.of('Length'));
      } catch {
        // ignore — older dictionaries may not have Length
      }
      const fresh = PDFRawStream.of(stream.dict, reencoded);
      try {
        doc.context.assign(target.ref as Parameters<typeof doc.context.assign>[0], fresh);
        swapped += 1;
      } catch {}
    }
  }
  return swapped;
}

function chooseSmallest(...candidates: Uint8Array[]): Uint8Array {
  let smallest = candidates[0] as Uint8Array;
  for (const candidate of candidates) {
    if (candidate.byteLength < smallest.byteLength) smallest = candidate;
  }
  return smallest;
}

async function buildRepack(src: PDFDocument): Promise<{ bytes: Uint8Array; pageCount: number }> {
  const merged = await PDFDocument.create();
  const indices = src.getPageIndices();
  const copied = await merged.copyPages(src, indices);
  for (const page of copied) merged.addPage(page);
  stripMetadataInPlace(merged);
  const bytes = await merged.save({ useObjectStreams: true });
  return { bytes, pageCount: copied.length };
}

export async function optimizePdf(
  input: PdfOptimizeInput,
  level: PdfOptimizeLevel,
): Promise<PdfOptimizeResult> {
  const work = (async () => {
    const parsedLevel = PdfOptimizeLevelZ.parse(level);

    let src: PDFDocument;
    try {
      src = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfOptimizeError('invalid_pdf', 'password');
      }
      throw new PdfOptimizeError('invalid_pdf', 'corrupt');
    }

    const indices = src.getPageIndices();
    if (indices.length === 0) {
      throw new PdfOptimizeError('invalid_pdf', 'empty');
    }

    const baja = await buildRepack(src);

    if (parsedLevel === 'baja') {
      return { pdf: chooseSmallest(baja.bytes, input.bytes), pageCount: baja.pageCount };
    }

    let mediaBytes: Uint8Array;
    try {
      const doc = await PDFDocument.create();
      const copied = await doc.copyPages(src, indices);
      for (const page of copied) doc.addPage(page);
      stripMetadataInPlace(doc);
      await reencodeImagesOnDocument(doc, 'media');
      mediaBytes = await doc.save({ useObjectStreams: true });
    } catch (err) {
      if (err instanceof PdfOptimizeError) throw err;
      mediaBytes = baja.bytes;
    }

    if (parsedLevel === 'media') {
      return {
        pdf: chooseSmallest(baja.bytes, mediaBytes, input.bytes),
        pageCount: baja.pageCount,
      };
    }

    let altaBytes: Uint8Array;
    try {
      const doc = await PDFDocument.create();
      const copied = await doc.copyPages(src, indices);
      for (const page of copied) doc.addPage(page);
      stripMetadataInPlace(doc);
      await reencodeImagesOnDocument(doc, 'alta');
      altaBytes = await doc.save({ useObjectStreams: true });
    } catch (err) {
      if (err instanceof PdfOptimizeError) throw err;
      altaBytes = baja.bytes;
    }

    return {
      pdf: chooseSmallest(baja.bytes, mediaBytes, altaBytes, input.bytes),
      pageCount: baja.pageCount,
    };
  })();

  try {
    return await raceTimeout(work, OPTIMIZE_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof PdfOptimizeError) throw err;
    throw new PdfOptimizeError('compress_failed', 'compress');
  }
}

import 'server-only';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

export class JpgAssemblyError extends Error {
  constructor(
    public readonly code: 'invalid_jpeg' | 'decode_failed' | 'unsupported_dimensions' | 'timeout',
    message: string,
  ) {
    super(message);
  }
}

export interface JpgAssemblyInput {
  filename: string;
  bytes: Uint8Array;
}

export interface JpgAssemblyResult {
  pdf: Uint8Array;
  count: number;
}

const ASSEMBLY_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new JpgAssemblyError('timeout', `${what} tardó demasiado`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function readDimensions(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  try {
    const meta = await sharp(bytes).metadata();
    if (meta.format !== 'jpeg') {
      throw new JpgAssemblyError('invalid_jpeg', 'El archivo no es un JPG válido');
    }
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new JpgAssemblyError('unsupported_dimensions', 'Imagen con dimensiones no válidas');
    }
    return { width, height };
  } catch (err) {
    if (err instanceof JpgAssemblyError) throw err;
    throw new JpgAssemblyError('decode_failed', 'No se pudo leer la imagen JPG');
  }
}

export async function assembleJpegsToPdf(inputs: JpgAssemblyInput[]): Promise<JpgAssemblyResult> {
  const work = (async () => {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      if (!input) throw new JpgAssemblyError('decode_failed', 'Entrada no válida');
      const { width, height } = await readDimensions(input.bytes);
      const jpg = await pdf.embedJpg(input.bytes);
      const page = pdf.addPage([width, height]);
      page.drawImage(jpg, { x: 0, y: 0, width, height });
    }
    const bytes = await pdf.save();
    return { pdf: bytes, count: inputs.length };
  })();
  return raceTimeout(work, ASSEMBLY_TIMEOUT_MS, 'Ensamblado del PDF');
}

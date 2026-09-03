export function stripPdfExtension(filename: string): string {
  const trimmed = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 120);
  return trimmed.replace(/\.pdf$/i, '') || 'pdf';
}

export function downloadNameFor(filename: string, contentType: string): string {
  const base = stripPdfExtension(filename);
  if (contentType.startsWith('application/zip')) return `${base}-paginas.zip`;
  if (contentType.startsWith('image/jpeg')) return `${base}.jpg`;
  if (contentType.startsWith('application/pdf')) return `${base}-merged.pdf`;
  return `${base}.bin`;
}

export function downloadNameForMerge(firstFilename: string | null): string {
  if (!firstFilename) return 'merged.pdf';
  const base = stripPdfExtension(firstFilename);
  if (base === 'pdf') return 'merged.pdf';
  return `${base}-merged.pdf`;
}

export function downloadNameForSplit(filename: string | null): string {
  if (!filename) return 'extracted.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'extracted.pdf';
  return `${base}-extracted.pdf`;
}

export function downloadNameForOptimize(filename: string | null): string {
  if (!filename) return 'compressed.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'compressed.pdf';
  return `${base}-optimized.pdf`;
}

export function downloadNameForOcr(filename: string | null): string {
  if (!filename) return 'ocr.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'ocr.pdf';
  // Idempotent: strip a prior "-ocr" suffix so re-running the tool doesn't
  // accumulate suffixes like "informe-ocr-ocr.pdf".
  const without = base.replace(/-ocr$/, '');
  return `${without}-ocr.pdf`;
}

export function downloadNameForRotate(filename: string | null): string {
  if (!filename) return 'rotated.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'rotated.pdf';
  return `${base}-rotated.pdf`;
}

export function downloadNameForDeletePages(filename: string | null): string {
  if (!filename) return 'sin-paginas.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'sin-paginas.pdf';
  // Idempotent: strip a prior "-sin-paginas" suffix so re-running the tool
  // doesn't accumulate suffixes like "informe-sin-paginas-sin-paginas.pdf".
  const without = base.replace(/-sin-paginas$/, '');
  return `${without}-sin-paginas.pdf`;
}

export function downloadNameForCrop(filename: string | null): string {
  if (!filename) return 'recortado.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'recortado.pdf';
  // Idempotent: strip a prior "-recortado" suffix so re-running the tool
  // doesn't accumulate suffixes like "informe-recortado-recortado.pdf".
  const without = base.replace(/-recortado$/, '');
  return `${without}-recortado.pdf`;
}

export function downloadNameForPageNumbers(filename: string | null): string {
  if (!filename) return 'numbered.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'numbered.pdf';
  return `${base}-numbered.pdf`;
}

export function downloadNameForWatermark(filename: string | null): string {
  if (!filename) return 'marcado.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'marcado.pdf';
  // Idempotent: strip a prior "-marcado" suffix so re-running the tool
  // doesn't accumulate suffixes like "informe-marcado-marcado.pdf".
  const without = base.replace(/-marcado$/, '');
  return `${without}-marcado.pdf`;
}

export function downloadNameForExtractText(filename: string | null): string {
  if (!filename) return 'texto.txt';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'texto.txt';
  return `${base}.txt`;
}

export function downloadNameForProtect(filename: string | null): string {
  if (!filename) return 'protected.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'protected.pdf';
  return `${base}-protected.pdf`;
}

export function downloadNameForUnlock(filename: string | null): string {
  if (!filename) return 'unlocked.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'unlocked.pdf';
  return `${base}-unlocked.pdf`;
}

export function downloadNameForRepair(filename: string | null): string {
  if (!filename) return 'repaired.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'repaired.pdf';
  return `${base}-repaired.pdf`;
}

export function downloadNameForSign(filename: string | null): string {
  if (!filename) return 'signed.pdf';
  const base = stripPdfExtension(filename);
  if (base === 'pdf') return 'signed.pdf';
  return `${base}-signed.pdf`;
}

// Strip any trailing .docx (or .pdf/.txt) so the basename helper is shared
// between DOCX input and DOCX output naming without forking new logic.
export function stripDocxExtension(filename: string): string {
  const trimmed = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 120);
  return trimmed.replace(/\.docx$/i, '') || 'documento';
}

export function downloadNameForPdfToWord(filename: string | null): string {
  if (!filename) return 'documento.docx';
  const base = stripDocxExtension(filename);
  if (base === 'documento') return 'documento.docx';
  return `${base}.docx`;
}

// Strip any trailing .xlsx (or .pdf/.docx/.txt) suffix so the download basename
// helper covers the XLSX output without forking new logic. Mirrors the
// stripDocxExtension shape: keep A-Za-z0-9._-, slice to 120, fallback to
// 'datos' so the basename builder always returns a non-empty string.
export function stripXlsxExtension(filename: string): string {
  const trimmed = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 120);
  return trimmed.replace(/\.xlsx$/i, '') || 'datos';
}

export function downloadNameForPdfToExcel(filename: string | null): string {
  if (!filename) return 'datos.xlsx';
  const base = stripXlsxExtension(filename);
  if (base === 'datos') return 'datos.xlsx';
  return `${base}.xlsx`;
}

export function downloadNameForDocxToPdf(filename: string | null): string {
  if (!filename) return 'documento.pdf';
  const base = stripDocxExtension(filename);
  if (base === 'documento') return 'documento.pdf';
  return `${base}.pdf`;
}

export function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8 && typeof utf8[1] === 'string') {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      return fallback;
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  if (plain && typeof plain[1] === 'string') {
    return plain[1];
  }
  return fallback;
}

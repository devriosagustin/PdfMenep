import { describe, expect, it } from 'vitest';

import {
  friendlyCompressError,
  friendlyError,
  friendlyExtractTextError,
  friendlyOptimizeError,
  friendlyPageNumbersError,
  friendlyRotateError,
  friendlySplitError,
  friendlyWatermarkError,
} from '../../src/lib/errors/friendly';

describe('pdf-merge > error parity', () => {
  it('too_few_files resolves to the Spanish copy the client island displays', () => {
    expect(friendlyError('too_few_files')).toBe('Sube al menos 2 PDFs para fusionar');
  });

  it('invalid_pdf resolves to the Spanish copy the client island displays', () => {
    expect(friendlyError('invalid_pdf', 'a.pdf')).toBe('"a.pdf" no se pudo leer como PDF');
  });

  it('bad_magic resolves to the Spanish copy the client island displays', () => {
    expect(friendlyError('bad_magic', 'a.pdf')).toBe(
      '"a.pdf" no es un PDF válido (cabecera incorrecta)',
    );
  });

  it('merge_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyError('merge_failed', 'a.pdf')).toBe(
      'No se pudieron copiar las páginas de "a.pdf"',
    );
  });

  it('timeout resolves to the Spanish copy the client island displays', () => {
    expect(friendlyError('timeout')).toBe('Fusión de PDFs tardó demasiado');
  });
});

describe('pdf-split > error parity', () => {
  it('read_form_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlySplitError('read_form_failed')).toBe('No se pudo leer el formulario');
  });

  it('invalid_pdf_meta resolves to the Spanish copy the client island displays', () => {
    expect(friendlySplitError('invalid_pdf_meta', { filename: 'a.pdf' })).toBe(
      'El PDF "a.pdf" no es válido',
    );
  });

  it('bad_magic resolves to the Spanish copy the client island displays', () => {
    expect(friendlySplitError('bad_magic', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no es un PDF válido (cabecera incorrecta)',
    );
  });

  it('selection_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlySplitError('selection_failed')).toBe(
      'No se pudieron copiar las páginas seleccionadas',
    );
  });

  it('timeout resolves to the Spanish copy the client island displays', () => {
    expect(friendlySplitError('timeout')).toBe('División de PDF tardó demasiado');
  });
});

describe('image-compress > error parity', () => {
  it('read_form_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('read_form_failed')).toBe('No se pudo leer el formulario');
  });

  it('read_file_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('read_file_failed')).toBe('No se pudo leer el archivo');
  });

  it('file_too_big resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('file_too_big', { mb: 10 })).toBe('El archivo supera 10 MB');
  });

  it('filename_too_long resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('filename_too_long')).toBe(
      'El nombre del archivo es demasiado largo',
    );
  });

  it('no_files resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('no_files')).toBe('No se subieron archivos');
  });

  it('too_many_files resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('too_many_files')).toBe('Demasiados archivos (máximo 20)');
  });

  it('invalid_quality resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('invalid_quality')).toBe('La calidad debe estar entre 1 y 100');
  });

  it('bad_magic resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('bad_magic', { filename: 'a.png' })).toBe(
      'El archivo "a.png" no es JPG, PNG ni WebP',
    );
  });

  it('not_compressible resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('not_compressible', { filename: 'a.png' })).toBe(
      'El archivo "a.png" no es JPG, PNG ni WebP',
    );
  });

  it('decode_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('decode_failed', { filename: 'a.png' })).toBe(
      'No se pudo comprimir "a.png" — el archivo podría estar dañado',
    );
  });

  it('timeout resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('timeout')).toBe('Compresión de imágenes tardó demasiado');
  });

  it('unexpected resolves to the Spanish copy the client island displays', () => {
    expect(friendlyCompressError('unexpected')).toBe('No se pudo comprimir las imágenes');
  });
});

describe('pdf-rotate > error parity', () => {
  it('bad_magic resolves to the Spanish copy the client island displays', () => {
    expect(friendlyRotateError('bad_magic', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no es un PDF válido (cabecera incorrecta)',
    );
  });

  it('invalid_pdf_meta resolves to the Spanish copy the client island displays', () => {
    expect(friendlyRotateError('invalid_pdf_meta', { filename: 'a.pdf' })).toBe(
      'El PDF "a.pdf" no es válido',
    );
  });

  it('no_rotations resolves to the Spanish copy the client island displays', () => {
    expect(friendlyRotateError('no_rotations')).toBe('Indica al menos una página para rotar');
  });

  it('out_of_range_rotation resolves to the Spanish copy the client island displays', () => {
    expect(friendlyRotateError('out_of_range_rotation', { maxPages: 100 })).toBe(
      'Alguna página está fuera del rango 1–100',
    );
  });

  it('duplicate_rotation resolves to the Spanish copy the client island displays', () => {
    expect(friendlyRotateError('duplicate_rotation', { maxPages: 100 })).toBe(
      'Hay páginas repetidas en la selección',
    );
  });

  it('invalid_pdf_password resolves to the Spanish copy the client island displays', () => {
    expect(friendlyRotateError('invalid_pdf_password')).toBe(
      'El PDF está protegido con contraseña',
    );
  });

  it('rotate_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyRotateError('rotate_failed')).toBe(
      'No se pudo rotar el PDF. Inténtalo de nuevo con otro archivo',
    );
  });

  it('timeout resolves to the Spanish copy the client island displays', () => {
    expect(friendlyRotateError('timeout')).toBe('Rotación de PDF tardó demasiado');
  });
});

describe('pdf-optimize > error parity', () => {
  it('read_form_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('read_form_failed')).toBe('No se pudo leer el formulario');
  });

  it('no_file resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('no_file')).toBe('Sube un archivo PDF en el campo "file"');
  });

  it('no_level resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('no_level')).toBe('Selecciona un nivel (Baja, Media o Alta)');
  });

  it('invalid_level resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('invalid_level')).toBe(
      'Nivel de compresión inválido. Usa "Baja", "Media" o "Alta"',
    );
  });

  it('filename_too_long resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('filename_too_long', { filename: 'a.pdf' })).toBe(
      'El nombre de "a.pdf" es demasiado largo',
    );
  });

  it('file_too_big resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('file_too_big', { mb: 60, filename: 'a.pdf' })).toBe(
      'El PDF "a.pdf" supera 60 MB',
    );
  });

  it('bad_magic resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('bad_magic', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no es un PDF válido (cabecera incorrecta)',
    );
  });

  it('invalid_pdf_meta resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('invalid_pdf_meta', { filename: 'a.pdf' })).toBe(
      'El PDF "a.pdf" no es válido',
    );
  });

  it('invalid_pdf_password resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('invalid_pdf_password')).toBe(
      'El PDF está protegido con contraseña. Quita la contraseña antes de comprimirlo',
    );
  });

  it('invalid_pdf_corrupt resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('invalid_pdf_corrupt', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no se pudo leer como PDF',
    );
  });

  it('invalid_pdf_empty resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('invalid_pdf_empty')).toBe('El PDF no tiene páginas');
  });

  it('optimize_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('optimize_failed')).toBe(
      'No se pudo comprimir el PDF. Inténtalo de nuevo con otro archivo',
    );
  });

  it('timeout resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('timeout')).toBe('Compresión de PDF tardó demasiado');
  });

  it('unexpected resolves to the Spanish copy the client island displays', () => {
    expect(friendlyOptimizeError('unexpected')).toBe('No se pudo comprimir el PDF');
  });
});

describe('pdf-page-numbers > error parity', () => {
  it('read_form_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('read_form_failed')).toBe('No se pudo leer el formulario');
  });

  it('no_file resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('no_file')).toBe('Sube un archivo PDF en el campo "file"');
  });

  it('no_position resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('no_position')).toBe('Selecciona la posición del número');
  });

  it('invalid_position resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('invalid_position')).toBe('Posición no válida');
  });

  it('no_starting_number resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('no_starting_number')).toBe(
      'Indica el número desde el que empezar',
    );
  });

  it('invalid_starting_number resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('invalid_starting_number')).toBe(
      'El número de inicio debe ser un entero mayor o igual a 1',
    );
  });

  it('filename_too_long resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('filename_too_long', { filename: 'a.pdf' })).toBe(
      'El nombre de "a.pdf" es demasiado largo',
    );
  });

  it('file_too_big resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('file_too_big', { mb: 60, filename: 'a.pdf' })).toBe(
      'El PDF "a.pdf" supera 60 MB',
    );
  });

  it('bad_magic resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('bad_magic', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no es un PDF válido (cabecera incorrecta)',
    );
  });

  it('invalid_pdf_meta resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('invalid_pdf_meta', { filename: 'a.pdf' })).toBe(
      'El PDF "a.pdf" no es válido',
    );
  });

  it('invalid_pdf_empty resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('invalid_pdf_empty')).toBe('El PDF no tiene páginas');
  });

  it('invalid_pdf_password resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('invalid_pdf_password')).toBe(
      'El PDF está protegido con contraseña',
    );
  });

  it('invalid_pdf_corrupt resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('invalid_pdf_corrupt', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no se pudo leer como PDF',
    );
  });

  it('page_numbers_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('page_numbers_failed')).toBe(
      'No se pudo numerar el PDF. Inténtalo de nuevo con otro archivo',
    );
  });

  it('timeout resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('timeout')).toBe('Numeración de PDF tardó demasiado');
  });

  it('unexpected resolves to the Spanish copy the client island displays', () => {
    expect(friendlyPageNumbersError('unexpected')).toBe('No se pudo numerar el PDF');
  });
});

describe('pdf-extract-text > error parity', () => {
  it('read_form_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('read_form_failed')).toBe('No se pudo leer el formulario');
  });

  it('no_file resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('no_file')).toBe('Sube un archivo PDF en el campo "file"');
  });

  it('file_too_big resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('file_too_big', { mb: 20, filename: 'a.pdf' })).toBe(
      'El PDF "a.pdf" supera 20 MB',
    );
  });

  it('filename_too_long resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('filename_too_long', { filename: 'a.pdf' })).toBe(
      'El nombre de "a.pdf" es demasiado largo',
    );
  });

  it('invalid_pdf_meta resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('invalid_pdf_meta', { filename: 'a.pdf' })).toBe(
      'El PDF "a.pdf" no es válido',
    );
  });

  it('bad_magic resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('bad_magic', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no es un PDF válido (cabecera incorrecta)',
    );
  });

  it('invalid_pdf_password resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('invalid_pdf_password')).toBe(
      'El PDF está protegido con contraseña. Quita la contraseña antes de extraer el texto',
    );
  });

  it('invalid_pdf_empty resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('invalid_pdf_empty')).toBe('El PDF no tiene páginas');
  });

  it('invalid_pdf_corrupt resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('invalid_pdf_corrupt', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no se pudo leer como PDF',
    );
  });

  it('extract_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('extract_failed')).toBe(
      'No se pudo extraer el texto del PDF. Inténtalo de nuevo con otro archivo',
    );
  });

  it('timeout resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('timeout')).toBe('Extracción de texto del PDF tardó demasiado');
  });

  it('unexpected resolves to the Spanish copy the client island displays', () => {
    expect(friendlyExtractTextError('unexpected')).toBe('No se pudo extraer el texto del PDF');
  });
});

describe('pdf-watermark > error parity', () => {
  it('read_form_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyWatermarkError('read_form_failed')).toBe('No se pudo leer el formulario');
  });

  it('no_file resolves to the Spanish copy the client island displays', () => {
    expect(friendlyWatermarkError('no_file')).toBe('Sube un archivo PDF en el campo "file"');
  });

  it('no_mode resolves to the Spanish copy the client island displays', () => {
    expect(friendlyWatermarkError('no_mode')).toBe(
      'Selecciona el tipo de marca de agua (Texto o Imagen)',
    );
  });

  it('invalid_position resolves to the Spanish copy the client island displays', () => {
    expect(friendlyWatermarkError('invalid_position')).toBe('Posición no válida');
  });

  it('invalid_opacity resolves to the Spanish copy the client island displays', () => {
    expect(friendlyWatermarkError('invalid_opacity')).toBe('La opacidad debe estar entre 10 y 100');
  });

  it('invalid_tilt resolves to the Spanish copy the client island displays', () => {
    expect(friendlyWatermarkError('invalid_tilt')).toBe('Ángulo no válido (-45°, 0° o 45°)');
  });

  it('image_required resolves to the Spanish copy the client island displays', () => {
    expect(friendlyWatermarkError('image_required')).toBe(
      'Sube una imagen PNG o JPG para la marca de agua',
    );
  });

  it('invalid_pdf_password resolves to the Spanish copy the client island displays', () => {
    expect(friendlyWatermarkError('invalid_pdf_password')).toBe(
      'El PDF está protegido con contraseña',
    );
  });

  it('watermark_failed resolves to the Spanish copy the client island displays', () => {
    expect(friendlyWatermarkError('watermark_failed')).toBe(
      'No se pudo añadir la marca de agua. Inténtalo de nuevo con otro archivo',
    );
  });

  it('timeout resolves to the Spanish copy the client island displays', () => {
    expect(friendlyWatermarkError('timeout')).toBe('Marca de agua tardó demasiado');
  });
});

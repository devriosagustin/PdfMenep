/**
 * Factor por el cual escalan los límites de uso (tamaño de subida, cantidad
 * de archivos/firmantes, etc.) para el plan PRO respecto del límite FREE ya
 * definido en cada src/lib/contracts/*.ts. Vive en su propio módulo — sin
 * 'server-only', sin imports de auth/prisma — porque los contracts se
 * importan tanto en server (route handlers) como en client islands
 * (validación de UI antes de subir), y plan-limits.ts también lo usa.
 */
export const PRO_SCALE = 3;

import 'server-only';

import { auth } from '@/auth';
import { PRO_SCALE } from '@/lib/billing/plan-scale';
import { prisma } from '@/lib/db';

export type PlanTier = 'FREE' | 'PRO';

/**
 * Plan efectivo del usuario logueado, o 'FREE' si no hay sesión.
 *
 * Deliberadamente NO usamos `session.user.plan` (el valor queda grabado en
 * el JWT al iniciar sesión y no se actualiza solo cuando el webhook de
 * Mercado Pago cambia el plan en la base). Para decidir límites de uso reales
 * preferimos una consulta extra a Postgres antes que arriesgarnos a aplicar
 * límites FREE a un usuario que ya pagó PRO (o viceversa).
 */
export async function getCurrentPlan(): Promise<PlanTier> {
  const session = await auth();
  if (!session?.user?.id) return 'FREE';
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true },
  });
  return user?.plan === 'PRO' ? 'PRO' : 'FREE';
}

/**
 * Escala un límite (bytes, cantidad de páginas, cantidad de archivos, etc.)
 * según el plan. Pasále `proOverride` cuando el factor por defecto no tenga
 * sentido para ese límite puntual (por ejemplo, un tope que ya es chico).
 */
export function scaleForPlan(freeLimit: number, plan: PlanTier, proOverride?: number): number {
  if (plan !== 'PRO') return freeLimit;
  return proOverride ?? freeLimit * PRO_SCALE;
}

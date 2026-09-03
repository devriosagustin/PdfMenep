import 'server-only';
import { prisma } from '@/lib/db';

export type ToolEventInput = {
  tool: string;
  result: 'SUCCESS' | 'FAILURE';
  errorCode?: string;
  inputBytes?: number;
  outputBytes?: number;
  durationMs?: number;
};

export async function recordToolEvent(input: ToolEventInput): Promise<void> {
  try {
    await prisma.toolEvent.create({ data: input });
  } catch {
    // Métricas de uso son best-effort: nunca deben romper la operación que el
    // usuario está ejecutando (misma lógica que el contador client-side).
  }
}

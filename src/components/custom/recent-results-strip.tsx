'use client';

import { Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useLocalHistory } from '@/lib/hooks/use-local-history';
import { cn } from '@/lib/utils';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dateFmt = new Intl.DateTimeFormat('es', { month: 'short', year: '2-digit' });

function dateLabel(ts: number): string {
  return dateFmt.format(new Date(ts)).toLowerCase();
}

export type RecentResultsStripProps = {
  slug: string;
  title?: string;
  emptyLabel?: string;
  className?: string;
};

export function RecentResultsStrip({
  slug,
  title = 'Resultados recientes',
  emptyLabel = 'Aún no hay conversiones recientes en este navegador.',
  className,
}: RecentResultsStripProps) {
  const { items, clear, isReady } = useLocalHistory(slug);

  if (!isReady) return null;

  const hasItems = items.length > 0;

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>{title}</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => clear()}
          disabled={!hasItems}
          aria-label="Borrar todo"
        >
          <Trash2 aria-hidden="true" />
          <span>Borrar todo</span>
        </Button>
      </CardHeader>
      <CardContent>
        {hasItems ? (
          <ul className="flex flex-col">
            {items.map((item, idx) => (
              <li key={item.id} className="flex flex-col">
                {idx > 0 ? <Separator className="my-2" /> : null}
                <div className="grid grid-cols-1 items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto] sm:gap-y-0">
                  <span className="truncate" title={item.inputName}>
                    {item.inputName}
                  </span>
                  <span aria-hidden="true" className="text-muted-foreground sm:text-center">
                    →
                  </span>
                  <span className="truncate" title={item.outputName}>
                    {item.outputName}
                  </span>
                  <Badge variant="secondary">{item.outputFormat}</Badge>
                  <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground tabular-nums sm:justify-self-end sm:text-sm">
                    <span>{humanSize(item.outputSizeBytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{dateLabel(item.ts)}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

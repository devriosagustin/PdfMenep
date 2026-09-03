import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { HerramientaPdf } from '@/lib/herramientas-pdf-catalog';

export function HerramientasPdfGrid({ items }: { items: readonly HerramientaPdf[] }) {
  return (
    <ul className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.key} className="h-full">
          <Card className="lift flex h-full flex-col border-border/70 bg-card">
            <CardHeader>
              <CardTitle className="text-h4">{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button type="button" asChild variant="default" className="w-full justify-between">
                <Link href={item.href} aria-label={`Abrir ${item.title}`}>
                  Abrir herramienta
                  <span aria-hidden="true">→</span>
                </Link>
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

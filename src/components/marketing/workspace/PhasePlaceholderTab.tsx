'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Construction } from 'lucide-react';

interface PhasePlaceholderTabProps {
  title: string;
  phase: string;
  description: string;
}

export function PhasePlaceholderTab({ title, phase, description }: PhasePlaceholderTabProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Construction className="h-10 w-10 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Badge variant="secondary">{phase}</Badge>
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

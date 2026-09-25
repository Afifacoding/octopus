import type { PropsWithChildren } from 'react';

type BadgeTone = 'ok' | 'warn' | 'neutral';

type BadgeProps = PropsWithChildren<{
  tone?: BadgeTone;
}>;

export function Badge({ children, tone = 'ok' }: BadgeProps) {
  const toneClass =
    tone === 'ok' ? 'badge-ok' : tone === 'warn' ? 'badge-bad' : 'badge-neutral';

  return <span className={`badge ${toneClass}`}>{children}</span>;
}

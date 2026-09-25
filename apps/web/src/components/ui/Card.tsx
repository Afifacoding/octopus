import type { HTMLAttributes, PropsWithChildren } from 'react';

type CardProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
    compact?: boolean;
  }
>;

export function Card({ children, compact = false, className = '', ...props }: CardProps) {
  const classes = [compact ? 'card-sm' : 'card', className].join(' ').trim();

  return (
    <section className={classes} {...props}>
      {children}
    </section>
  );
}

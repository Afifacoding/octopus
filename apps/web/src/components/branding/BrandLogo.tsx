type BrandLogoProps = {
  variant?: 'full' | 'mark';
  className?: string;
};

export function BrandLogo({ variant = 'full', className }: BrandLogoProps) {
  const isFull = variant === 'full';
  const classes = ['brand-logo', `brand-logo-${variant}`, className].filter(Boolean).join(' ');

  return (
    <img
      className={classes}
      src={isFull ? '/branding/octopus-ghost-logo.png' : '/branding/octopus-ghost-mark.png'}
      alt={isFull ? 'OCTOPUS Ghost Protocol' : ''}
      aria-hidden={isFull ? undefined : true}
      width={isFull ? 1280 : 512}
      height={isFull ? 1280 : 512}
    />
  );
}

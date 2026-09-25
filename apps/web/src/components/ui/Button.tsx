import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
  }
>;

export function Button({ children, className = '', variant = 'primary', ...props }: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, className].join(' ').trim();

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

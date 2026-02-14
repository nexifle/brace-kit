import type { ReactNode, ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  title?: string;
  size?: 'sm' | 'md';
}

export function IconButton({
  children,
  title,
  size = 'md',
  className = '',
  ...props
}: IconButtonProps) {
  const sizeClasses = {
    sm: 'icon-btn-sm',
    md: 'icon-btn',
  };

  const classes = [sizeClasses[size], className].filter(Boolean).join(' ');

  return (
    <button className={classes} title={title} {...props}>
      {children}
    </button>
  );
}

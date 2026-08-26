import type { ReactNode, ButtonHTMLAttributes } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
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
    sm: 'flex items-center justify-center w-7 h-7 border-none bg-transparent text-muted-foreground rounded-md cursor-pointer transition-all duration-150 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
    md: 'flex items-center justify-center w-8 h-8 border-none bg-transparent text-muted-foreground rounded-md cursor-pointer transition-all duration-150 hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
  };

  const classes = [sizeClasses[size], className].filter(Boolean).join(' ');

  return (
    <button className={classes} title={title} {...props}>
      {children}
    </button>
  );
}

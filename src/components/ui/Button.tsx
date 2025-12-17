'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
    size?: 'sm' | 'md' | 'lg';
    block?: boolean;
    children: ReactNode;
}

export function Button({
    variant = 'primary',
    size = 'md',
    block = false,
    className = '',
    children,
    ...props
}: ButtonProps) {
    const classes = [
        'btn',
        `btn-${variant}`,
        size === 'sm' && 'btn-sm',
        block && 'btn-block',
        className
    ].filter(Boolean).join(' ');

    return (
        <button className={classes} {...props}>
            {children}
        </button>
    );
}

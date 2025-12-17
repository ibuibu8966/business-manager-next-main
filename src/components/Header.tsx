'use client';

import { useAuth } from '@/lib/auth';
import { Button } from './ui/Button';

interface HeaderProps {
    title: string;
    onToggleSidebar: () => void;
}

export function Header({ title, onToggleSidebar }: HeaderProps) {
    const { user, logout } = useAuth();

    const now = new Date();
    const dateStr = now.toLocaleDateString('ja-JP', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    });

    return (
        <header id="main-header">
            <button
                id="sidebar-toggle"
                className="btn btn-ghost"
                onClick={onToggleSidebar}
            >
                ☰
            </button>

            <h1 id="page-title">{title}</h1>

            <div className="header-actions">
                <span id="current-date">{dateStr}</span>
            </div>
        </header>
    );
}

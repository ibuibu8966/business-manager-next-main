'use client';

import { useState, ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
    children: ReactNode;
    title: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const { user, logout } = useAuth();

    return (
        <div id="main-screen">
            <Sidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
                isAdmin={user?.isAdmin}
            />

            <main id="main-content">
                <Header
                    title={title}
                    onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
                />

                <div id="page-content">
                    {children}
                </div>
            </main>

            <div className="sidebar-footer">
                <div className="user-info">
                    <span>{user?.name}</span>
                    <span className={`badge ${user?.isAdmin ? 'badge-admin' : 'badge-user'}`}>
                        {user?.isAdmin ? '管理者' : 'スタッフ'}
                    </span>
                </div>
                <button className="btn btn-ghost btn-block" onClick={logout}>
                    ログアウト
                </button>
            </div>
        </div>
    );
}

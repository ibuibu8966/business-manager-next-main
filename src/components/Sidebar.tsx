'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
    { path: '/', icon: '📊', label: 'ダッシュボード' },
    { path: '/kpi', icon: '🎯', label: 'KPI達成率' },
    { path: '/tasks', icon: '✅', label: 'タスク管理' },
    { path: '/recurring-tasks', icon: '🔁', label: '繰り返しタスク' },
    { path: '/tickets', icon: '🎫', label: 'チケット管理' },
    { path: '/customers', icon: '👥', label: '顧客・対応履歴' },
    { path: '/lending', icon: '💰', label: '貸借・口座管理' },
    { path: '/accounting', icon: '📈', label: '管理会計' },
    { path: '/businesses', icon: '🏢', label: '事業管理' },
    { path: '/users', icon: '👤', label: 'ユーザー管理', adminOnly: true },
];

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
    isAdmin?: boolean;
}

export function Sidebar({ collapsed, onToggle, isAdmin = false }: SidebarProps) {
    const pathname = usePathname();

    const filteredItems = navItems.filter(item => !item.adminOnly || isAdmin);

    return (
        <aside id="sidebar" className={collapsed ? 'collapsed' : ''}>
            <div className="sidebar-header">
                <span className="logo">💼</span>
                <span className="logo-text">業務管理</span>
            </div>

            <nav>
                <ul className="nav-menu">
                    {filteredItems.map(item => (
                        <li key={item.path}>
                            <Link
                                href={item.path}
                                className={`nav-item ${pathname === item.path ? 'active' : ''}`}
                            >
                                <span className="nav-icon">{item.icon}</span>
                                <span className="nav-text">{item.label}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
        </aside>
    );
}

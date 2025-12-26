'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Task } from '@/types';

// 今週の範囲（月曜〜日曜）
const getWeekRange = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
};

// 今月の範囲
const getMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
};

// 日付フォーマット
const formatDate = (date: Date) => {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}（${days[date.getDay()]}）`;
};

// KPIカードコンポーネント
interface KpiCardProps {
    title: string;
    completedCount: number;
    totalCount: number;
    rate: number;
}

const KpiCard = ({ title, completedCount, totalCount, rate }: KpiCardProps) => {
    const getColor = (rate: number) => {
        if (rate >= 70) return 'var(--success)';
        if (rate >= 40) return 'var(--warning)';
        return 'var(--danger)';
    };

    return (
        <div className="card" style={{ padding: '1.5rem' }}>
            <h4 style={{ marginBottom: '0.5rem' }}>{title}</h4>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: getColor(rate) }}>
                {rate}%
            </div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                完了: {completedCount}/{totalCount}件
            </div>
            <div style={{
                height: '8px',
                background: 'var(--bg-tertiary)',
                borderRadius: '4px',
                overflow: 'hidden'
            }}>
                <div style={{
                    width: `${rate}%`,
                    height: '100%',
                    background: getColor(rate),
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                }} />
            </div>
        </div>
    );
};

function KpiContent() {
    const { db } = useDatabase();
    const { user } = useAuth();
    const [viewType, setViewType] = useState<'business' | 'user'>('business');
    const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');

    if (!db) return <div>Loading...</div>;

    // 期間の取得
    const range = period === 'weekly' ? getWeekRange() : getMonthRange();

    // 権限によるタスクのフィルタリング
    const baseTasks = user?.isAdmin
        ? db.tasks
        : db.tasks.filter(t => t.assigneeId === user?.id);

    // 期間内のタスクを取得
    const getTasksInPeriod = (tasks: Task[]) => {
        return tasks.filter(t => {
            const createdAt = new Date(t.createdAt);
            return createdAt >= range.start && createdAt <= range.end;
        });
    };

    // 完了率を計算
    const calculateCompletionRate = (tasks: Task[]) => {
        if (tasks.length === 0) return 0;
        const completed = tasks.filter(t => t.status === '完了').length;
        return Math.round((completed / tasks.length) * 100);
    };

    // 事業別KPIデータ
    const getBusinessKpiData = () => {
        const businessIds = [...new Set(baseTasks.map(t => t.businessId))];

        return businessIds.map(businessId => {
            const business = businessId ? db.businesses.find(b => b.id === businessId) : null;
            const tasks = baseTasks.filter(t => t.businessId === businessId);
            const tasksInPeriod = getTasksInPeriod(tasks);
            const completedCount = tasksInPeriod.filter(t => t.status === '完了').length;
            const rate = calculateCompletionRate(tasksInPeriod);

            return {
                id: businessId || 0,
                title: business?.name || '未設定',
                completedCount,
                totalCount: tasksInPeriod.length,
                rate
            };
        }).sort((a, b) => b.totalCount - a.totalCount);
    };

    // ユーザー別KPIデータ
    const getUserKpiData = () => {
        // スタッフの場合は自分だけ表示
        if (!user?.isAdmin) {
            const myTasks = baseTasks.filter(t => t.assigneeId === user?.id);
            const tasksInPeriod = getTasksInPeriod(myTasks);
            const completedCount = tasksInPeriod.filter(t => t.status === '完了').length;
            const rate = calculateCompletionRate(tasksInPeriod);

            return [{
                id: user?.id || 0,
                title: user?.name || '自分',
                completedCount,
                totalCount: tasksInPeriod.length,
                rate
            }];
        }

        // 管理者の場合は全ユーザー表示
        const userIds = [...new Set(db.tasks.map(t => t.assigneeId).filter(Boolean))];

        return userIds.map(userId => {
            const assignee = db.users.find(u => u.id === userId);
            const tasks = db.tasks.filter(t => t.assigneeId === userId);
            const tasksInPeriod = getTasksInPeriod(tasks);
            const completedCount = tasksInPeriod.filter(t => t.status === '完了').length;
            const rate = calculateCompletionRate(tasksInPeriod);

            return {
                id: userId || 0,
                title: assignee?.name || '不明',
                completedCount,
                totalCount: tasksInPeriod.length,
                rate
            };
        }).sort((a, b) => b.totalCount - a.totalCount);
    };

    const kpiData = viewType === 'business' ? getBusinessKpiData() : getUserKpiData();

    // 全体の統計
    const allTasksInPeriod = getTasksInPeriod(baseTasks);
    const totalCompleted = allTasksInPeriod.filter(t => t.status === '完了').length;
    const totalRate = calculateCompletionRate(allTasksInPeriod);

    return (
        <AppLayout title="KPI達成率">
            <div className="page-header">
                <h3>KPI達成率</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                        variant={period === 'weekly' ? 'primary' : 'secondary'}
                        onClick={() => setPeriod('weekly')}
                    >
                        週次
                    </Button>
                    <Button
                        variant={period === 'monthly' ? 'primary' : 'secondary'}
                        onClick={() => setPeriod('monthly')}
                    >
                        月次
                    </Button>
                </div>
            </div>

            {/* タブ切り替え */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <Button
                    variant={viewType === 'business' ? 'primary' : 'ghost'}
                    onClick={() => setViewType('business')}
                >
                    事業別
                </Button>
                <Button
                    variant={viewType === 'user' ? 'primary' : 'ghost'}
                    onClick={() => setViewType('user')}
                >
                    ユーザー別
                </Button>
            </div>

            {/* 期間表示 */}
            <div style={{
                padding: '0.75rem 1rem',
                background: 'var(--bg-secondary)',
                borderRadius: '8px',
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span>
                    期間: {formatDate(range.start)} 〜 {formatDate(range.end)}
                </span>
                {!user?.isAdmin && (
                    <span className="badge badge-secondary">自分のタスクのみ</span>
                )}
            </div>

            {/* 全体統計 */}
            <div className="card" style={{
                padding: '1.5rem',
                marginBottom: '1.5rem',
                background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, #4f46e5) 100%)',
                color: 'white'
            }}>
                <h4 style={{ marginBottom: '0.5rem', opacity: 0.9 }}>
                    {period === 'weekly' ? '今週' : '今月'}の全体達成率
                </h4>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <span style={{ fontSize: '3rem', fontWeight: 'bold' }}>{totalRate}%</span>
                    <span style={{ opacity: 0.8 }}>（{totalCompleted}/{allTasksInPeriod.length}件完了）</span>
                </div>
            </div>

            {/* KPIカード一覧 */}
            {kpiData.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📊</div>
                    <div className="empty-state-text">
                        {period === 'weekly' ? '今週' : '今月'}のタスクがありません
                    </div>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '1rem'
                }}>
                    {kpiData.map(item => (
                        <KpiCard
                            key={item.id}
                            title={item.title}
                            completedCount={item.completedCount}
                            totalCount={item.totalCount}
                            rate={item.rate}
                        />
                    ))}
                </div>
            )}
        </AppLayout>
    );
}

export default function KpiPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <KpiContent />;
}

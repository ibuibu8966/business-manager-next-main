'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase } from '@/lib/db';
import { Button } from '@/components/ui/Button';

function DashboardContent() {
  const { db, isLoading: dbLoading, updateCollection } = useDatabase();
  const { user } = useAuth();

  if (dbLoading || !db) {
    return <div>Loading...</div>;
  }

  const now = new Date();

  // showAfterが未来のタスクは非表示
  const visibleTasks = db.tasks.filter(t => {
    if (t.showAfter) return new Date(t.showAfter) <= now;
    return true;
  });

  const myTasks = visibleTasks.filter(t => t.status !== '完了');
  const myTickets = db.tickets.filter(t => t.status !== '完了');
  const totalIncome = db.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpense = db.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  // 貸借情報の計算
  const activeAccounts = db.accounts.filter(a => !a.isArchived);
  const activePersons = db.persons.filter(p => !p.isArchived);
  const totalAccountBalance = activeAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);

  const getPersonBalance = (personId: number) => {
    return db.lendings
      .filter(l =>
        ((l.counterpartyType === 'person' && l.counterpartyId === personId) ||
         (!l.counterpartyType && l.personId === personId)) &&
        !l.returned
      )
      .reduce((sum, l) => sum + l.amount, 0);
  };

  const totalLent = activePersons.reduce((s, p) => {
    const b = getPersonBalance(p.id);
    return b > 0 ? s + b : s;
  }, 0);

  const totalBorrowed = activePersons.reduce((s, p) => {
    const b = getPersonBalance(p.id);
    return b < 0 ? s + Math.abs(b) : s;
  }, 0);

  // 統合履歴（貸借 + 口座取引）
  const recentLendingHistory = [
    ...db.lendings.map(l => ({
      id: `lending-${l.id}`,
      date: l.date,
      displayType: l.type === 'return' ? '返済' : (l.amount > 0 ? '貸し' : '借り'),
      amount: l.amount,
      typeClass: l.type === 'return' ? 'return' : (l.amount > 0 ? 'lend' : 'borrow')
    })),
    ...(db.accountTransactions || []).map(t => ({
      id: `transaction-${t.id}`,
      date: t.date,
      displayType: t.type === 'transfer' ? '振替' : (t.type === 'interest' ? '受取利息' : (t.amount < 0 ? '運用損' : '運用益')),
      amount: t.amount,
      typeClass: t.type === 'transfer' ? 'transfer' : 'income'
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  // 期限超過タスク
  const overdueTasks = myTasks.filter(t => t.dueDate && new Date(t.dueDate) < now);

  // 未読通知（管理者向け）
  const unreadNotifications = user?.isAdmin
    ? db.notifications.filter(n => n.userId === user.id && !n.isRead)
    : [];

  // 最近の更新履歴（管理者向け）
  const recentHistories = user?.isAdmin
    ? [...db.taskHistories]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
    : [];

  // 通知を既読にする
  const markAsRead = (notifId: number) => {
    updateCollection('notifications', notifs =>
      notifs.map(n => n.id === notifId ? { ...n, isRead: true } : n)
    );
  };

  const markAllAsRead = () => {
    updateCollection('notifications', notifs =>
      notifs.map(n => n.userId === user?.id ? { ...n, isRead: true } : n)
    );
  };

  return (
    <AppLayout title="ダッシュボード">
      {/* 期限超過アラート */}
      {overdueTasks.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05))',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px'
        }}>
          <h4 style={{ color: 'var(--danger)', marginBottom: '12px' }}>
            ⚠️ 期限超過タスク ({overdueTasks.length}件)
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {overdueTasks.slice(0, 5).map(task => (
              <div key={task.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'var(--bg-secondary)',
                borderRadius: '4px'
              }}>
                <span>{task.title}</span>
                <span style={{ fontSize: '12px', color: 'var(--danger)' }}>
                  期限: {task.dueDate}
                </span>
              </div>
            ))}
          </div>
          <Link href="/tasks" style={{
            display: 'inline-block',
            marginTop: '12px',
            color: 'var(--primary)',
            fontSize: '14px'
          }}>
            タスク管理へ →
          </Link>
        </div>
      )}

      {/* 未読通知（管理者向け） */}
      {user?.isAdmin && unreadNotifications.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.05))',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ color: 'var(--primary)' }}>
              🔔 新しい通知 ({unreadNotifications.length}件)
            </h4>
            <Button size="sm" variant="ghost" onClick={markAllAsRead}>すべて既読</Button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {unreadNotifications.slice(0, 5).map(notif => {
              const task = db.tasks.find(t => t.id === notif.taskId);
              return (
                <div key={notif.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '4px'
                }}>
                  <div>
                    <div style={{ fontSize: '13px' }}>{notif.message}</div>
                    {task && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>タスク: {task.title}</div>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => markAsRead(notif.id)}>✓</Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-info">
            <span className="stat-value">{myTasks.length}</span>
            <span className="stat-label">未完了タスク</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🎫</div>
          <div className="stat-info">
            <span className="stat-value">{myTickets.length}</span>
            <span className="stat-label">対応中チケット</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <span className="stat-value">{db.customers.length}</span>
            <span className="stat-label">顧客数</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-info">
            <span className="stat-value">¥{(totalIncome - totalExpense).toLocaleString()}</span>
            <span className="stat-label">今月の利益</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💳</div>
          <div className="stat-info">
            <span className="stat-value">¥{totalAccountBalance.toLocaleString()}</span>
            <span className="stat-label">口座残高合計</span>
            <div style={{ marginTop: '4px', fontSize: '11px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--success)', whiteSpace: 'nowrap' }}>貸: ¥{totalLent.toLocaleString()}</span>
              <span style={{ color: 'var(--danger)', whiteSpace: 'nowrap' }}>借: ¥{totalBorrowed.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-sections">
        <div className="dashboard-section">
          <h3>📋 最近のタスク</h3>
          <div className="list-container">
            {myTasks.slice(0, 5).map(task => {
              const isOverdue = task.dueDate && new Date(task.dueDate) < now;
              return (
                <div key={task.id} className="list-item" style={isOverdue ? { borderLeft: '3px solid var(--danger)' } : {}}>
                  <span className={`badge badge-${task.status === '進行中' ? 'active' : 'pending'}`}>
                    {task.status}
                  </span>
                  <span className="list-item-title">{task.title}</span>
                  {isOverdue && <span style={{ color: 'var(--danger)', fontSize: '11px' }}>超過</span>}
                </div>
              );
            })}
            {myTasks.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>タスクがありません</p>
            )}
          </div>
        </div>

        {/* 管理者向け: 最近の更新 */}
        {user?.isAdmin && recentHistories.length > 0 ? (
          <div className="dashboard-section">
            <h3>📝 チームの更新</h3>
            <div className="list-container">
              {recentHistories.map(h => {
                const task = db.tasks.find(t => t.id === h.taskId);
                const historyUser = db.users.find(u => u.id === h.userId);
                return (
                  <div key={h.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(h.createdAt).toLocaleString('ja-JP')} - {historyUser?.name}
                    </div>
                    <div style={{ fontSize: '13px' }}>
                      <strong>{task?.title || '?'}</strong>: {h.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="dashboard-section">
            <h3>🎫 最近のチケット</h3>
            <div className="list-container">
              {myTickets.slice(0, 5).map(ticket => (
                <div key={ticket.id} className="list-item">
                  <span className={`badge badge-${ticket.status === '対応中' ? 'active' : 'pending'}`}>
                    {ticket.status}
                  </span>
                  <span className="list-item-title">{ticket.title}</span>
                </div>
              ))}
              {myTickets.length === 0 && (
                <p style={{ color: 'var(--text-muted)' }}>チケットがありません</p>
              )}
            </div>
          </div>
        )}

        {/* 貸借・取引履歴 */}
        <div className="dashboard-section">
          <h3>💰 最近の貸借・取引</h3>
          <div className="list-container">
            {recentLendingHistory.map(item => (
              <div key={item.id} className="list-item">
                <span className={`lending-type ${item.typeClass}`}>
                  {item.displayType}
                </span>
                <span className="list-item-title">
                  ¥{Math.abs(item.amount).toLocaleString()}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.date}</span>
              </div>
            ))}
            {recentLendingHistory.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>履歴がありません</p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)'
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  return <DashboardContent />;
}

export default function HomePage() {
  return <AppContent />;
}

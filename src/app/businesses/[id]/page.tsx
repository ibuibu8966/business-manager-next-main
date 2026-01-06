'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Business, Manual, Checklist, Contract, Task, FixedCost, Account } from '@/types';

type TabType = 'manuals' | 'checklists' | 'contracts' | 'tasks' | 'fixedCosts' | 'accounts';

function BusinessDetailContent() {
    const params = useParams();
    const router = useRouter();
    const { db, updateCollection } = useDatabase();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('manuals');
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [manualModalOpen, setManualModalOpen] = useState(false);
    const [checklistModalOpen, setChecklistModalOpen] = useState(false);
    const [contractModalOpen, setContractModalOpen] = useState(false);
    const [taskModalOpen, setTaskModalOpen] = useState(false);
    const [fixedCostModalOpen, setFixedCostModalOpen] = useState(false);
    const [accountModalOpen, setAccountModalOpen] = useState(false);
    const [showArchived, setShowArchived] = useState(false);

    const businessId = Number(params.id);

    if (!db) return <div>Loading...</div>;

    const business = db.businesses.find(b => b.id === businessId);

    if (!business) {
        return (
            <AppLayout title="事業が見つかりません">
                <div className="empty-state">
                    <div className="empty-state-icon">🏢</div>
                    <div className="empty-state-text">事業が見つかりません</div>
                    <Link href="/businesses">
                        <Button>事業一覧へ戻る</Button>
                    </Link>
                </div>
            </AppLayout>
        );
    }

    // データ取得
    const manuals = db.manuals.filter(m =>
        m.businessId === businessId && (showArchived || !m.isArchived)
    );
    const checklists = db.checklists.filter(c =>
        c.businessId === businessId && (showArchived || !c.isArchived)
    );
    const contracts = db.contracts.filter(c => c.businessId === businessId);
    const tasks = db.tasks.filter(t => t.businessId === businessId);
    const fixedCosts = db.fixedCosts.filter(f => f.businessId === businessId);
    const accounts = db.accounts.filter(a =>
        a.businessId === businessId && (showArchived || !a.isArchived)
    );

    // 収支サマリー計算
    const transactions = db.transactions.filter(t => t.businessId === businessId);
    const totalIncome = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    const profit = totalIncome - totalExpense;

    // 固定費月額合計
    const monthlyFixedCost = fixedCosts
        .filter(f => f.isActive)
        .reduce((sum, f) => sum + f.amount, 0);

    // タスクステータスカウント
    const taskStats = useMemo(() => ({
        pending: tasks.filter(t => t.status === '未着手').length,
        inProgress: tasks.filter(t => t.status === '進行中').length,
        completed: tasks.filter(t => t.status === '完了').length,
    }), [tasks]);

    const saveBusiness = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        updateCollection('businesses', items =>
            items.map(b => b.id === businessId ? {
                ...b,
                name: formData.get('name') as string,
                description: formData.get('description') as string,
            } : b)
        );
        setEditModalOpen(false);
    };

    const createManual = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const type = formData.get('type') as 'pdf' | 'url';

        const newManual: Manual = {
            id: genId(db.manuals),
            businessId,
            name: formData.get('name') as string,
            type,
            content: type === 'url' ? formData.get('url') as string : undefined,
            description: formData.get('description') as string || undefined,
            createdAt: new Date().toISOString(),
        };

        updateCollection('manuals', items => [...items, newManual]);
        setManualModalOpen(false);
    };

    const createChecklist = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const newChecklist: Checklist = {
            id: genId(db.checklists),
            businessId,
            title: formData.get('title') as string,
            description: formData.get('description') as string || undefined,
            blocks: [{ id: '1', type: 'checkbox', children: [{ text: '' }], checked: false }],
            createdAt: new Date().toISOString(),
        };

        updateCollection('checklists', items => [...items, newChecklist]);
        setChecklistModalOpen(false);
        router.push(`/businesses/${businessId}/checklists/${newChecklist.id}`);
    };

    const createContract = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const newContract: Contract = {
            id: genId(db.contracts),
            businessId,
            name: formData.get('name') as string,
            memo: formData.get('memo') as string || undefined,
            fileName: formData.get('fileName') as string || undefined,
            createdAt: new Date().toISOString(),
        };

        updateCollection('contracts', items => [...items, newContract]);
        setContractModalOpen(false);
    };

    const createTask = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const newTask: Task = {
            id: genId(db.tasks),
            title: formData.get('title') as string,
            description: formData.get('description') as string || undefined,
            userId: user?.id || 1,
            businessId,
            status: '未着手',
            priority: formData.get('priority') as 'high' | 'medium' | 'low' || 'medium',
            dueDate: formData.get('dueDate') as string || undefined,
            createdAt: new Date().toISOString(),
        };

        updateCollection('tasks', items => [...items, newTask]);
        setTaskModalOpen(false);
    };

    const updateTaskStatus = (taskId: number, status: Task['status']) => {
        updateCollection('tasks', items =>
            items.map(t => t.id === taskId ? { ...t, status } : t)
        );
    };

    const createFixedCost = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const newFixedCost: FixedCost = {
            id: genId(db.fixedCosts),
            businessId,
            category: formData.get('category') as string,
            amount: Number(formData.get('amount')),
            dayOfMonth: Number(formData.get('dayOfMonth')),
            accountId: formData.get('accountId') ? Number(formData.get('accountId')) : undefined,
            memo: formData.get('memo') as string || undefined,
            isActive: true,
        };

        updateCollection('fixedCosts', items => [...items, newFixedCost]);
        setFixedCostModalOpen(false);
    };

    const toggleFixedCostActive = (id: number) => {
        updateCollection('fixedCosts', items =>
            items.map(f => f.id === id ? { ...f, isActive: !f.isActive } : f)
        );
    };

    const createAccount = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const newAccount: Account = {
            id: genId(db.accounts),
            name: formData.get('name') as string,
            businessId,
            balance: formData.get('balance') ? Number(formData.get('balance')) : undefined,
        };

        updateCollection('accounts', items => [...items, newAccount]);
        setAccountModalOpen(false);
    };

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);

    const getPriorityLabel = (priority?: string) => {
        switch (priority) {
            case 'high': return '高';
            case 'low': return '低';
            default: return '中';
        }
    };

    const getPriorityColor = (priority?: string) => {
        switch (priority) {
            case 'high': return 'var(--error)';
            case 'low': return 'var(--text-muted)';
            default: return 'var(--warning)';
        }
    };

    return (
        <AppLayout title={business.name}>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href="/businesses" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                        ← 戻る
                    </Link>
                    <h3>{business.name}</h3>
                </div>
                <Button onClick={() => setEditModalOpen(true)} variant="secondary">
                    編集
                </Button>
            </div>

            {business.description && (
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                    {business.description}
                </p>
            )}

            {/* 収支サマリーカード */}
            <div className="summary-cards" style={{ marginBottom: '24px' }}>
                <div className="summary-card">
                    <div className="summary-label">売上合計</div>
                    <div className="summary-value" style={{ color: 'var(--success)' }}>
                        {formatCurrency(totalIncome)}
                    </div>
                </div>
                <div className="summary-card">
                    <div className="summary-label">支出合計</div>
                    <div className="summary-value" style={{ color: 'var(--error)' }}>
                        {formatCurrency(totalExpense)}
                    </div>
                </div>
                <div className="summary-card">
                    <div className="summary-label">利益</div>
                    <div className="summary-value" style={{ color: profit >= 0 ? 'var(--success)' : 'var(--error)' }}>
                        {formatCurrency(profit)}
                    </div>
                </div>
                <div className="summary-card">
                    <div className="summary-label">月額固定費</div>
                    <div className="summary-value" style={{ color: 'var(--text-secondary)' }}>
                        {formatCurrency(monthlyFixedCost)}
                    </div>
                </div>
            </div>

            {/* タブ */}
            <div className="tabs" style={{ marginBottom: '24px', flexWrap: 'wrap' }}>
                <button
                    className={`tab ${activeTab === 'manuals' ? 'active' : ''}`}
                    onClick={() => setActiveTab('manuals')}
                >
                    マニュアル ({manuals.length})
                </button>
                <button
                    className={`tab ${activeTab === 'checklists' ? 'active' : ''}`}
                    onClick={() => setActiveTab('checklists')}
                >
                    チェックリスト ({checklists.length})
                </button>
                <button
                    className={`tab ${activeTab === 'contracts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('contracts')}
                >
                    契約 ({contracts.length})
                </button>
                <button
                    className={`tab ${activeTab === 'tasks' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tasks')}
                >
                    タスク ({tasks.length})
                </button>
                <button
                    className={`tab ${activeTab === 'fixedCosts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('fixedCosts')}
                >
                    固定費 ({fixedCosts.length})
                </button>
                <button
                    className={`tab ${activeTab === 'accounts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('accounts')}
                >
                    口座 ({accounts.length})
                </button>
            </div>

            {/* アーカイブ表示切替 & 追加ボタン */}
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={e => setShowArchived(e.target.checked)}
                    />
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        アーカイブ済みを表示
                    </span>
                </label>
                {activeTab === 'manuals' && (
                    <Button onClick={() => setManualModalOpen(true)}>+ マニュアル追加</Button>
                )}
                {activeTab === 'checklists' && (
                    <Button onClick={() => setChecklistModalOpen(true)}>+ チェックリスト追加</Button>
                )}
                {activeTab === 'contracts' && (
                    <Button onClick={() => setContractModalOpen(true)}>+ 契約追加</Button>
                )}
                {activeTab === 'tasks' && (
                    <Button onClick={() => setTaskModalOpen(true)}>+ タスク追加</Button>
                )}
                {activeTab === 'fixedCosts' && (
                    <Button onClick={() => setFixedCostModalOpen(true)}>+ 固定費追加</Button>
                )}
                {activeTab === 'accounts' && (
                    <Button onClick={() => setAccountModalOpen(true)}>+ 口座追加</Button>
                )}
            </div>

            {/* マニュアル一覧 */}
            {activeTab === 'manuals' && (
                <div className="accounts-grid">
                    {manuals.map(manual => (
                        <Link key={manual.id} href={`/businesses/${businessId}/manuals/${manual.id}`}>
                            <div className={`account-card ${manual.isArchived ? 'archived' : ''}`}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '24px' }}>
                                        {manual.type === 'pdf' ? '📄' : '🔗'}
                                    </span>
                                    <h4 style={{ margin: 0 }}>{manual.name}</h4>
                                </div>
                                {manual.description && (
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                                        {manual.description}
                                    </p>
                                )}
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {manual.type === 'pdf' ? 'PDF' : 'URL'} • {new Date(manual.createdAt).toLocaleDateString('ja-JP')}
                                    {manual.isArchived && <span style={{ marginLeft: '8px', color: 'var(--warning)' }}>アーカイブ済み</span>}
                                </div>
                            </div>
                        </Link>
                    ))}
                    {manuals.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">📚</div>
                            <div className="empty-state-text">マニュアルがありません</div>
                        </div>
                    )}
                </div>
            )}

            {/* チェックリスト一覧 */}
            {activeTab === 'checklists' && (
                <div className="accounts-grid">
                    {checklists.map(checklist => {
                        const checkboxBlocks = checklist.blocks.filter(b => b.type === 'checkbox');
                        const checkedCount = checkboxBlocks.filter(b => b.checked).length;
                        const totalCount = checkboxBlocks.length;

                        return (
                            <Link key={checklist.id} href={`/businesses/${businessId}/checklists/${checklist.id}`}>
                                <div className={`account-card ${checklist.isArchived ? 'archived' : ''}`}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '24px' }}>✅</span>
                                        <h4 style={{ margin: 0 }}>{checklist.title}</h4>
                                    </div>
                                    {checklist.description && (
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                                            {checklist.description}
                                        </p>
                                    )}
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {totalCount > 0 && (
                                            <span style={{ marginRight: '12px' }}>
                                                {checkedCount}/{totalCount} 完了
                                            </span>
                                        )}
                                        {checklist.updatedAt
                                            ? `更新: ${new Date(checklist.updatedAt).toLocaleDateString('ja-JP')}`
                                            : new Date(checklist.createdAt).toLocaleDateString('ja-JP')
                                        }
                                        {checklist.isArchived && <span style={{ marginLeft: '8px', color: 'var(--warning)' }}>アーカイブ済み</span>}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                    {checklists.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">✅</div>
                            <div className="empty-state-text">チェックリストがありません</div>
                        </div>
                    )}
                </div>
            )}

            {/* 契約一覧 */}
            {activeTab === 'contracts' && (
                <div className="accounts-grid">
                    {contracts.map(contract => (
                        <div key={contract.id} className="account-card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <span style={{ fontSize: '24px' }}>📜</span>
                                <h4 style={{ margin: 0 }}>{contract.name}</h4>
                            </div>
                            {contract.memo && (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                                    {contract.memo}
                                </p>
                            )}
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {contract.fileName && (
                                    <span style={{ marginRight: '12px' }}>📎 {contract.fileName}</span>
                                )}
                                {new Date(contract.createdAt).toLocaleDateString('ja-JP')}
                            </div>
                        </div>
                    ))}
                    {contracts.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">📜</div>
                            <div className="empty-state-text">契約がありません</div>
                        </div>
                    )}
                </div>
            )}

            {/* タスク一覧 */}
            {activeTab === 'tasks' && (
                <div>
                    {/* タスクサマリー */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <div style={{ padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>未着手: </span>
                            <strong>{taskStats.pending}</strong>
                        </div>
                        <div style={{ padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <span style={{ color: 'var(--primary)' }}>進行中: </span>
                            <strong>{taskStats.inProgress}</strong>
                        </div>
                        <div style={{ padding: '8px 16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                            <span style={{ color: 'var(--success)' }}>完了: </span>
                            <strong>{taskStats.completed}</strong>
                        </div>
                    </div>

                    <div className="data-table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>タイトル</th>
                                    <th>ステータス</th>
                                    <th>優先度</th>
                                    <th>期限</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tasks.map(task => (
                                    <tr key={task.id}>
                                        <td>
                                            <Link href={`/tasks?id=${task.id}`} style={{ color: 'var(--primary)' }}>
                                                {task.title}
                                            </Link>
                                        </td>
                                        <td>
                                            <select
                                                value={task.status}
                                                onChange={e => updateTaskStatus(task.id, e.target.value as Task['status'])}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    border: '1px solid var(--border-color)',
                                                    background: 'var(--bg-secondary)',
                                                    color: 'var(--text-primary)',
                                                    fontSize: '12px',
                                                }}
                                            >
                                                <option value="未着手">未着手</option>
                                                <option value="進行中">進行中</option>
                                                <option value="完了">完了</option>
                                            </select>
                                        </td>
                                        <td>
                                            <span style={{ color: getPriorityColor(task.priority) }}>
                                                {getPriorityLabel(task.priority)}
                                            </span>
                                        </td>
                                        <td style={{ color: task.dueDate && new Date(task.dueDate) < new Date() ? 'var(--error)' : 'inherit' }}>
                                            {task.dueDate ? new Date(task.dueDate).toLocaleDateString('ja-JP') : '-'}
                                        </td>
                                        <td>
                                            <Link href={`/tasks?id=${task.id}`}>
                                                <Button variant="secondary" size="sm">詳細</Button>
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {tasks.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-state-icon">📋</div>
                                <div className="empty-state-text">タスクがありません</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 固定費一覧 */}
            {activeTab === 'fixedCosts' && (
                <div>
                    <div style={{ marginBottom: '16px', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>月額合計（アクティブ）: </span>
                        <strong style={{ fontSize: '18px' }}>{formatCurrency(monthlyFixedCost)}</strong>
                    </div>

                    <div className="data-table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>カテゴリ</th>
                                    <th>金額</th>
                                    <th>引落日</th>
                                    <th>口座</th>
                                    <th>状態</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fixedCosts.map(fc => {
                                    const account = db.accounts.find(a => a.id === fc.accountId);
                                    return (
                                        <tr key={fc.id} style={{ opacity: fc.isActive ? 1 : 0.5 }}>
                                            <td>{fc.category}</td>
                                            <td>{formatCurrency(fc.amount)}</td>
                                            <td>毎月 {fc.dayOfMonth} 日</td>
                                            <td>{account?.name || '-'}</td>
                                            <td>
                                                <span style={{ color: fc.isActive ? 'var(--success)' : 'var(--text-muted)' }}>
                                                    {fc.isActive ? 'アクティブ' : '停止中'}
                                                </span>
                                            </td>
                                            <td>
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => toggleFixedCostActive(fc.id)}
                                                >
                                                    {fc.isActive ? '停止' : '再開'}
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {fixedCosts.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-state-icon">💰</div>
                                <div className="empty-state-text">固定費がありません</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 口座一覧 */}
            {activeTab === 'accounts' && (
                <div className="accounts-grid">
                    {accounts.map(account => (
                        <Link key={account.id} href={`/accounts/${account.id}`}>
                            <div className={`account-card ${account.isArchived ? 'archived' : ''}`}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '24px' }}>🏦</span>
                                    <h4 style={{ margin: 0 }}>{account.name}</h4>
                                </div>
                                {account.balance !== undefined && (
                                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                        {formatCurrency(account.balance)}
                                    </div>
                                )}
                                {account.isArchived && (
                                    <div style={{ fontSize: '12px', color: 'var(--warning)', marginTop: '8px' }}>
                                        アーカイブ済み
                                    </div>
                                )}
                            </div>
                        </Link>
                    ))}
                    {accounts.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">🏦</div>
                            <div className="empty-state-text">口座がありません</div>
                        </div>
                    )}
                </div>
            )}

            {/* 事業編集モーダル */}
            <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="事業編集">
                <form onSubmit={saveBusiness}>
                    <div className="form-group">
                        <label>事業名</label>
                        <input name="name" defaultValue={business.name} required />
                    </div>
                    <div className="form-group">
                        <label>説明</label>
                        <textarea name="description" defaultValue={business.description} rows={3} />
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* マニュアル追加モーダル */}
            <Modal isOpen={manualModalOpen} onClose={() => setManualModalOpen(false)} title="マニュアル追加">
                <form onSubmit={createManual}>
                    <div className="form-group">
                        <label>名前</label>
                        <input name="name" required placeholder="マニュアル名を入力" />
                    </div>
                    <div className="form-group">
                        <label>説明（任意）</label>
                        <textarea name="description" rows={2} placeholder="説明を入力" />
                    </div>
                    <div className="form-group">
                        <label>タイプ</label>
                        <select name="type" defaultValue="url">
                            <option value="url">URL</option>
                            <option value="pdf">PDF（後でアップロード）</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>URL</label>
                        <input name="url" type="url" placeholder="https://..." />
                    </div>
                    <Button type="submit" block>作成</Button>
                </form>
            </Modal>

            {/* チェックリスト追加モーダル */}
            <Modal isOpen={checklistModalOpen} onClose={() => setChecklistModalOpen(false)} title="チェックリスト追加">
                <form onSubmit={createChecklist}>
                    <div className="form-group">
                        <label>タイトル</label>
                        <input name="title" required placeholder="チェックリストのタイトル" />
                    </div>
                    <div className="form-group">
                        <label>説明（任意）</label>
                        <textarea name="description" rows={2} placeholder="説明を入力" />
                    </div>
                    <Button type="submit" block>作成して編集</Button>
                </form>
            </Modal>

            {/* 契約追加モーダル */}
            <Modal isOpen={contractModalOpen} onClose={() => setContractModalOpen(false)} title="契約追加">
                <form onSubmit={createContract}>
                    <div className="form-group">
                        <label>契約名</label>
                        <input name="name" required placeholder="契約名を入力" />
                    </div>
                    <div className="form-group">
                        <label>メモ（任意）</label>
                        <textarea name="memo" rows={2} placeholder="メモを入力" />
                    </div>
                    <div className="form-group">
                        <label>ファイル名（任意）</label>
                        <input name="fileName" placeholder="contract.pdf" />
                    </div>
                    <Button type="submit" block>作成</Button>
                </form>
            </Modal>

            {/* タスク追加モーダル */}
            <Modal isOpen={taskModalOpen} onClose={() => setTaskModalOpen(false)} title="タスク追加">
                <form onSubmit={createTask}>
                    <div className="form-group">
                        <label>タイトル</label>
                        <input name="title" required placeholder="タスクのタイトル" />
                    </div>
                    <div className="form-group">
                        <label>説明（任意）</label>
                        <textarea name="description" rows={2} placeholder="説明を入力" />
                    </div>
                    <div className="form-group">
                        <label>優先度</label>
                        <select name="priority" defaultValue="medium">
                            <option value="high">高</option>
                            <option value="medium">中</option>
                            <option value="low">低</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>期限（任意）</label>
                        <input name="dueDate" type="date" />
                    </div>
                    <Button type="submit" block>作成</Button>
                </form>
            </Modal>

            {/* 固定費追加モーダル */}
            <Modal isOpen={fixedCostModalOpen} onClose={() => setFixedCostModalOpen(false)} title="固定費追加">
                <form onSubmit={createFixedCost}>
                    <div className="form-group">
                        <label>カテゴリ</label>
                        <input name="category" required placeholder="家賃、サブスク等" />
                    </div>
                    <div className="form-group">
                        <label>金額</label>
                        <input name="amount" type="number" required placeholder="10000" />
                    </div>
                    <div className="form-group">
                        <label>引落日（毎月）</label>
                        <input name="dayOfMonth" type="number" min={1} max={31} required placeholder="25" />
                    </div>
                    <div className="form-group">
                        <label>引落口座（任意）</label>
                        <select name="accountId">
                            <option value="">選択しない</option>
                            {db.accounts.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>メモ（任意）</label>
                        <textarea name="memo" rows={2} placeholder="メモを入力" />
                    </div>
                    <Button type="submit" block>作成</Button>
                </form>
            </Modal>

            {/* 口座追加モーダル */}
            <Modal isOpen={accountModalOpen} onClose={() => setAccountModalOpen(false)} title="口座追加">
                <form onSubmit={createAccount}>
                    <div className="form-group">
                        <label>口座名</label>
                        <input name="name" required placeholder="口座名を入力" />
                    </div>
                    <div className="form-group">
                        <label>残高（任意）</label>
                        <input name="balance" type="number" placeholder="100000" />
                    </div>
                    <Button type="submit" block>作成</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

export default function BusinessDetailPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <BusinessDetailContent />;
}

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Transaction, FixedCost } from '@/types';

function AccountingContent() {
    const { db, updateCollection, saveDb } = useDatabase();
    const [modalType, setModalType] = useState<'income' | 'expense' | 'fixedCost' | 'category' | null>(null);
    const [filterType, setFilterType] = useState('');
    const [filterBusiness, setFilterBusiness] = useState('');
    const [filterAccount, setFilterAccount] = useState('');
    const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(null);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('expense');

    useEffect(() => {
        if (db) processFixedCosts();
    }, [db]);

    if (!db) return <div>Loading...</div>;

    // 固定費の自動計上
    function processFixedCosts() {
        if (!db || !saveDb) return;
        const today = new Date();
        const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        let updated = false;

        db.fixedCosts.filter(fc => fc.isActive).forEach(fc => {
            const alreadyPosted = db.transactions.some(t =>
                t.fixedCostId === fc.id && t.date.startsWith(currentMonth)
            );

            if (!alreadyPosted && today.getDate() >= fc.dayOfMonth) {
                const postDate = `${currentMonth}-${String(fc.dayOfMonth).padStart(2, '0')}`;
                db.transactions.push({
                    id: genId(db.transactions),
                    type: 'expense',
                    businessId: fc.businessId,
                    category: fc.category,
                    amount: fc.amount,
                    date: postDate,
                    memo: `[固定費] ${fc.memo || ''}`,
                    fixedCostId: fc.id,
                    accountId: fc.accountId,
                    createdAt: new Date().toISOString()
                });
                updated = true;
            }
        });

        if (updated) saveDb(db);
    }

    // 集計
    const totalIncome = db.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = db.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const profit = totalIncome - totalExpense;
    const profitRate = totalIncome > 0 ? Math.round((profit / totalIncome) * 100) : 0;

    // 事業別集計
    const businessData = db.businesses.map(b => {
        const income = db.transactions.filter(t => t.businessId === b.id && t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = db.transactions.filter(t => t.businessId === b.id && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return { ...b, income, expense, profit: income - expense };
    }).filter(b => b.income > 0 || b.expense > 0);

    const maxValue = Math.max(...businessData.map(b => Math.max(b.income, b.expense)), 1);

    // 固定費 vs 変動費
    const fixedCategories = ['家賃', 'サブスク', '人件費'];
    let fixedTotal = 0, variableTotal = 0;
    db.transactions.filter(t => t.type === 'expense').forEach(t => {
        if (fixedCategories.includes(t.category) || t.fixedCostId) fixedTotal += t.amount;
        else variableTotal += t.amount;
    });
    const costTotal = fixedTotal + variableTotal;
    const fixedPct = costTotal > 0 ? Math.round((fixedTotal / costTotal) * 100) : 0;

    // フィルタ済み取引
    let txns = [...db.transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (filterType) txns = txns.filter(t => t.type === filterType);
    if (filterBusiness) txns = txns.filter(t => t.businessId === parseInt(filterBusiness));
    if (filterAccount) txns = txns.filter(t => t.accountId === parseInt(filterAccount));

    // 選択中の事業に紐づく口座（アーカイブ済みを除外）
    const filteredAccounts = db.accounts.filter(a =>
        !a.isArchived && (!selectedBusinessId || a.businessId === selectedBusinessId)
    );

    const saveTransaction = (e: React.FormEvent, type: 'income' | 'expense') => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const accountIdStr = formData.get('accountId') as string;

        updateCollection('transactions', txns => [...txns, {
            id: genId(txns),
            type,
            businessId: parseInt(formData.get('businessId') as string),
            accountId: accountIdStr ? parseInt(accountIdStr) : undefined,
            category: formData.get('category') as string,
            amount: parseInt(formData.get('amount') as string),
            date: formData.get('date') as string,
            memo: formData.get('memo') as string,
            createdAt: new Date().toISOString()
        }]);
        setModalType(null);
        setSelectedBusinessId(null);
    };

    const saveFixedCost = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const accountIdStr = formData.get('accountId') as string;

        updateCollection('fixedCosts', costs => [...costs, {
            id: genId(costs),
            businessId: parseInt(formData.get('businessId') as string),
            accountId: accountIdStr ? parseInt(accountIdStr) : undefined,
            category: formData.get('category') as string,
            amount: parseInt(formData.get('amount') as string),
            dayOfMonth: parseInt(formData.get('dayOfMonth') as string),
            memo: formData.get('memo') as string,
            isActive: true
        }]);
        setModalType(null);
        setSelectedBusinessId(null);
    };

    const deleteTransaction = (id: number) => {
        if (confirm('削除しますか？')) {
            updateCollection('transactions', txns => txns.filter(t => t.id !== id));
        }
    };

    const deleteFixedCost = (id: number) => {
        if (confirm('削除しますか？')) {
            updateCollection('fixedCosts', costs => costs.filter(c => c.id !== id));
        }
    };

    const saveCategory = () => {
        if (!newCategoryName.trim()) return;
        updateCollection('categories', cats => [...cats, {
            id: genId(cats),
            type: newCategoryType,
            name: newCategoryName.trim()
        }]);
        setNewCategoryName('');
    };

    const deleteCategory = (id: number) => {
        if (confirm('このカテゴリを削除しますか？')) {
            updateCollection('categories', cats => cats.filter(c => c.id !== id));
        }
    };

    return (
        <AppLayout title="管理会計">
            <div className="page-header">
                <h3>管理会計 <span style={{ fontSize: '10px', color: '#888' }}>v1.2</span></h3>
                <div className="btn-group">
                    <Button variant="ghost" onClick={() => setModalType('category')}>カテゴリ管理</Button>
                    <Button variant="ghost" onClick={() => setModalType('fixedCost')}>固定費設定</Button>
                    <Button variant="secondary" onClick={() => setModalType('expense')}>+ 支出</Button>
                    <Button onClick={() => setModalType('income')}>+ 売上</Button>
                </div>
            </div>

            {/* サマリー */}
            <div className="summary-cards" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="summary-card lend">
                    <div className="summary-label">📈 売上合計</div>
                    <div className="summary-value">¥{totalIncome.toLocaleString()}</div>
                </div>
                <div className="summary-card borrow">
                    <div className="summary-label">📉 支出合計</div>
                    <div className="summary-value">¥{totalExpense.toLocaleString()}</div>
                </div>
                <div className="summary-card">
                    <div className="summary-label">💰 利益</div>
                    <div className="summary-value">¥{profit.toLocaleString()}</div>
                </div>
                <div className="summary-card">
                    <div className="summary-label">📊 利益率</div>
                    <div className="summary-value">{profitRate}%</div>
                </div>
            </div>

            {/* 事業別収支 */}
            <h4 style={{ margin: '24px 0 16px' }}>🏢 事業別収支</h4>
            <div className="chart-container">
                {businessData.length > 0 ? (
                    <div className="bar-chart">
                        {businessData.map(b => (
                            <div key={b.id} className="bar-chart-row">
                                <div className="bar-chart-label">{b.name}</div>
                                <div className="bar-chart-bar-container">
                                    <div className="bar-chart-bar income" style={{ width: `${(b.income / maxValue) * 50}%` }} />
                                    <div className="bar-chart-bar expense" style={{ width: `${(b.expense / maxValue) * 50}%` }} />
                                </div>
                                <div className={`bar-chart-value ${b.profit >= 0 ? 'positive' : 'negative'}`}>
                                    ¥{b.profit.toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-muted)' }}>取引データがありません</p>
                )}
            </div>

            {/* 固定費 vs 変動費 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '24px' }}>
                <div>
                    <h4 style={{ margin: '0 0 16px' }}>📊 固定費 vs 変動費</h4>
                    <div className="pie-chart-container">
                        {costTotal > 0 ? (
                            <div className="pie-chart-wrapper">
                                <div className="pie-chart" style={{ background: `conic-gradient(#8b5cf6 0% ${fixedPct}%, #06b6d4 ${fixedPct}% 100%)` }} />
                                <div className="pie-chart-legend">
                                    <div className="pie-legend-item">
                                        <div className="pie-legend-color fixed" />
                                        <span className="pie-legend-text">固定費 <span className="pie-legend-value">¥{fixedTotal.toLocaleString()} ({fixedPct}%)</span></span>
                                    </div>
                                    <div className="pie-legend-item">
                                        <div className="pie-legend-color variable" />
                                        <span className="pie-legend-text">変動費 <span className="pie-legend-value">¥{variableTotal.toLocaleString()} ({100 - fixedPct}%)</span></span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <p style={{ color: 'var(--text-muted)' }}>支出データがありません</p>
                        )}
                    </div>
                </div>

                <div>
                    <h4 style={{ margin: '0 0 16px' }}>🔄 登録済み固定費</h4>
                    <div className="data-table-container">
                        {db.fixedCosts.length > 0 ? (
                            <table className="data-table">
                                <thead><tr><th>カテゴリ</th><th>金額</th><th>日</th><th></th></tr></thead>
                                <tbody>
                                    {db.fixedCosts.map(fc => (
                                        <tr key={fc.id}>
                                            <td>{fc.category}</td>
                                            <td>¥{fc.amount.toLocaleString()}</td>
                                            <td>{fc.dayOfMonth}日</td>
                                            <td><Button size="sm" variant="danger" onClick={() => deleteFixedCost(fc.id)}>×</Button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <p style={{ color: 'var(--text-muted)', padding: '16px' }}>固定費の登録がありません</p>
                        )}
                    </div>
                </div>
            </div>

            {/* 取引履歴 */}
            <h4 style={{ margin: '24px 0 16px' }}>📋 取引履歴</h4>
            <div className="filters">
                <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="">全て</option>
                    <option value="income">売上のみ</option>
                    <option value="expense">支出のみ</option>
                </select>
                <select value={filterBusiness} onChange={e => setFilterBusiness(e.target.value)}>
                    <option value="">全事業</option>
                    {db.businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
                    <option value="">全口座</option>
                    {db.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
            </div>
            <div className="data-table-container">
                {txns.length > 0 ? (
                    <table className="data-table">
                        <thead><tr><th>日付</th><th>種類</th><th>事業</th><th>口座</th><th>カテゴリ</th><th>金額</th><th>メモ</th><th></th></tr></thead>
                        <tbody>
                            {txns.map(t => {
                                const biz = db.businesses.find(b => b.id === t.businessId);
                                const account = db.accounts.find(a => a.id === t.accountId);
                                return (
                                    <tr key={t.id}>
                                        <td>{t.date}</td>
                                        <td><span className={`txn-type ${t.type}`}>{t.type === 'income' ? '売上' : '支出'}</span></td>
                                        <td>{biz?.name || '-'}</td>
                                        <td>{account?.name || '-'}</td>
                                        <td><span className={`category-badge ${t.type}`}>{t.category}</span></td>
                                        <td className={t.type === 'income' ? 'amount-positive' : 'amount-negative'}>¥{t.amount.toLocaleString()}</td>
                                        <td>{t.memo}</td>
                                        <td><Button size="sm" variant="danger" onClick={() => deleteTransaction(t.id)}>削除</Button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <p style={{ color: 'var(--text-muted)', padding: '16px' }}>取引履歴がありません</p>
                )}
            </div>

            {/* 売上・支出モーダル */}
            <Modal
                isOpen={modalType === 'income' || modalType === 'expense'}
                onClose={() => setModalType(null)}
                title={modalType === 'income' ? '売上を追加' : '支出を追加'}
            >
                <form onSubmit={e => saveTransaction(e, modalType as 'income' | 'expense')}>
                    <div className="form-group">
                        <label>事業</label>
                        <select name="businessId" required onChange={e => setSelectedBusinessId(parseInt(e.target.value))}>
                            <option value="">選択してください</option>
                            {db.businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>口座（任意）</label>
                        <select name="accountId">
                            <option value="">未選択</option>
                            {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>カテゴリ</label>
                        <select name="category" required>
                            {db.categories.filter(c => c.type === modalType).map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>金額</label>
                        <input type="number" name="amount" min="1" required />
                    </div>
                    <div className="form-group">
                        <label>日付</label>
                        <input type="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                    </div>
                    <div className="form-group">
                        <label>メモ</label>
                        <input type="text" name="memo" />
                    </div>
                    <Button type="submit" block>追加</Button>
                </form>
            </Modal>

            {/* 固定費モーダル */}
            <Modal isOpen={modalType === 'fixedCost'} onClose={() => setModalType(null)} title="固定費を登録">
                <form onSubmit={saveFixedCost}>
                    <div className="form-group">
                        <label>事業</label>
                        <select name="businessId" required onChange={e => setSelectedBusinessId(parseInt(e.target.value))}>
                            <option value="">選択してください</option>
                            {db.businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>口座（任意）</label>
                        <select name="accountId">
                            <option value="">未選択</option>
                            {filteredAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>カテゴリ</label>
                        <select name="category" required>
                            {db.categories.filter(c => c.type === 'expense').map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>金額（月額）</label>
                        <input type="number" name="amount" min="1" required />
                    </div>
                    <div className="form-group">
                        <label>計上日（毎月）</label>
                        <input type="number" name="dayOfMonth" min="1" max="28" defaultValue="25" required />
                    </div>
                    <div className="form-group">
                        <label>メモ</label>
                        <input type="text" name="memo" />
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* カテゴリ管理モーダル */}
            <Modal isOpen={modalType === 'category'} onClose={() => setModalType(null)} title="カテゴリ管理">
                <div style={{ marginBottom: '16px' }}>
                    <h5>新規カテゴリ追加</h5>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <select value={newCategoryType} onChange={e => setNewCategoryType(e.target.value as 'income' | 'expense')}>
                            <option value="income">収入</option>
                            <option value="expense">支出</option>
                        </select>
                        <input
                            type="text"
                            value={newCategoryName}
                            onChange={e => setNewCategoryName(e.target.value)}
                            placeholder="カテゴリ名"
                            style={{ flex: 1 }}
                        />
                        <Button onClick={saveCategory}>追加</Button>
                    </div>
                </div>

                <div>
                    <h5>収入カテゴリ</h5>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                        {db.categories.filter(c => c.type === 'income').map(cat => (
                            <span key={cat.id} className="badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {cat.name}
                                <button onClick={() => deleteCategory(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
                            </span>
                        ))}
                    </div>
                </div>

                <div style={{ marginTop: '16px' }}>
                    <h5>支出カテゴリ</h5>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                        {db.categories.filter(c => c.type === 'expense').map(cat => (
                            <span key={cat.id} className="badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {cat.name}
                                <button onClick={() => deleteCategory(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
                            </span>
                        ))}
                    </div>
                </div>
            </Modal>
        </AppLayout>
    );
}

export default function AccountingPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <AccountingContent />;
}

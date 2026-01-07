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
import { AccountTransaction } from '@/types';
import { getAccountBalance } from '@/lib/lending/balance';

function AccountDetailContent() {
    const params = useParams();
    const router = useRouter();
    const accountId = Number(params.id);
    const { db, updateCollection } = useDatabase();

    const [editModalOpen, setEditModalOpen] = useState(false);
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [incomeModalOpen, setIncomeModalOpen] = useState(false);
    const [tagModalOpen, setTagModalOpen] = useState(false);
    const [incomeType, setIncomeType] = useState<'interest' | 'investment_gain'>('interest');
    const [netFlowModalOpen, setNetFlowModalOpen] = useState(false);
    const [netFlowType, setNetFlowType] = useState<'deposit' | 'withdrawal'>('deposit');
    const [newTag, setNewTag] = useState('');

    if (!db) return <div>Loading...</div>;

    const account = db.accounts.find(a => a.id === accountId);

    if (!account) {
        return (
            <AppLayout title="口座詳細">
                <div className="empty-state">
                    <div className="empty-state-icon">❌</div>
                    <div className="empty-state-text">口座が見つかりません</div>
                    <Link href="/lending">
                        <Button>戻る</Button>
                    </Link>
                </div>
            </AppLayout>
        );
    }

    const business = account.businessId ? db.businesses.find(b => b.id === account.businessId) : null;

    // この口座に関連する貸借履歴（相手方として参照されている取引も含む、アーカイブ済みは除外）
    const relatedLendings = db.lendings.filter(l =>
        !l.isArchived && (
            l.accountId === accountId ||
            (l.counterpartyType === 'account' && l.counterpartyId === accountId)
        )
    );

    // この口座に関連する取引（移転・利息・運用益）
    const relatedTransactions = (db.accountTransactions || []).filter(
        t => t.accountId === accountId || t.fromAccountId === accountId || t.toAccountId === accountId
    );

    // 貸借残高計算（共通ユーティリティを使用）
    const lendingBalance = getAccountBalance(db.lendings, accountId);

    // 表示用に分離
    const lendingTotal = lendingBalance > 0 ? lendingBalance : 0;
    const borrowingTotal = lendingBalance < 0 ? Math.abs(lendingBalance) : 0;

    // 純資産 = 残高 + 貸借残高
    const netWorth = (account.balance || 0) + lendingBalance;

    const saveAccountInfo = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        updateCollection('accounts', items =>
            items.map(a => a.id === accountId ? {
                ...a,
                name: formData.get('name') as string,
                balance: Number(formData.get('balance')) || 0,
                businessId: formData.get('businessId') ? Number(formData.get('businessId')) : undefined,
            } : a)
        );
        setEditModalOpen(false);
    };

    const saveTransfer = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const toAccountId = Number(formData.get('toAccountId'));
        const amount = Number(formData.get('amount'));
        const date = formData.get('date') as string;
        const memo = formData.get('memo') as string;

        const newTransaction: Omit<AccountTransaction, 'id'> = {
            type: 'transfer',
            fromAccountId: accountId,
            toAccountId,
            amount,
            date,
            memo,
            createdAt: new Date().toISOString()
        };

        updateCollection('accountTransactions', items => [
            ...items,
            { id: genId(items), ...newTransaction }
        ]);

        // 残高更新（振替元から減算、振替先に加算）
        updateCollection('accounts', items =>
            items.map(a => {
                if (a.id === accountId) {
                    return { ...a, balance: (a.balance || 0) - amount };
                }
                if (a.id === toAccountId) {
                    return { ...a, balance: (a.balance || 0) + amount };
                }
                return a;
            })
        );

        setTransferModalOpen(false);
    };

    const saveIncome = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const amount = Number(formData.get('amount'));
        const date = formData.get('date') as string;
        const memo = formData.get('memo') as string;

        // AccountTransactionに追加
        updateCollection('accountTransactions', items => [
            ...items,
            {
                id: genId(items),
                type: incomeType,
                accountId,
                amount,
                date,
                memo,
                createdAt: new Date().toISOString()
            }
        ]);

        // 残高更新
        updateCollection('accounts', items =>
            items.map(a => a.id === accountId ? { ...a, balance: (a.balance || 0) + amount } : a)
        );

        // 管理会計（transactions）にも追加（運用損の場合はexpense）
        const isLoss = amount < 0;
        const categoryName = incomeType === 'interest' ? '受取利息' : '運用損益';
        updateCollection('transactions', items => [
            ...items,
            {
                id: genId(items),
                type: isLoss ? 'expense' as const : 'income' as const,
                businessId: account.businessId,
                category: categoryName,
                amount: Math.abs(amount),
                date,
                memo: memo || `${categoryName}（${account.name}）`,
                createdAt: new Date().toISOString()
            }
        ]);

        setIncomeModalOpen(false);
    };

    const saveNetFlow = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const amount = Number(formData.get('amount'));
        const date = formData.get('date') as string;
        const memo = formData.get('memo') as string;

        // AccountTransactionに追加
        updateCollection('accountTransactions', items => [
            ...items,
            {
                id: genId(items),
                type: netFlowType,
                accountId,
                amount,
                date,
                memo,
                createdAt: new Date().toISOString()
            }
        ]);

        // 残高更新（純入金なら加算、純出金なら減算）
        const balanceChange = netFlowType === 'deposit' ? amount : -amount;
        updateCollection('accounts', items =>
            items.map(a => a.id === accountId ? { ...a, balance: (a.balance || 0) + balanceChange } : a)
        );

        setNetFlowModalOpen(false);
    };

    const addTag = () => {
        if (!newTag.trim()) return;
        const currentTags = account.tags || [];
        if (currentTags.includes(newTag.trim())) {
            setNewTag('');
            return;
        }
        updateCollection('accounts', items =>
            items.map(a => a.id === accountId ? {
                ...a,
                tags: [...currentTags, newTag.trim()]
            } : a)
        );
        setNewTag('');
    };

    const removeTag = (tag: string) => {
        updateCollection('accounts', items =>
            items.map(a => a.id === accountId ? {
                ...a,
                tags: (a.tags || []).filter(t => t !== tag)
            } : a)
        );
    };

    const toggleArchive = () => {
        const action = account.isArchived ? 'アーカイブを取り消しますか？' : 'この口座をアーカイブしますか？';
        if (confirm(action)) {
            updateCollection('accounts', items =>
                items.map(a => a.id === accountId ? { ...a, isArchived: !a.isArchived } : a)
            );
            if (!account.isArchived) {
                router.push('/lending');
            }
        }
    };

    const getTransactionTypeLabel = (type: string) => {
        switch (type) {
            case 'transfer': return '振替';
            case 'interest': return '受取利息';
            case 'investment_gain': return '運用損益';
            case 'deposit': return '純入金';
            case 'withdrawal': return '純出金';
            default: return type;
        }
    };

    const otherAccounts = db.accounts.filter(a => a.id !== accountId && !a.isArchived);

    return (
        <AppLayout title={`口座詳細: ${account.name}`}>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/lending">
                        <Button variant="secondary">← 戻る</Button>
                    </Link>
                    <h3>{account.name}</h3>
                    {account.isArchived && <span className="badge badge-secondary">アーカイブ済み</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button variant="secondary" onClick={() => setEditModalOpen(true)}>編集</Button>
                    <Button
                        variant={account.isArchived ? 'primary' : 'danger'}
                        onClick={toggleArchive}
                    >
                        {account.isArchived ? 'アーカイブ取消' : 'アーカイブ'}
                    </Button>
                </div>
            </div>

            {/* 口座情報 */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>残高</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                            ¥{(account.balance || 0).toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>貸出中</div>
                        <div style={{ fontSize: '1.25rem', color: 'var(--success)' }}>
                            ¥{lendingTotal.toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>借入中</div>
                        <div style={{ fontSize: '1.25rem', color: 'var(--danger)' }}>
                            ¥{borrowingTotal.toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>純資産</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: netWorth >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            ¥{netWorth.toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>事業</div>
                        <div>{business?.name || '未設定'}</div>
                    </div>
                </div>

                {/* タグ */}
                <div style={{ marginTop: '1rem' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>タグ</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        {(account.tags || []).map(tag => (
                            <span key={tag} className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                {tag}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: '0.25rem', color: 'inherit' }}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                        <Button size="sm" variant="secondary" onClick={() => setTagModalOpen(true)}>+ タグ追加</Button>
                    </div>
                </div>
            </div>

            {/* 操作ボタン */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <Button onClick={() => setTransferModalOpen(true)}>💸 振替</Button>
                <Button onClick={() => { setIncomeType('interest'); setIncomeModalOpen(true); }}>💰 受取利息</Button>
                <Button onClick={() => { setIncomeType('investment_gain'); setIncomeModalOpen(true); }}>📈 運用損益</Button>
                <Button onClick={() => setNetFlowModalOpen(true)}>💵 純入出金</Button>
            </div>

            {/* 口座取引履歴 */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '1rem' }}>口座取引履歴</h4>
                {relatedTransactions.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem' }}>
                        <div className="empty-state-text">取引履歴がありません</div>
                    </div>
                ) : (
                    <div className="data-table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>日付</th>
                                    <th>種類</th>
                                    <th>金額</th>
                                    <th>詳細</th>
                                    <th>メモ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {relatedTransactions
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map(t => {
                                        const isOutgoing = t.fromAccountId === accountId;
                                        const otherAccount = isOutgoing
                                            ? db.accounts.find(a => a.id === t.toAccountId)
                                            : db.accounts.find(a => a.id === t.fromAccountId);

                                        // 金額の符号と色を決定
                                        const isNegative = (t.type === 'transfer' && isOutgoing) || t.type === 'withdrawal' || t.amount < 0;
                                        const amountColor = isNegative ? 'var(--danger)' : 'var(--success)';
                                        const amountPrefix = isNegative ? '-' : '+';

                                        // バッジの色を決定
                                        const getBadgeClass = () => {
                                            if (t.type === 'transfer') return 'badge-secondary';
                                            if (t.type === 'withdrawal') return 'badge-danger';
                                            return 'badge-success';
                                        };

                                        return (
                                            <tr key={t.id}>
                                                <td>{t.date}</td>
                                                <td>
                                                    <span className={`badge ${getBadgeClass()}`}>
                                                        {getTransactionTypeLabel(t.type)}
                                                    </span>
                                                </td>
                                                <td style={{ color: amountColor }}>
                                                    {amountPrefix}¥{Math.abs(t.amount).toLocaleString()}
                                                </td>
                                                <td>
                                                    {t.type === 'transfer' && (
                                                        isOutgoing
                                                            ? `→ ${otherAccount?.name || '不明'}`
                                                            : `← ${otherAccount?.name || '不明'}`
                                                    )}
                                                </td>
                                                <td>{t.memo || '-'}</td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 貸借履歴 */}
            <div className="card">
                <h4 style={{ marginBottom: '1rem' }}>貸借履歴</h4>
                {relatedLendings.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem' }}>
                        <div className="empty-state-text">貸借履歴がありません</div>
                    </div>
                ) : (
                    <div className="data-table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>日付</th>
                                    <th>相手</th>
                                    <th>種類</th>
                                    <th>金額</th>
                                    <th>状態</th>
                                </tr>
                            </thead>
                            <tbody>
                                {relatedLendings
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map(l => {
                                        // 相手の取得ロジック（counterpartyType対応）
                                        const getCounterparty = () => {
                                            if (l.counterpartyType === 'person') {
                                                const person = db.persons.find(p => p.id === l.counterpartyId);
                                                return { type: 'person', name: person?.name, id: l.counterpartyId };
                                            } else if (l.counterpartyType === 'account') {
                                                const account = db.accounts.find(a => a.id === l.counterpartyId);
                                                return { type: 'account', name: account?.name, id: l.counterpartyId };
                                            } else if (l.personId) {
                                                // 旧形式（後方互換）
                                                const person = db.persons.find(p => p.id === l.personId);
                                                return { type: 'person', name: person?.name, id: l.personId };
                                            }
                                            return { type: 'unknown', name: '不明', id: null };
                                        };
                                        const counterparty = getCounterparty();
                                        return (
                                            <tr key={l.id}>
                                                <td>{l.date}</td>
                                                <td>
                                                    {counterparty.type === 'account' ? (
                                                        <Link href={`/lending/account/${counterparty.id}`} style={{ color: 'var(--primary)' }}>
                                                            💼 {counterparty.name || '不明'}
                                                        </Link>
                                                    ) : counterparty.type === 'person' ? (
                                                        <Link href={`/lending/person/${counterparty.id}`} style={{ color: 'var(--primary)' }}>
                                                            {counterparty.name || '不明'}
                                                        </Link>
                                                    ) : (
                                                        '不明'
                                                    )}
                                                </td>
                                                <td>
                                                    <span className={`badge ${l.type === 'lend' ? 'badge-success' : 'badge-danger'}`}>
                                                        {l.type === 'lend' ? '貸出' : '借入'}
                                                    </span>
                                                </td>
                                                <td>¥{Math.abs(l.amount).toLocaleString()}</td>
                                                <td>
                                                    <span className={`badge ${l.returned ? 'badge-secondary' : 'badge-warning'}`}>
                                                        {l.returned ? '返済済' : '未返済'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* 編集モーダル */}
            <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="口座情報編集">
                <form onSubmit={saveAccountInfo}>
                    <div className="form-group">
                        <label>口座名</label>
                        <input name="name" defaultValue={account.name} required />
                    </div>
                    <div className="form-group">
                        <label>残高</label>
                        <input name="balance" type="number" defaultValue={account.balance || 0} />
                    </div>
                    <div className="form-group">
                        <label>事業</label>
                        <select name="businessId" defaultValue={account.businessId || ''}>
                            <option value="">未設定</option>
                            {db.businesses.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* 振替モーダル */}
            <Modal isOpen={transferModalOpen} onClose={() => setTransferModalOpen(false)} title="口座間振替">
                <form onSubmit={saveTransfer}>
                    <div className="form-group">
                        <label>振替先口座</label>
                        <select name="toAccountId" required>
                            <option value="">選択してください</option>
                            {otherAccounts.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>金額</label>
                        <input name="amount" type="number" min="1" required />
                    </div>
                    <div className="form-group">
                        <label>日付</label>
                        <input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                    </div>
                    <div className="form-group">
                        <label>メモ</label>
                        <textarea name="memo" />
                    </div>
                    <Button type="submit" block>振替実行</Button>
                </form>
            </Modal>

            {/* 利息/運用損益モーダル */}
            <Modal
                isOpen={incomeModalOpen}
                onClose={() => setIncomeModalOpen(false)}
                title={incomeType === 'interest' ? '受取利息の登録' : '運用損益の登録'}
            >
                <form onSubmit={saveIncome}>
                    <div className="form-group">
                        <label>金額</label>
                        <input name="amount" type="number" required />
                        {incomeType === 'investment_gain' && (
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                ※ 運用損の場合はマイナス値を入力
                            </p>
                        )}
                    </div>
                    <div className="form-group">
                        <label>日付</label>
                        <input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                    </div>
                    <div className="form-group">
                        <label>メモ</label>
                        <textarea name="memo" />
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        ※ この取引は管理会計にも自動で反映されます
                    </p>
                    <Button type="submit" block>登録</Button>
                </form>
            </Modal>

            {/* 純入出金モーダル */}
            <Modal
                isOpen={netFlowModalOpen}
                onClose={() => setNetFlowModalOpen(false)}
                title="純入出金の登録"
            >
                <form onSubmit={saveNetFlow}>
                    <div className="form-group">
                        <label>種類</label>
                        <select
                            value={netFlowType}
                            onChange={e => setNetFlowType(e.target.value as 'deposit' | 'withdrawal')}
                        >
                            <option value="deposit">純入金（残高増加）</option>
                            <option value="withdrawal">純出金（残高減少）</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>金額</label>
                        <input name="amount" type="number" min="1" required />
                    </div>
                    <div className="form-group">
                        <label>日付</label>
                        <input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                    </div>
                    <div className="form-group">
                        <label>メモ</label>
                        <textarea name="memo" />
                    </div>
                    <Button type="submit" block>登録</Button>
                </form>
            </Modal>

            {/* タグ追加モーダル */}
            <Modal isOpen={tagModalOpen} onClose={() => setTagModalOpen(false)} title="タグ追加">
                <div className="form-group">
                    <label>新しいタグ</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            value={newTag}
                            onChange={e => setNewTag(e.target.value)}
                            placeholder="タグ名を入力"
                            onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && (e.preventDefault(), addTag())}
                        />
                        <Button onClick={addTag}>追加</Button>
                    </div>
                </div>
                <div style={{ marginTop: '1rem' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>既存のタグから選択</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {(db.tags || []).map(tag => (
                            <button
                                key={tag.id}
                                className="badge badge-secondary"
                                style={{ cursor: 'pointer', border: 'none' }}
                                onClick={() => {
                                    if (!(account.tags || []).includes(tag.name)) {
                                        updateCollection('accounts', items =>
                                            items.map(a => a.id === accountId ? {
                                                ...a,
                                                tags: [...(a.tags || []), tag.name]
                                            } : a)
                                        );
                                    }
                                }}
                            >
                                {tag.name}
                            </button>
                        ))}
                    </div>
                </div>
            </Modal>
        </AppLayout>
    );
}

export default function AccountDetailPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <AccountDetailContent />;
}

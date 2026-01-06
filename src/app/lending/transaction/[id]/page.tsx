'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { TransactionEditModal, CombinedTransaction, FieldChange } from '@/components/lending/TransactionEditModal';
import { Lending, AccountTransaction } from '@/types';

function TransactionDetailContent() {
    const params = useParams();
    const router = useRouter();
    const { user } = useAuth();
    const { db, updateCollection } = useDatabase();
    const [editModalOpen, setEditModalOpen] = useState(false);

    // URLパラメータから source と id を取得
    // 形式: lending-{id} または transaction-{id}
    const idParam = params.id as string;
    const [source, originalIdStr] = idParam.split('-');
    const originalId = parseInt(originalIdStr);

    if (!db) return <div>Loading...</div>;

    // 取引データを取得
    const lending = source === 'lending' ? db.lendings.find(l => l.id === originalId) : null;
    const accountTransaction = source === 'transaction' ? (db.accountTransactions || []).find(t => t.id === originalId) : null;

    if (!lending && !accountTransaction) {
        return (
            <AppLayout title="取引詳細">
                <div className="empty-state">
                    <div className="empty-state-icon">❌</div>
                    <div className="empty-state-text">取引が見つかりません</div>
                    <Link href="/lending">
                        <Button>戻る</Button>
                    </Link>
                </div>
            </AppLayout>
        );
    }

    // 表示用データの構築
    const transaction: CombinedTransaction = lending ? {
        id: `lending-${lending.id}`,
        source: 'lending',
        originalId: lending.id,
        type: lending.type,
        amount: lending.amount,
        date: lending.date,
        memo: lending.memo,
        accountId: lending.accountId,
        counterpartyType: lending.counterpartyType,
        counterpartyId: lending.counterpartyId || lending.personId,
        returned: lending.returned,
    } : {
        id: `transaction-${accountTransaction!.id}`,
        source: 'transaction',
        originalId: accountTransaction!.id,
        type: accountTransaction!.type,
        amount: accountTransaction!.amount,
        date: accountTransaction!.date,
        memo: accountTransaction!.memo,
        accountId: accountTransaction!.type === 'transfer' ? accountTransaction!.fromAccountId : accountTransaction!.accountId,
        fromAccountId: accountTransaction!.fromAccountId,
        toAccountId: accountTransaction!.toAccountId,
    };

    // 関連する履歴を取得
    const histories = source === 'lending'
        ? (db.lendingHistories || []).filter(h => h.lendingId === originalId)
        : (db.accountTransactionHistories || []).filter(h => h.accountTransactionId === originalId);

    // 履歴を新しい順にソート
    const sortedHistories = [...histories].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // 口座と相手の情報
    const account = db.accounts.find(a => a.id === transaction.accountId);
    const toAccount = transaction.toAccountId ? db.accounts.find(a => a.id === transaction.toAccountId) : null;
    const counterparty = transaction.counterpartyType === 'account'
        ? db.accounts.find(a => a.id === transaction.counterpartyId)
        : db.persons.find(p => p.id === transaction.counterpartyId);

    // 作成者と最終編集者
    const createdByUserId = lending?.createdByUserId || accountTransaction?.createdByUserId;
    const lastEditedByUserId = lending?.lastEditedByUserId || accountTransaction?.lastEditedByUserId;
    const lastEditedAt = lending?.lastEditedAt || accountTransaction?.lastEditedAt;
    const createdBy = createdByUserId ? db.users.find(u => u.id === createdByUserId) : null;
    const lastEditedBy = lastEditedByUserId ? db.users.find(u => u.id === lastEditedByUserId) : null;

    // 種類の表示名
    const getTypeDisplay = () => {
        if (source === 'lending') {
            if (transaction.type === 'return') return '返済';
            return transaction.amount > 0 ? '貸し' : '借り';
        }
        switch (transaction.type) {
            case 'transfer': return '振替';
            case 'interest': return '受取利息';
            case 'investment_gain': return '運用損益';
            case 'deposit': return '純入金';
            case 'withdrawal': return '純出金';
            default: return transaction.type;
        }
    };

    // 種類のバッジクラス
    const getTypeClass = () => {
        if (source === 'lending') {
            if (transaction.type === 'return') return 'badge-secondary';
            return transaction.amount > 0 ? 'badge-success' : 'badge-danger';
        }
        switch (transaction.type) {
            case 'transfer': return 'badge-secondary';
            case 'interest': return 'badge-success';
            case 'investment_gain': return transaction.amount < 0 ? 'badge-danger' : 'badge-success';
            case 'deposit': return 'badge-success';
            case 'withdrawal': return 'badge-danger';
            default: return 'badge-secondary';
        }
    };

    // アーカイブ済みかどうか
    const isArchived = lending?.isArchived || accountTransaction?.isArchived;

    // アーカイブ処理
    const handleArchive = async () => {
        if (!confirm('この取引をアーカイブしますか？\n※アーカイブすると残高計算から除外されます')) return;

        if (source === 'lending' && lending) {
            // 残高を戻す（未返済の場合のみ）
            if (!lending.returned) {
                const balanceChange = lending.type === 'lend'
                    ? Math.abs(lending.amount)
                    : -Math.abs(lending.amount);
                await updateCollection('accounts', items =>
                    items.map(a => a.id === lending.accountId ? {
                        ...a,
                        balance: (a.balance || 0) + balanceChange
                    } : a)
                );
            }

            await updateCollection('lendings', items =>
                items.map(l => l.id === originalId ? {
                    ...l,
                    isArchived: true,
                    lastEditedByUserId: user?.id,
                    lastEditedAt: new Date().toISOString()
                } : l)
            );

            await updateCollection('lendingHistories', items => [...items, {
                id: genId(items),
                lendingId: originalId,
                action: 'archived' as const,
                description: 'アーカイブ',
                userId: user?.id || 1,
                createdAt: new Date().toISOString(),
            }]);
        } else if (accountTransaction) {
            // 残高を戻す
            const txAccountId = accountTransaction.accountId || accountTransaction.fromAccountId;
            if (txAccountId) {
                if (accountTransaction.type === 'transfer') {
                    await updateCollection('accounts', items =>
                        items.map(a => {
                            if (a.id === accountTransaction.fromAccountId) return { ...a, balance: (a.balance || 0) + accountTransaction.amount };
                            if (a.id === accountTransaction.toAccountId) return { ...a, balance: (a.balance || 0) - accountTransaction.amount };
                            return a;
                        })
                    );
                } else {
                    let balanceChange = 0;
                    if (accountTransaction.type === 'interest' || accountTransaction.type === 'investment_gain' || accountTransaction.type === 'deposit') {
                        balanceChange = -accountTransaction.amount;
                    } else if (accountTransaction.type === 'withdrawal') {
                        balanceChange = accountTransaction.amount;
                    }
                    if (balanceChange !== 0) {
                        await updateCollection('accounts', items =>
                            items.map(a => a.id === txAccountId ? { ...a, balance: (a.balance || 0) + balanceChange } : a)
                        );
                    }
                }
            }

            await updateCollection('accountTransactions', items =>
                items.map(t => t.id === originalId ? {
                    ...t,
                    isArchived: true,
                    lastEditedByUserId: user?.id,
                    lastEditedAt: new Date().toISOString()
                } : t)
            );

            await updateCollection('accountTransactionHistories', items => [...items, {
                id: genId(items),
                accountTransactionId: originalId,
                action: 'archived' as const,
                description: 'アーカイブ',
                userId: user?.id || 1,
                createdAt: new Date().toISOString(),
            }]);
        }

        router.push('/lending');
    };

    // 編集保存処理
    const handleEditSave = async (
        _source: 'lending' | 'transaction',
        _originalId: number,
        updates: Partial<Lending> | Partial<AccountTransaction>,
        changes: FieldChange[]
    ) => {
        if (changes.length === 0) return;

        const description = changes.map(c =>
            `${c.displayName}を${c.oldValue || '(なし)'}→${c.newValue || '(なし)'}に変更`
        ).join('、');

        if (source === 'lending' && lending) {
            const lendingUpdates = updates as Partial<Lending>;

            // 旧レコードの影響を取り消す
            if (!lending.returned) {
                const oldBalanceChange = lending.type === 'lend'
                    ? Math.abs(lending.amount)
                    : -Math.abs(lending.amount);
                await updateCollection('accounts', items =>
                    items.map(a => a.id === lending.accountId ? {
                        ...a,
                        balance: (a.balance || 0) + oldBalanceChange
                    } : a)
                );
            }

            // 新しい値で残高を適用
            const newAccountId = lendingUpdates.accountId || lending.accountId;
            const newType = lendingUpdates.type || lending.type;
            const newAmount = lendingUpdates.amount !== undefined ? lendingUpdates.amount : lending.amount;
            if (!lending.returned) {
                const newBalanceChange = newType === 'lend'
                    ? -Math.abs(newAmount)
                    : Math.abs(newAmount);
                await updateCollection('accounts', items =>
                    items.map(a => a.id === newAccountId ? {
                        ...a,
                        balance: (a.balance || 0) + newBalanceChange
                    } : a)
                );
            }

            await updateCollection('lendings', items =>
                items.map(l => l.id === originalId ? {
                    ...l,
                    ...lendingUpdates,
                    lastEditedByUserId: user?.id,
                    lastEditedAt: new Date().toISOString()
                } : l)
            );

            await updateCollection('lendingHistories', items => [...items, {
                id: genId(items),
                lendingId: originalId,
                action: 'updated' as const,
                description,
                changes: JSON.stringify(changes),
                userId: user?.id || 1,
                createdAt: new Date().toISOString(),
            }]);
        } else if (accountTransaction) {
            const transactionUpdates = updates as Partial<AccountTransaction>;

            // 旧レコードの影響を取り消す
            const oldAccountId = accountTransaction.accountId || accountTransaction.fromAccountId;
            if (oldAccountId) {
                if (accountTransaction.type === 'transfer') {
                    await updateCollection('accounts', items =>
                        items.map(a => {
                            if (a.id === accountTransaction.fromAccountId) return { ...a, balance: (a.balance || 0) + accountTransaction.amount };
                            if (a.id === accountTransaction.toAccountId) return { ...a, balance: (a.balance || 0) - accountTransaction.amount };
                            return a;
                        })
                    );
                } else {
                    let balanceChange = 0;
                    if (accountTransaction.type === 'interest' || accountTransaction.type === 'investment_gain' || accountTransaction.type === 'deposit') {
                        balanceChange = -accountTransaction.amount;
                    } else if (accountTransaction.type === 'withdrawal') {
                        balanceChange = accountTransaction.amount;
                    }
                    if (balanceChange !== 0) {
                        await updateCollection('accounts', items =>
                            items.map(a => a.id === oldAccountId ? { ...a, balance: (a.balance || 0) + balanceChange } : a)
                        );
                    }
                }
            }

            // 新しい値で残高を適用
            const newType = transactionUpdates.type || accountTransaction.type;
            const newAmount = transactionUpdates.amount !== undefined ? transactionUpdates.amount : accountTransaction.amount;
            if (newType === 'transfer') {
                const newFromId = transactionUpdates.fromAccountId || accountTransaction.fromAccountId;
                const newToId = transactionUpdates.toAccountId || accountTransaction.toAccountId;
                await updateCollection('accounts', items =>
                    items.map(a => {
                        if (a.id === newFromId) return { ...a, balance: (a.balance || 0) - newAmount };
                        if (a.id === newToId) return { ...a, balance: (a.balance || 0) + newAmount };
                        return a;
                    })
                );
            } else {
                const newAccountId = transactionUpdates.accountId || accountTransaction.accountId;
                if (newAccountId) {
                    let balanceChange = 0;
                    if (newType === 'interest' || newType === 'investment_gain' || newType === 'deposit') {
                        balanceChange = newAmount;
                    } else if (newType === 'withdrawal') {
                        balanceChange = -newAmount;
                    }
                    if (balanceChange !== 0) {
                        await updateCollection('accounts', items =>
                            items.map(a => a.id === newAccountId ? { ...a, balance: (a.balance || 0) + balanceChange } : a)
                        );
                    }
                }
            }

            await updateCollection('accountTransactions', items =>
                items.map(t => t.id === originalId ? {
                    ...t,
                    ...transactionUpdates,
                    lastEditedByUserId: user?.id,
                    lastEditedAt: new Date().toISOString()
                } : t)
            );

            await updateCollection('accountTransactionHistories', items => [...items, {
                id: genId(items),
                accountTransactionId: originalId,
                action: 'updated' as const,
                description,
                changes: JSON.stringify(changes),
                userId: user?.id || 1,
                createdAt: new Date().toISOString(),
            }]);
        }
    };

    // アクションラベルの取得
    const getActionLabel = (action: string) => {
        switch (action) {
            case 'created': return '作成';
            case 'updated': return '編集';
            case 'archived': return 'アーカイブ';
            case 'returned': return '返済';
            default: return action;
        }
    };

    return (
        <AppLayout title="取引詳細">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/lending">
                        <Button variant="secondary">← 戻る</Button>
                    </Link>
                    <h3>取引詳細</h3>
                    <span className={`badge ${getTypeClass()}`}>{getTypeDisplay()}</span>
                    {isArchived && <span className="badge badge-secondary">アーカイブ済み</span>}
                </div>
                {!isArchived && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Button variant="secondary" onClick={() => setEditModalOpen(true)}>編集</Button>
                        <Button variant="danger" onClick={handleArchive}>アーカイブ</Button>
                    </div>
                )}
            </div>

            {/* 取引詳細カード */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>日付</div>
                        <div style={{ fontSize: '1.125rem' }}>{transaction.date}</div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>金額</div>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            color: transaction.amount >= 0 ? 'var(--success)' : 'var(--danger)'
                        }}>
                            {transaction.amount >= 0 ? '' : '-'}¥{Math.abs(transaction.amount).toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                            {source === 'lending' ? '口座' : (transaction.type === 'transfer' ? '振替元' : '口座')}
                        </div>
                        <div>
                            {account ? (
                                <Link href={`/lending/account/${account.id}`} style={{ color: 'var(--primary)' }}>
                                    {account.name}
                                </Link>
                            ) : '-'}
                        </div>
                    </div>
                    {transaction.type === 'transfer' && toAccount && (
                        <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>振替先</div>
                            <div>
                                <Link href={`/lending/account/${toAccount.id}`} style={{ color: 'var(--primary)' }}>
                                    {toAccount.name}
                                </Link>
                            </div>
                        </div>
                    )}
                    {source === 'lending' && counterparty && (
                        <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>相手</div>
                            <div>
                                {transaction.counterpartyType === 'account' ? (
                                    <Link href={`/lending/account/${counterparty.id}`} style={{ color: 'var(--primary)' }}>
                                        💼 {counterparty.name}
                                    </Link>
                                ) : (
                                    <Link href={`/lending/person/${counterparty.id}`} style={{ color: 'var(--primary)' }}>
                                        {counterparty.name}
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}
                    {source === 'lending' && (
                        <div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>状態</div>
                            <div>
                                <span className={`badge ${transaction.returned ? 'badge-done' : 'badge-pending'}`}>
                                    {transaction.returned ? '返済済' : '未返済'}
                                </span>
                            </div>
                        </div>
                    )}
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.25rem' }}>メモ</div>
                        <div>{transaction.memo || '-'}</div>
                    </div>
                </div>

                {/* 作成者・編集者情報 */}
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        <div>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>作成者: </span>
                            <span>{createdBy?.name || '-'}</span>
                        </div>
                        {lastEditedBy && (
                            <div>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>最終編集: </span>
                                <span>{lastEditedBy.name}</span>
                                {lastEditedAt && (
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                                        ({new Date(lastEditedAt).toLocaleString('ja-JP')})
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 編集履歴 */}
            <div className="card">
                <h4 style={{ marginBottom: '1rem' }}>編集履歴</h4>
                {sortedHistories.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem' }}>
                        <div className="empty-state-text">履歴がありません</div>
                    </div>
                ) : (
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {sortedHistories.map(history => {
                            const historyUser = db.users.find(u => u.id === history.userId);
                            return (
                                <div
                                    key={history.id}
                                    style={{
                                        padding: '0.75rem 0',
                                        borderBottom: '1px solid var(--border)',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                                        <div>
                                            <span style={{ fontWeight: 'bold' }}>{historyUser?.name || '不明'}</span>
                                            <span className="badge badge-secondary" style={{ marginLeft: '0.5rem' }}>
                                                {getActionLabel(history.action)}
                                            </span>
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                                            {new Date(history.createdAt).toLocaleString('ja-JP')}
                                        </div>
                                    </div>
                                    {history.description && history.action !== 'created' && (
                                        <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                            {history.description}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 編集モーダル */}
            <TransactionEditModal
                isOpen={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                transaction={transaction}
                accounts={db.accounts}
                persons={db.persons}
                onSave={handleEditSave}
            />
        </AppLayout>
    );
}

export default function TransactionDetailPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <TransactionDetailContent />;
}

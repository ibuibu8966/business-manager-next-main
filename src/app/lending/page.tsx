'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TagInput } from '@/components/ui/TagInput';
import { ReportSendButton } from '@/components/admin/ReportSendButton';
import { TransactionEditModal, CombinedTransaction, FieldChange, generateChangeDescription } from '@/components/lending/TransactionEditModal';
import { Lending, Account, Person, Tag, AccountTransaction, LendingHistory, AccountTransactionHistory } from '@/types';
import { getPersonBalance, getPersonAccountBalance, getAccountBalance, calculatePersonTotals } from '@/lib/lending/balance';
import { createCombinedHistory, CombinedHistoryItem } from '@/lib/lending/history';
import { saveLendingEdit, saveTransactionEdit } from '@/lib/lending/operations';

function LendingContent() {
    const { user } = useAuth();
    const { db, updateCollection } = useDatabase();
    const [modalType, setModalType] = useState<'lending' | 'account' | 'person' | 'tag' | 'transfer' | 'income' | null>(null);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterTag, setFilterTag] = useState('');
    const [newAccountTags, setNewAccountTags] = useState<string[]>([]);
    const [newPersonTags, setNewPersonTags] = useState<string[]>([]);
    // 編集モーダル用
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<CombinedTransaction | null>(null);

    if (!db) return <div>Loading...</div>;

    // アーカイブされていない口座・相手のみ表示
    const activeAccounts = db.accounts.filter(a => !a.isArchived);
    const activePersons = db.persons.filter(p => !p.isArchived);

    // タグでフィルター
    const filteredAccounts = filterTag
        ? activeAccounts.filter(a => a.tags?.includes(filterTag))
        : activeAccounts;
    const filteredPersons = filterTag
        ? activePersons.filter(p => p.tags?.includes(filterTag))
        : activePersons;

    // 残高計算ヘルパー（ユーティリティ関数をラップ）
    const calcPersonBalance = (personId: number) =>
        getPersonBalance(db.lendings, personId);

    const calcPersonAccountBalance = (personId: number) =>
        getPersonAccountBalance(db.lendings, db.personTransactions || [], personId);

    const calcAccountBalance = (accountId: number) =>
        getAccountBalance(db.lendings, accountId);

    // フィルタ済み記録
    let lendings = [...db.lendings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (filterStatus === '未返済') lendings = lendings.filter(l => !l.returned);
    if (filterStatus === '返済済') lendings = lendings.filter(l => l.returned);

    // タグフィルター（貸借履歴）
    if (filterTag) {
        lendings = lendings.filter(l => {
            const account = db.accounts.find(a => a.id === l.accountId);
            if (account?.tags?.includes(filterTag)) return true;
            if (l.counterpartyType === 'person') {
                const person = db.persons.find(p => p.id === l.counterpartyId);
                if (person?.tags?.includes(filterTag)) return true;
            }
            if (l.counterpartyType === 'account') {
                const acc = db.accounts.find(a => a.id === l.counterpartyId);
                if (acc?.tags?.includes(filterTag)) return true;
            }
            return false;
        });
    }

    // 貸借合計を計算
    const { totalLent, totalBorrowed } = calculatePersonTotals(db.lendings, activePersons);

    // 統合履歴の作成（貸借 + 口座取引）- アーカイブ済みを除外
    const combinedHistory = createCombinedHistory(lendings, db.accountTransactions || []);

    const saveLending = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const counterparty = (formData.get('counterparty') as string).split(':');
        const type = formData.get('type') as 'lend' | 'borrow';
        const amount = parseInt(formData.get('amount') as string);
        const accountIdNum = parseInt(formData.get('accountId') as string);

        // 残高を更新（借入=+、貸出=-）
        await updateCollection('accounts', items =>
            items.map(a => a.id === accountIdNum ? {
                ...a,
                balance: (a.balance || 0) + (type === 'borrow' ? amount : -amount)
            } : a)
        );

        // 貸借記録を追加
        const newLendingId = genId(db.lendings);
        await updateCollection('lendings', items => [...items, {
            id: newLendingId,
            accountId: accountIdNum,
            counterpartyType: counterparty[0] as 'account' | 'person',
            counterpartyId: parseInt(counterparty[1]),
            type,
            amount: type === 'lend' ? amount : -amount,
            date: formData.get('date') as string,
            memo: formData.get('memo') as string,
            returned: false,
            createdAt: new Date().toISOString(),
            createdByUserId: user?.id,
        }]);

        // 履歴を記録
        await updateCollection('lendingHistories', items => [...items, {
            id: genId(items),
            lendingId: newLendingId,
            action: 'created' as const,
            description: '作成',
            userId: user?.id || 1,
            createdAt: new Date().toISOString(),
        }]);

        setModalType(null);
    };

    const saveAccount = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const businessId = formData.get('businessId') as string;
        const balance = formData.get('balance') as string;

        // 新規タグをtagsコレクションに追加
        newAccountTags.forEach(tagName => {
            if (!db.tags.some(t => t.name === tagName)) {
                updateCollection('tags', items => [...items, {
                    id: genId(items),
                    name: tagName,
                    color: '#6366f1'
                }]);
            }
        });

        updateCollection('accounts', items => [...items, {
            id: genId(items),
            name: formData.get('name') as string,
            businessId: businessId ? parseInt(businessId) : undefined,
            balance: balance ? parseInt(balance) : undefined,
            tags: newAccountTags,
            isArchived: false
        }]);
        setNewAccountTags([]);
        setModalType(null);
    };

    const savePerson = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const businessId = formData.get('businessId') as string;

        // 新規タグをtagsコレクションに追加
        newPersonTags.forEach(tagName => {
            if (!db.tags.some(t => t.name === tagName)) {
                updateCollection('tags', items => [...items, {
                    id: genId(items),
                    name: tagName,
                    color: '#6366f1'
                }]);
            }
        });

        updateCollection('persons', items => [...items, {
            id: genId(items),
            name: formData.get('name') as string,
            memo: formData.get('memo') as string,
            businessId: businessId ? parseInt(businessId) : undefined,
            tags: newPersonTags,
            isArchived: false
        }]);
        setNewPersonTags([]);
        setModalType(null);
    };

    const saveTag = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        updateCollection('tags', items => [...items, {
            id: genId(items),
            name: formData.get('name') as string,
            color: formData.get('color') as string || undefined
        }]);
        form.reset();
    };

    const deleteTag = (tagId: number) => {
        const tag = db.tags.find(t => t.id === tagId);
        if (!tag) return;

        // このタグを使っている口座・相手がないかチェック
        const usedByAccounts = db.accounts.filter(a => a.tags?.includes(tag.name));
        const usedByPersons = db.persons.filter(p => p.tags?.includes(tag.name));

        if (usedByAccounts.length > 0 || usedByPersons.length > 0) {
            if (!confirm(`このタグは ${usedByAccounts.length + usedByPersons.length} 件で使用中です。削除すると関連付けも解除されます。削除しますか？`)) {
                return;
            }
            // 口座からタグを削除
            if (usedByAccounts.length > 0) {
                updateCollection('accounts', items =>
                    items.map(a => ({
                        ...a,
                        tags: a.tags?.filter(t => t !== tag.name)
                    }))
                );
            }
            // 相手からタグを削除
            if (usedByPersons.length > 0) {
                updateCollection('persons', items =>
                    items.map(p => ({
                        ...p,
                        tags: p.tags?.filter(t => t !== tag.name)
                    }))
                );
            }
        } else {
            if (!confirm(`タグ「${tag.name}」を削除しますか？`)) {
                return;
            }
        }

        updateCollection('tags', items => items.filter(t => t.id !== tagId));
    };

    const saveTransfer = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const fromAccountId = parseInt(formData.get('fromAccountId') as string);
        const toAccountId = parseInt(formData.get('toAccountId') as string);
        const amount = parseInt(formData.get('amount') as string);

        // 残高を更新（振替元から減算、振替先に加算）
        await updateCollection('accounts', items =>
            items.map(a => {
                if (a.id === fromAccountId) return { ...a, balance: (a.balance || 0) - amount };
                if (a.id === toAccountId) return { ...a, balance: (a.balance || 0) + amount };
                return a;
            })
        );

        const newTransactionId = genId(db.accountTransactions || []);
        await updateCollection('accountTransactions', items => [...items, {
            id: newTransactionId,
            type: 'transfer' as const,
            fromAccountId,
            toAccountId,
            amount,
            date: formData.get('date') as string,
            memo: formData.get('memo') as string,
            createdAt: new Date().toISOString(),
            createdByUserId: user?.id,
        }]);

        // 履歴を記録
        await updateCollection('accountTransactionHistories', items => [...items, {
            id: genId(items),
            accountTransactionId: newTransactionId,
            action: 'created' as const,
            description: '作成',
            userId: user?.id || 1,
            createdAt: new Date().toISOString(),
        }]);

        setModalType(null);
    };

    const saveIncome = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const incomeType = formData.get('incomeType') as 'interest' | 'investment_gain';
        const target = formData.get('target') as string;
        const [targetType, targetId] = target.split(':');
        const amount = parseInt(formData.get('amount') as string);
        const date = formData.get('date') as string;
        const memo = formData.get('memo') as string;
        const accountId = targetType === 'account' ? parseInt(targetId) : undefined;

        // 残高を更新（自社口座の場合のみ）
        if (accountId) {
            await updateCollection('accounts', items =>
                items.map(a => a.id === accountId ? { ...a, balance: (a.balance || 0) + amount } : a)
            );
        }

        // 管理会計のtransactionIdを先に生成（連携用）
        let linkedTransactionId: number | undefined;
        if (targetType === 'account') {
            linkedTransactionId = genId(db.transactions || []);
        }

        // 口座取引に追加
        const newTransactionId = genId(db.accountTransactions || []);
        await updateCollection('accountTransactions', items => [...items, {
            id: newTransactionId,
            type: incomeType,
            accountId,
            personId: targetType === 'person' ? parseInt(targetId) : undefined,
            amount,
            date,
            memo,
            createdAt: new Date().toISOString(),
            createdByUserId: user?.id,
            linkedTransactionId,
        }]);

        // 履歴を記録
        await updateCollection('accountTransactionHistories', items => [...items, {
            id: genId(items),
            accountTransactionId: newTransactionId,
            action: 'created' as const,
            description: '作成',
            userId: user?.id || 1,
            createdAt: new Date().toISOString(),
        }]);

        // 管理会計にも追加（自社口座の場合のみ）
        if (targetType === 'account' && linkedTransactionId !== undefined) {
            const isLoss = amount < 0;
            const categoryName = incomeType === 'interest' ? '受取利息' : '運用損益';
            const account = db.accounts.find(a => a.id === parseInt(targetId));

            await updateCollection('transactions', items => [...items, {
                id: linkedTransactionId,
                type: isLoss ? 'expense' as const : 'income' as const,
                businessId: account?.businessId || 1,
                accountId: parseInt(targetId),
                category: categoryName,
                amount: Math.abs(amount),
                date,
                memo: memo || `${categoryName}（${account?.name || ''}）`,
                createdAt: new Date().toISOString()
            }]);
        }

        setModalType(null);
    };

    const markAsReturned = async (lending: Lending) => {
        // 返済時に残高を更新
        // 貸出の返済: 残高 + amount（お金が戻ってくる）
        // 借入の返済: 残高 - |amount|（お金を返す）
        const balanceChange = lending.type === 'lend'
            ? Math.abs(lending.amount)  // 貸出の返済: お金が戻る
            : -Math.abs(lending.amount); // 借入の返済: お金を返す

        await updateCollection('accounts', items =>
            items.map(a => a.id === lending.accountId ? {
                ...a,
                balance: (a.balance || 0) + balanceChange
            } : a)
        );

        await updateCollection('lendings', items => [
            ...items.map(l => l.id === lending.id ? { ...l, returned: true } : l),
            {
                id: genId(items),
                accountId: lending.accountId,
                counterpartyType: lending.counterpartyType,
                counterpartyId: lending.counterpartyId,
                personId: lending.personId,
                type: 'return' as const,
                amount: -lending.amount,
                date: new Date().toISOString().split('T')[0],
                memo: '返済',
                returned: true,
                originalId: lending.id,
                createdAt: new Date().toISOString()
            }
        ]);
    };

    const deleteLending = async (id: number) => {
        const lending = db.lendings.find(l => l.id === id);
        if (!lending) return;

        if (confirm('削除しますか？')) {
            // 未返済の場合のみ残高を元に戻す
            if (!lending.returned) {
                // 貸借記録時の残高変動を相殺
                // 記録時: borrow = +amount, lend = -amount
                // 削除時: borrow = -amount, lend = +amount
                const balanceChange = lending.type === 'borrow'
                    ? -Math.abs(lending.amount)  // 借入の削除: 残高を減らす
                    : Math.abs(lending.amount);  // 貸出の削除: 残高を戻す

                await updateCollection('accounts', items =>
                    items.map(a => a.id === lending.accountId ? {
                        ...a,
                        balance: (a.balance || 0) + balanceChange
                    } : a)
                );
            }

            await updateCollection('lendings', items => items.filter(l => l.id !== id));
        }
    };

    const deleteAccountTransaction = async (id: number) => {
        const transaction = (db.accountTransactions || []).find(t => t.id === id);
        if (!transaction) return;

        if (confirm('削除しますか？')) {
            // 残高を逆算して更新
            const accountId = transaction.accountId || transaction.fromAccountId;
            if (accountId) {
                let balanceChange = 0;
                if (transaction.type === 'interest' || transaction.type === 'investment_gain' || transaction.type === 'deposit') {
                    balanceChange = -transaction.amount; // 加算していた分を減算
                } else if (transaction.type === 'withdrawal') {
                    balanceChange = transaction.amount; // 減算していた分を加算
                } else if (transaction.type === 'transfer') {
                    // 振替の場合は from/to 両方を更新
                    await updateCollection('accounts', items =>
                        items.map(a => {
                            if (a.id === transaction.fromAccountId) {
                                return { ...a, balance: (a.balance || 0) + transaction.amount };
                            }
                            if (a.id === transaction.toAccountId) {
                                return { ...a, balance: (a.balance || 0) - transaction.amount };
                            }
                            return a;
                        })
                    );
                }

                if (transaction.type !== 'transfer' && balanceChange !== 0) {
                    await updateCollection('accounts', items =>
                        items.map(a => a.id === accountId ? {
                            ...a,
                            balance: (a.balance || 0) + balanceChange
                        } : a)
                    );
                }
            }

            await updateCollection('accountTransactions', items => items.filter(t => t.id !== id));
        }
    };

    // アーカイブ処理（残高から除外）
    const archiveTransaction = async (item: typeof combinedHistory[0]) => {
        if (!confirm('この取引をアーカイブしますか？\n※アーカイブすると残高計算から除外されます')) return;

        if (item.source === 'lending') {
            const lending = db.lendings.find(l => l.id === item.originalId);
            if (!lending) return;

            // 残高を戻す（未返済の場合のみ）
            if (!lending.returned) {
                const balanceChange = lending.type === 'lend'
                    ? Math.abs(lending.amount)  // 貸出のアーカイブ: 残高を戻す
                    : -Math.abs(lending.amount); // 借入のアーカイブ: 残高を減らす
                await updateCollection('accounts', items =>
                    items.map(a => a.id === lending.accountId ? {
                        ...a,
                        balance: (a.balance || 0) + balanceChange
                    } : a)
                );
            }

            // アーカイブフラグを設定
            await updateCollection('lendings', items =>
                items.map(l => l.id === item.originalId ? {
                    ...l,
                    isArchived: true,
                    lastEditedByUserId: user?.id,
                    lastEditedAt: new Date().toISOString()
                } : l)
            );

            // 履歴を記録
            await updateCollection('lendingHistories', items => [...items, {
                id: genId(items),
                lendingId: item.originalId,
                action: 'archived' as const,
                description: 'アーカイブ',
                userId: user?.id || 1,
                createdAt: new Date().toISOString(),
            }]);
        } else {
            const transaction = (db.accountTransactions || []).find(t => t.id === item.originalId);
            if (!transaction) return;

            // 残高を戻す
            const accountId = transaction.accountId || transaction.fromAccountId;
            if (accountId) {
                let balanceChange = 0;
                if (transaction.type === 'interest' || transaction.type === 'investment_gain' || transaction.type === 'deposit') {
                    balanceChange = -transaction.amount;
                } else if (transaction.type === 'withdrawal') {
                    balanceChange = transaction.amount;
                } else if (transaction.type === 'transfer') {
                    await updateCollection('accounts', items =>
                        items.map(a => {
                            if (a.id === transaction.fromAccountId) return { ...a, balance: (a.balance || 0) + transaction.amount };
                            if (a.id === transaction.toAccountId) return { ...a, balance: (a.balance || 0) - transaction.amount };
                            return a;
                        })
                    );
                }

                if (transaction.type !== 'transfer' && balanceChange !== 0) {
                    await updateCollection('accounts', items =>
                        items.map(a => a.id === accountId ? { ...a, balance: (a.balance || 0) + balanceChange } : a)
                    );
                }
            }

            // アーカイブフラグを設定
            await updateCollection('accountTransactions', items =>
                items.map(t => t.id === item.originalId ? {
                    ...t,
                    isArchived: true,
                    lastEditedByUserId: user?.id,
                    lastEditedAt: new Date().toISOString()
                } : t)
            );

            // 履歴を記録
            await updateCollection('accountTransactionHistories', items => [...items, {
                id: genId(items),
                accountTransactionId: item.originalId,
                action: 'archived' as const,
                description: 'アーカイブ',
                userId: user?.id || 1,
                createdAt: new Date().toISOString(),
            }]);

            // 管理会計連携: linkedTransactionIdがあればtransactionsも削除
            if (transaction.linkedTransactionId) {
                await updateCollection('transactions', items =>
                    items.filter(t => t.id !== transaction.linkedTransactionId)
                );
            }
        }
    };

    // 編集保存処理（ユーティリティ関数に委譲）
    const handleEditSave = async (
        source: 'lending' | 'transaction',
        originalId: number,
        updates: Partial<Lending> | Partial<AccountTransaction>,
        changes: FieldChange[]
    ) => {
        // updateCollectionの型をoperations.tsと互換性を持たせる
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateCollectionCompat = updateCollection as any;

        if (source === 'lending') {
            await saveLendingEdit(
                db,
                updateCollectionCompat,
                genId,
                user?.id,
                originalId,
                updates as Partial<Lending>,
                changes
            );
        } else {
            await saveTransactionEdit(
                { accountTransactions: db.accountTransactions || [], transactions: db.transactions },
                updateCollectionCompat,
                genId,
                user?.id,
                originalId,
                updates as Partial<AccountTransaction>,
                changes
            );
        }
    };

    return (
        <AppLayout title="貸借管理">
            <div className="page-header">
                <h3>貸借管理</h3>
                <div className="btn-group">
                    <ReportSendButton />
                    <Link href="/lending/archive">
                        <Button variant="ghost">📦 アーカイブ</Button>
                    </Link>
                    <Button variant="ghost" onClick={() => setModalType('tag')}>🏷️ タグ追加</Button>
                    <Button variant="ghost" onClick={() => setModalType('transfer')}>🔄 振替</Button>
                    <Button variant="ghost" onClick={() => setModalType('income')}>💹 利息/運用損益</Button>
                    <Button variant="ghost" onClick={() => setModalType('account')}>+ 社内口座</Button>
                    <Button variant="secondary" onClick={() => setModalType('person')}>+ 外部相手</Button>
                    <Button onClick={() => setModalType('lending')}>+ 貸し借り</Button>
                </div>
            </div>

            {/* タグフィルター */}
            {db.tags.length > 0 && (
                <div className="tag-filter" style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Button
                        size="sm"
                        variant={filterTag === '' ? 'primary' : 'ghost'}
                        onClick={() => setFilterTag('')}
                    >
                        全て
                    </Button>
                    {db.tags.map(tag => (
                        <Button
                            key={tag.id}
                            size="sm"
                            variant={filterTag === tag.name ? 'primary' : 'ghost'}
                            onClick={() => setFilterTag(tag.name)}
                            style={tag.color ? { borderColor: tag.color } : {}}
                        >
                            {tag.name}
                        </Button>
                    ))}
                </div>
            )}

            {/* サマリー */}
            <div className="summary-cards">
                <div className="summary-card lend">
                    <div className="summary-label">📤 貸している合計</div>
                    <div className="summary-value">¥{totalLent.toLocaleString()}</div>
                </div>
                <div className="summary-card borrow">
                    <div className="summary-label">📥 借りている合計</div>
                    <div className="summary-value">¥{totalBorrowed.toLocaleString()}</div>
                </div>
            </div>

            {/* 社内口座 */}
            <h4 style={{ margin: '24px 0 16px' }}>💼 社内口座</h4>
            <div className="accounts-grid">
                {filteredAccounts.map(account => {
                    const lendingBalance = calcAccountBalance(account.id);
                    const business = db.businesses.find(b => b.id === account.businessId);
                    return (
                        <Link key={account.id} href={`/lending/account/${account.id}`} style={{ textDecoration: 'none' }}>
                            <div className="account-card" style={{ cursor: 'pointer' }}>
                                <div className="account-name">{account.name}</div>
                                {account.balance !== undefined && (
                                    <div style={{ fontSize: '28px', fontWeight: 700 }}>
                                        残高: ¥{account.balance.toLocaleString()}
                                    </div>
                                )}
                                <div className={`account-balance ${lendingBalance >= 0 ? 'positive' : 'negative'}`}>
                                    貸借: ¥{lendingBalance.toLocaleString()}
                                </div>
                                {business && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {business.name}
                                    </div>
                                )}
                                {account.tags && account.tags.length > 0 && (
                                    <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
                                        {account.tags.map(tag => (
                                            <span key={tag} className="badge badge-tag">{tag}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Link>
                    );
                })}
                {filteredAccounts.length === 0 && (
                    <p style={{ color: 'var(--text-muted)' }}>口座を追加してください</p>
                )}
            </div>

            {/* 外部相手 */}
            <h4 style={{ margin: '24px 0 16px' }}>👤 外部相手</h4>
            <div className="persons-grid">
                {filteredPersons.map(person => {
                    const balance = calcPersonBalance(person.id);
                    const accountBalance = calcPersonAccountBalance(person.id);
                    const business = db.businesses.find(b => b.id === person.businessId);
                    return (
                        <Link key={person.id} href={`/lending/person/${person.id}`} style={{ textDecoration: 'none' }}>
                            <div className="person-card" style={{ cursor: 'pointer' }}>
                                <div className="person-card-header">
                                    <span className="person-name">{person.name}</span>
                                    <span className={`person-balance ${balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'zero'}`}>
                                        ¥{Math.abs(balance).toLocaleString()}
                                    </span>
                                </div>
                                <span className="person-meta">{balance > 0 ? '貸し' : balance < 0 ? '借り' : '精算済'}</span>
                                <div style={{
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                    color: accountBalance >= 0 ? '#10b981' : '#ef4444',
                                    marginTop: '8px',
                                    padding: '4px 8px',
                                    backgroundColor: accountBalance >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    borderRadius: '4px',
                                    display: 'inline-block'
                                }}>
                                    残高: ¥{accountBalance.toLocaleString()}
                                </div>
                                {business && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        {business.name}
                                    </div>
                                )}
                                {person.tags && person.tags.length > 0 && (
                                    <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
                                        {person.tags.map(tag => (
                                            <span key={tag} className="badge badge-tag">{tag}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </Link>
                    );
                })}
                {filteredPersons.length === 0 && (
                    <p style={{ color: 'var(--text-muted)' }}>外部相手を追加してください</p>
                )}
            </div>

            {/* 履歴 */}
            <h4 style={{ margin: '24px 0 16px' }}>📋 貸借・取引履歴</h4>
            <div className="filters" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">全て</option>
                    <option value="未返済">未返済のみ</option>
                    <option value="返済済">返済済のみ</option>
                </select>
            </div>
            <div className="data-table-container">
                {combinedHistory.length > 0 ? (
                    <table className="data-table">
                        <thead><tr><th>日付</th><th>口座</th><th>相手/詳細</th><th>種類</th><th>金額</th><th>状態</th><th>最終編集者</th><th></th></tr></thead>
                        <tbody>
                            {combinedHistory.map(item => {
                                const account = db.accounts.find(a => a.id === item.accountId);
                                let detailText = '-';

                                if (item.source === 'lending') {
                                    if (item.counterpartyType === 'account') {
                                        const acc = db.accounts.find(a => a.id === item.counterpartyId);
                                        detailText = acc ? `💼 ${acc.name}` : '?';
                                    } else {
                                        const person = db.persons.find(p => p.id === item.counterpartyId);
                                        detailText = person?.name || '?';
                                    }
                                } else if (item.type === 'transfer') {
                                    const toAccount = db.accounts.find(a => a.id === item.toAccountId);
                                    detailText = `→ ${toAccount?.name || '?'}`;
                                }

                                const typeClass = item.type === 'return' ? 'return'
                                    : item.type === 'lend' ? 'lend'
                                    : item.type === 'borrow' ? 'borrow'
                                    : item.type === 'transfer' ? 'transfer'
                                    : 'income';

                                // 最終編集者を取得
                                const lastEditorId = item.lastEditedByUserId || item.createdByUserId;
                                const lastEditor = lastEditorId ? db.users.find(u => u.id === lastEditorId) : null;

                                return (
                                    <tr key={item.id}>
                                        <td>{item.date}</td>
                                        <td>{account?.name || '-'}</td>
                                        <td>{detailText}</td>
                                        <td><span className={`lending-type ${typeClass}`}>{item.displayType}</span></td>
                                        <td className={item.amount >= 0 ? 'amount-positive' : 'amount-negative'}>
                                            {item.amount >= 0 ? '' : '-'}¥{Math.abs(item.amount).toLocaleString()}
                                        </td>
                                        <td>
                                            {item.source === 'lending' ? (
                                                item.returned ? <span className="badge badge-done">返済済</span> : <span className="badge badge-pending">未返済</span>
                                            ) : '-'}
                                        </td>
                                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                            {lastEditor?.name || '-'}
                                        </td>
                                        <td className="actions-cell">
                                            <Link href={`/lending/transaction/${item.id}`}>
                                                <Button size="sm" variant="ghost">詳細</Button>
                                            </Link>
                                            <Button size="sm" variant="secondary" onClick={() => {
                                                setEditingTransaction({
                                                    id: item.id,
                                                    source: item.source,
                                                    originalId: item.originalId,
                                                    type: item.type,
                                                    amount: item.amount,
                                                    date: item.date,
                                                    memo: item.memo,
                                                    accountId: item.accountId,
                                                    counterpartyType: item.source === 'lending' ? item.counterpartyType : undefined,
                                                    counterpartyId: item.source === 'lending' ? item.counterpartyId : undefined,
                                                    fromAccountId: item.source === 'transaction' ? item.accountId : undefined,
                                                    toAccountId: item.source === 'transaction' ? item.toAccountId : undefined,
                                                    returned: item.source === 'lending' ? item.returned : undefined,
                                                });
                                                setEditModalOpen(true);
                                            }}>編集</Button>
                                            <Button size="sm" variant="secondary" onClick={() => archiveTransaction(item)}>アーカイブ</Button>
                                            {item.source === 'lending' && !item.returned && item.type !== 'return' && (
                                                <Button size="sm" variant="success" onClick={() => markAsReturned(db.lendings.find(l => l.id === item.originalId)!)}>返済</Button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <p style={{ color: 'var(--text-muted)', padding: '16px' }}>履歴がありません</p>
                )}
            </div>

            {/* 貸し借りモーダル */}
            <Modal isOpen={modalType === 'lending'} onClose={() => setModalType(null)} title="貸し借りを記録">
                {activeAccounts.length === 0 ? (
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>まず社内口座を追加してください</p>
                        <Button onClick={() => setModalType('account')}>口座を追加</Button>
                    </div>
                ) : (
                    <form onSubmit={saveLending}>
                        <div className="form-group">
                            <label>対象口座</label>
                            <select name="accountId" required>
                                {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>相手</label>
                            <select name="counterparty" required>
                                <optgroup label="社内口座">
                                    {activeAccounts.map(a => <option key={`account:${a.id}`} value={`account:${a.id}`}>{a.name}</option>)}
                                </optgroup>
                                {activePersons.length > 0 && (
                                    <optgroup label="外部相手">
                                        {activePersons.map(p => <option key={`person:${p.id}`} value={`person:${p.id}`}>{p.name}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>種類</label>
                            <select name="type" required>
                                <option value="lend">貸す（相手に渡す）</option>
                                <option value="borrow">借りる（相手から受け取る）</option>
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
                        <Button type="submit" block>記録する</Button>
                    </form>
                )}
            </Modal>

            {/* 口座モーダル */}
            <Modal isOpen={modalType === 'account'} onClose={() => { setModalType(null); setNewAccountTags([]); }} title="社内口座を追加">
                <form onSubmit={saveAccount}>
                    <div className="form-group">
                        <label>口座名</label>
                        <input name="name" placeholder="例: 会社口座、現金、社長個人" required />
                    </div>
                    <div className="form-group">
                        <label>残高（任意）</label>
                        <input name="balance" type="number" placeholder="0" />
                    </div>
                    <div className="form-group">
                        <label>事業（任意）</label>
                        <select name="businessId">
                            <option value="">選択なし</option>
                            {db.businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>タグ（任意）</label>
                        <TagInput
                            tags={newAccountTags}
                            onTagsChange={setNewAccountTags}
                            existingTags={db.tags}
                        />
                    </div>
                    <Button type="submit" block>追加</Button>
                </form>
            </Modal>

            {/* 相手モーダル */}
            <Modal isOpen={modalType === 'person'} onClose={() => { setModalType(null); setNewPersonTags([]); }} title="外部相手を追加">
                <form onSubmit={savePerson}>
                    <div className="form-group">
                        <label>名前</label>
                        <input name="name" placeholder="例: 田中さん、株式会社〇〇" required />
                    </div>
                    <div className="form-group">
                        <label>メモ</label>
                        <input name="memo" />
                    </div>
                    <div className="form-group">
                        <label>事業（任意）</label>
                        <select name="businessId">
                            <option value="">選択なし</option>
                            {db.businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>タグ（任意）</label>
                        <TagInput
                            tags={newPersonTags}
                            onTagsChange={setNewPersonTags}
                            existingTags={db.tags}
                        />
                    </div>
                    <Button type="submit" block>追加</Button>
                </form>
            </Modal>

            {/* タグモーダル */}
            <Modal isOpen={modalType === 'tag'} onClose={() => setModalType(null)} title="タグ管理">
                <form onSubmit={saveTag}>
                    <div className="form-group">
                        <label>タグ名</label>
                        <input name="name" placeholder="例: 重要、定期、個人" required />
                    </div>
                    <div className="form-group">
                        <label>色（任意）</label>
                        <input name="color" type="color" defaultValue="#6366f1" />
                    </div>
                    <Button type="submit" block>追加</Button>
                </form>
                {db.tags.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                        <h5>既存のタグ</h5>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                            {db.tags.map(tag => (
                                <span
                                    key={tag.id}
                                    className="badge"
                                    style={{
                                        backgroundColor: tag.color || '#6366f1',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    {tag.name}
                                    <button
                                        type="button"
                                        onClick={() => deleteTag(tag.id)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: 0,
                                            marginLeft: '4px',
                                            color: 'inherit',
                                            fontSize: '14px',
                                            lineHeight: 1
                                        }}
                                        title="削除"
                                    >
                                        ×
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </Modal>

            {/* 振替モーダル */}
            <Modal isOpen={modalType === 'transfer'} onClose={() => setModalType(null)} title="口座間振替">
                <form onSubmit={saveTransfer}>
                    <div className="form-group">
                        <label>振替元口座</label>
                        <select name="fromAccountId" required>
                            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>振替先口座</label>
                        <select name="toAccountId" required>
                            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
                    <Button type="submit" block>振替を記録</Button>
                </form>
            </Modal>

            {/* 利息/運用損益モーダル */}
            <Modal isOpen={modalType === 'income'} onClose={() => setModalType(null)} title="利息・運用損益を記録">
                <form onSubmit={saveIncome}>
                    <div className="form-group">
                        <label>種類</label>
                        <select name="incomeType" required>
                            <option value="interest">受取利息</option>
                            <option value="investment_gain">運用損益</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>対象</label>
                        <select name="target" required>
                            <optgroup label="社内口座">
                                {activeAccounts.map(a => <option key={`account:${a.id}`} value={`account:${a.id}`}>{a.name}</option>)}
                            </optgroup>
                            {activePersons.length > 0 && (
                                <optgroup label="外部相手">
                                    {activePersons.map(p => <option key={`person:${p.id}`} value={`person:${p.id}`}>{p.name}</option>)}
                                </optgroup>
                            )}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>金額</label>
                        <input type="number" name="amount" required />
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            ※ 運用損の場合はマイナス値を入力
                        </p>
                    </div>
                    <div className="form-group">
                        <label>日付</label>
                        <input type="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                    </div>
                    <div className="form-group">
                        <label>メモ</label>
                        <input type="text" name="memo" />
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                        ※ 利息・運用損益は管理会計に自動で反映されます
                    </p>
                    <Button type="submit" block>記録する</Button>
                </form>
            </Modal>

            {/* 編集モーダル */}
            <TransactionEditModal
                isOpen={editModalOpen}
                onClose={() => {
                    setEditModalOpen(false);
                    setEditingTransaction(null);
                }}
                transaction={editingTransaction}
                accounts={db.accounts}
                persons={db.persons}
                onSave={handleEditSave}
            />
        </AppLayout>
    );
}

export default function LendingPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <LendingContent />;
}

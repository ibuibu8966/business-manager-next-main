'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Lending, Account, Person, Tag, AccountTransaction } from '@/types';

function LendingContent() {
    const { db, updateCollection } = useDatabase();
    const [modalType, setModalType] = useState<'lending' | 'account' | 'person' | 'tag' | 'transfer' | 'income' | null>(null);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterTag, setFilterTag] = useState('');
    const [newAccountTags, setNewAccountTags] = useState<string[]>([]);
    const [newTagInput, setNewTagInput] = useState('');

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

    // 残高計算
    const getPersonBalance = (personId: number) => {
        return db.lendings
            .filter(l => (l.counterpartyType === 'person' && l.counterpartyId === personId) || (!l.counterpartyType && l.personId === personId))
            .reduce((sum, l) => sum + l.amount, 0);
    };

    const getAccountBalance = (accountId: number) => {
        let balance = 0;
        db.lendings.forEach(l => {
            if (l.accountId === accountId) balance -= l.amount;
            if (l.counterpartyType === 'account' && l.counterpartyId === accountId) balance += l.amount;
        });
        return balance;
    };

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

    const totalLent = activePersons.reduce((s, p) => { const b = getPersonBalance(p.id); return b > 0 ? s + b : s; }, 0);
    const totalBorrowed = activePersons.reduce((s, p) => { const b = getPersonBalance(p.id); return b < 0 ? s + Math.abs(b) : s; }, 0);

    // 統合履歴の作成（貸借 + 口座取引）
    const combinedHistory = [
        // 貸借履歴
        ...lendings.map(l => ({
            id: `lending-${l.id}`,
            date: l.date,
            type: l.type === 'return' ? 'return' : (l.amount > 0 ? 'lend' : 'borrow'),
            displayType: l.type === 'return' ? '返済' : (l.amount > 0 ? '貸し' : '借り'),
            amount: l.amount,
            accountId: l.accountId,
            counterpartyType: l.counterpartyType,
            counterpartyId: l.counterpartyId || l.personId,
            memo: l.memo,
            returned: l.returned,
            source: 'lending' as const,
            originalId: l.id
        })),
        // 口座取引履歴（受取利息・運用益・振替）
        ...(db.accountTransactions || []).map(t => ({
            id: `transaction-${t.id}`,
            date: t.date,
            type: t.type,
            displayType: t.type === 'transfer' ? '振替' : (t.type === 'interest' ? '受取利息' : (t.amount < 0 ? '運用損' : '運用益')),
            amount: t.amount,
            accountId: t.type === 'transfer' ? t.fromAccountId : t.accountId,
            toAccountId: t.toAccountId,
            memo: t.memo,
            source: 'transaction' as const,
            originalId: t.id
        }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const saveLending = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const counterparty = (formData.get('counterparty') as string).split(':');
        const type = formData.get('type') as 'lend' | 'borrow';
        const amount = parseInt(formData.get('amount') as string);

        updateCollection('lendings', items => [...items, {
            id: genId(items),
            accountId: parseInt(formData.get('accountId') as string),
            counterpartyType: counterparty[0] as 'account' | 'person',
            counterpartyId: parseInt(counterparty[1]),
            type,
            amount: type === 'lend' ? amount : -amount,
            date: formData.get('date') as string,
            memo: formData.get('memo') as string,
            returned: false,
            createdAt: new Date().toISOString()
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
        setNewTagInput('');
        setModalType(null);
    };

    const savePerson = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const businessId = formData.get('businessId') as string;
        updateCollection('persons', items => [...items, {
            id: genId(items),
            name: formData.get('name') as string,
            memo: formData.get('memo') as string,
            businessId: businessId ? parseInt(businessId) : undefined,
            tags: [],
            isArchived: false
        }]);
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

    const saveTransfer = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        updateCollection('accountTransactions', items => [...items, {
            id: genId(items),
            type: 'transfer' as const,
            fromAccountId: parseInt(formData.get('fromAccountId') as string),
            toAccountId: parseInt(formData.get('toAccountId') as string),
            amount: parseInt(formData.get('amount') as string),
            date: formData.get('date') as string,
            memo: formData.get('memo') as string,
            createdAt: new Date().toISOString()
        }]);
        setModalType(null);
    };

    const saveIncome = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const incomeType = formData.get('incomeType') as 'interest' | 'investment_gain';
        const target = formData.get('target') as string;
        const [targetType, targetId] = target.split(':');
        const amount = parseInt(formData.get('amount') as string);
        const date = formData.get('date') as string;
        const memo = formData.get('memo') as string;

        // 口座取引に追加
        updateCollection('accountTransactions', items => [...items, {
            id: genId(items),
            type: incomeType,
            accountId: targetType === 'account' ? parseInt(targetId) : undefined,
            personId: targetType === 'person' ? parseInt(targetId) : undefined,
            amount,
            date,
            memo,
            createdAt: new Date().toISOString()
        }]);

        // 管理会計にも追加（自社口座の場合のみ）
        if (targetType === 'account') {
            const isLoss = amount < 0;
            const categoryName = incomeType === 'interest' ? '受取利息' : (isLoss ? '運用損' : '運用益');
            const account = db.accounts.find(a => a.id === parseInt(targetId));

            updateCollection('transactions', items => [...items, {
                id: genId(items),
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

    const markAsReturned = (lending: Lending) => {
        updateCollection('lendings', items => [
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

    const deleteLending = (id: number) => {
        if (confirm('削除しますか？')) {
            updateCollection('lendings', items => items.filter(l => l.id !== id));
        }
    };

    return (
        <AppLayout title="貸借管理">
            <div className="page-header">
                <h3>貸借管理</h3>
                <div className="btn-group">
                    <Link href="/lending/archive">
                        <Button variant="ghost">📦 アーカイブ</Button>
                    </Link>
                    <Button variant="ghost" onClick={() => setModalType('tag')}>🏷️ タグ追加</Button>
                    <Button variant="ghost" onClick={() => setModalType('transfer')}>🔄 振替</Button>
                    <Button variant="ghost" onClick={() => setModalType('income')}>💹 利息/運用益</Button>
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
                    const lendingBalance = getAccountBalance(account.id);
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
                    const balance = getPersonBalance(person.id);
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
                        <thead><tr><th>日付</th><th>口座</th><th>相手/詳細</th><th>種類</th><th>金額</th><th>状態</th><th></th></tr></thead>
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

                                return (
                                    <tr key={item.id}>
                                        <td>{item.date}</td>
                                        <td>{account?.name || '-'}</td>
                                        <td>{detailText}</td>
                                        <td><span className={`lending-type ${typeClass}`}>{item.displayType}</span></td>
                                        <td className={item.amount >= 0 ? 'amount-positive' : 'amount-negative'}>
                                            ¥{Math.abs(item.amount).toLocaleString()}
                                        </td>
                                        <td>
                                            {item.source === 'lending' ? (
                                                item.returned ? <span className="badge badge-done">返済済</span> : <span className="badge badge-pending">未返済</span>
                                            ) : '-'}
                                        </td>
                                        <td className="actions-cell">
                                            {item.source === 'lending' && !item.returned && item.type !== 'return' && (
                                                <Button size="sm" variant="success" onClick={() => markAsReturned(db.lendings.find(l => l.id === item.originalId)!)}>返済</Button>
                                            )}
                                            {item.source === 'lending' && (
                                                <Button size="sm" variant="danger" onClick={() => deleteLending(item.originalId)}>削除</Button>
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
                            <label>この口座から</label>
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
            <Modal isOpen={modalType === 'account'} onClose={() => { setModalType(null); setNewAccountTags([]); setNewTagInput(''); }} title="社内口座を追加">
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
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <input
                                type="text"
                                value={newTagInput}
                                onChange={e => setNewTagInput(e.target.value)}
                                placeholder="タグ名を入力"
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (newTagInput.trim() && !newAccountTags.includes(newTagInput.trim())) {
                                            setNewAccountTags([...newAccountTags, newTagInput.trim()]);
                                            setNewTagInput('');
                                        }
                                    }
                                }}
                                style={{ flex: 1 }}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                    if (newTagInput.trim() && !newAccountTags.includes(newTagInput.trim())) {
                                        setNewAccountTags([...newAccountTags, newTagInput.trim()]);
                                        setNewTagInput('');
                                    }
                                }}
                            >
                                追加
                            </Button>
                        </div>
                        {newAccountTags.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                {newAccountTags.map(tag => (
                                    <span
                                        key={tag}
                                        className="badge"
                                        style={{ backgroundColor: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => setNewAccountTags(newAccountTags.filter(t => t !== tag))}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', fontSize: '14px' }}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        {db.tags.length > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>既存タグから選択:</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {db.tags.filter(t => !newAccountTags.includes(t.name)).map(tag => (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            className="badge"
                                            style={{ backgroundColor: tag.color || '#6366f1', cursor: 'pointer', border: 'none' }}
                                            onClick={() => setNewAccountTags([...newAccountTags, tag.name])}
                                        >
                                            + {tag.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <Button type="submit" block>追加</Button>
                </form>
            </Modal>

            {/* 相手モーダル */}
            <Modal isOpen={modalType === 'person'} onClose={() => setModalType(null)} title="外部相手を追加">
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

            {/* 利息/運用益モーダル */}
            <Modal isOpen={modalType === 'income'} onClose={() => setModalType(null)} title="利息・運用益を記録">
                <form onSubmit={saveIncome}>
                    <div className="form-group">
                        <label>種類</label>
                        <select name="incomeType" required>
                            <option value="interest">受取利息</option>
                            <option value="investment_gain">運用益</option>
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
                        ※ 利息・運用益は管理会計に自動で反映されます
                    </p>
                    <Button type="submit" block>記録する</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

export default function LendingPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <LendingContent />;
}

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
        updateCollection('accounts', items => [...items, {
            id: genId(items),
            name: formData.get('name') as string,
            businessId: businessId ? parseInt(businessId) : undefined,
            balance: balance ? parseInt(balance) : undefined,
            tags: [],
            isArchived: false
        }]);
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
        setModalType(null);
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
        const accountId = parseInt(formData.get('accountId') as string);
        const amount = parseInt(formData.get('amount') as string);
        const date = formData.get('date') as string;
        const memo = formData.get('memo') as string;

        // 口座取引に追加
        updateCollection('accountTransactions', items => [...items, {
            id: genId(items),
            type: incomeType,
            accountId,
            amount,
            date,
            memo,
            createdAt: new Date().toISOString()
        }]);

        // 管理会計にも追加（利息 or 運用益）
        const categoryName = incomeType === 'interest' ? '受取利息' : '運用益';
        const account = db.accounts.find(a => a.id === accountId);
        updateCollection('transactions', items => [...items, {
            id: genId(items),
            type: 'income' as const,
            businessId: account?.businessId || 1,
            accountId,
            category: categoryName,
            amount,
            date,
            memo: memo || `${categoryName}（${account?.name || ''}）`,
            createdAt: new Date().toISOString()
        }]);

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
                    <Button variant="ghost" onClick={() => setModalType('transfer')}>🔄 口座移転</Button>
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
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
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
            <h4 style={{ margin: '24px 0 16px' }}>📋 貸借履歴</h4>
            <div className="filters" style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">全て</option>
                    <option value="未返済">未返済のみ</option>
                    <option value="返済済">返済済のみ</option>
                </select>
            </div>
            <div className="data-table-container">
                {lendings.length > 0 ? (
                    <table className="data-table">
                        <thead><tr><th>日付</th><th>口座</th><th>相手</th><th>種類</th><th>金額</th><th>状態</th><th></th></tr></thead>
                        <tbody>
                            {lendings.map(l => {
                                const account = db.accounts.find(a => a.id === l.accountId);
                                let counterpartyName = '-';
                                if (l.counterpartyType === 'account') {
                                    const acc = db.accounts.find(a => a.id === l.counterpartyId);
                                    counterpartyName = acc ? `💼 ${acc.name}` : '?';
                                } else {
                                    const person = db.persons.find(p => p.id === (l.counterpartyId || l.personId));
                                    counterpartyName = person?.name || '?';
                                }
                                return (
                                    <tr key={l.id}>
                                        <td>{l.date}</td>
                                        <td>{account?.name || '-'}</td>
                                        <td>{counterpartyName}</td>
                                        <td><span className={`lending-type ${l.type === 'return' ? 'return' : l.amount > 0 ? 'lend' : 'borrow'}`}>
                                            {l.type === 'return' ? '返済' : l.amount > 0 ? '貸し' : '借り'}
                                        </span></td>
                                        <td className={l.amount >= 0 ? 'amount-positive' : 'amount-negative'}>¥{Math.abs(l.amount).toLocaleString()}</td>
                                        <td>{l.returned ? <span className="badge badge-done">返済済</span> : <span className="badge badge-pending">未返済</span>}</td>
                                        <td className="actions-cell">
                                            {!l.returned && l.type !== 'return' && <Button size="sm" variant="success" onClick={() => markAsReturned(l)}>返済</Button>}
                                            <Button size="sm" variant="danger" onClick={() => deleteLending(l.id)}>削除</Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <p style={{ color: 'var(--text-muted)', padding: '16px' }}>貸し借りの記録がありません</p>
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
            <Modal isOpen={modalType === 'account'} onClose={() => setModalType(null)} title="社内口座を追加">
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
            <Modal isOpen={modalType === 'tag'} onClose={() => setModalType(null)} title="タグを追加">
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
                                <span key={tag.id} className="badge" style={{ backgroundColor: tag.color || '#6366f1' }}>
                                    {tag.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </Modal>

            {/* 口座移転モーダル */}
            <Modal isOpen={modalType === 'transfer'} onClose={() => setModalType(null)} title="口座間移転">
                <form onSubmit={saveTransfer}>
                    <div className="form-group">
                        <label>移転元口座</label>
                        <select name="fromAccountId" required>
                            {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>移転先口座</label>
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
                    <Button type="submit" block>移転を記録</Button>
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
                        <label>口座</label>
                        <select name="accountId" required>
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

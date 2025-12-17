'use client';

import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Lending, Account, Person } from '@/types';

function LendingContent() {
    const { db, updateCollection } = useDatabase();
    const [modalType, setModalType] = useState<'lending' | 'account' | 'person' | null>(null);
    const [filterPerson, setFilterPerson] = useState('');
    const [filterAccount, setFilterAccount] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    if (!db) return <div>Loading...</div>;

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
    if (filterPerson) lendings = lendings.filter(l => (l.counterpartyType === 'person' && l.counterpartyId === parseInt(filterPerson)) || l.personId === parseInt(filterPerson));
    if (filterAccount) lendings = lendings.filter(l => l.accountId === parseInt(filterAccount));
    if (filterStatus === '未返済') lendings = lendings.filter(l => !l.returned);
    if (filterStatus === '返済済') lendings = lendings.filter(l => l.returned);

    const totalLent = db.persons.reduce((s, p) => { const b = getPersonBalance(p.id); return b > 0 ? s + b : s; }, 0);
    const totalBorrowed = db.persons.reduce((s, p) => { const b = getPersonBalance(p.id); return b < 0 ? s + Math.abs(b) : s; }, 0);

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
        updateCollection('accounts', items => [...items, {
            id: genId(items),
            name: formData.get('name') as string
        }]);
        setModalType(null);
    };

    const savePerson = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        updateCollection('persons', items => [...items, {
            id: genId(items),
            name: formData.get('name') as string,
            memo: formData.get('memo') as string
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
        <AppLayout title="貸し借り管理">
            <div className="page-header">
                <h3>貸し借り管理</h3>
                <div className="btn-group">
                    <Button variant="ghost" onClick={() => setModalType('account')}>+ 社内口座</Button>
                    <Button variant="secondary" onClick={() => setModalType('person')}>+ 外部相手</Button>
                    <Button onClick={() => setModalType('lending')}>+ 貸し借り</Button>
                </div>
            </div>

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
                {db.accounts.map(account => {
                    const balance = getAccountBalance(account.id);
                    return (
                        <div key={account.id} className="account-card">
                            <div className="account-name">{account.name}</div>
                            <div className={`account-balance ${balance >= 0 ? 'positive' : 'negative'}`}>
                                ¥{balance.toLocaleString()}
                            </div>
                        </div>
                    );
                })}
                {db.accounts.length === 0 && (
                    <p style={{ color: 'var(--text-muted)' }}>口座を追加してください</p>
                )}
            </div>

            {/* 外部相手 */}
            <h4 style={{ margin: '24px 0 16px' }}>👤 外部相手</h4>
            <div className="persons-grid">
                {db.persons.map(person => {
                    const balance = getPersonBalance(person.id);
                    return (
                        <div key={person.id} className="person-card">
                            <div className="person-card-header">
                                <span className="person-name">{person.name}</span>
                                <span className={`person-balance ${balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'zero'}`}>
                                    ¥{Math.abs(balance).toLocaleString()}
                                </span>
                            </div>
                            <span className="person-meta">{balance > 0 ? '貸し' : balance < 0 ? '借り' : '精算済'}</span>
                        </div>
                    );
                })}
            </div>

            {/* 履歴 */}
            <h4 style={{ margin: '24px 0 16px' }}>📋 貸し借り履歴</h4>
            <div className="filters">
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
                {db.accounts.length === 0 ? (
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>まず社内口座を追加してください</p>
                        <Button onClick={() => setModalType('account')}>口座を追加</Button>
                    </div>
                ) : (
                    <form onSubmit={saveLending}>
                        <div className="form-group">
                            <label>この口座から</label>
                            <select name="accountId" required>
                                {db.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>相手</label>
                            <select name="counterparty" required>
                                <optgroup label="社内口座">
                                    {db.accounts.map(a => <option key={`account:${a.id}`} value={`account:${a.id}`}>{a.name}</option>)}
                                </optgroup>
                                {db.persons.length > 0 && (
                                    <optgroup label="外部相手">
                                        {db.persons.map(p => <option key={`person:${p.id}`} value={`person:${p.id}`}>{p.name}</option>)}
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
                    <Button type="submit" block>追加</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

function LendingPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <LendingContent />;
}

export default function Page() {
    return (
        <AuthProvider>
            <LendingPage />
        </AuthProvider>
    );
}

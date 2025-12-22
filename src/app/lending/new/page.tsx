'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';

function NewLendingContent() {
    const router = useRouter();
    const { db, updateCollection } = useDatabase();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showAccountForm, setShowAccountForm] = useState(false);
    const [showPersonForm, setShowPersonForm] = useState(false);

    if (!db) return <div>Loading...</div>;

    const saveLending = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

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

        router.push('/lending');
    };

    const saveAccount = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        updateCollection('accounts', items => [...items, {
            id: genId(items),
            name: formData.get('name') as string
        }]);
        setShowAccountForm(false);
        form.reset();
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
        setShowPersonForm(false);
        form.reset();
    };

    const hasAccounts = db.accounts.length > 0;

    return (
        <AppLayout title="貸し借り記録">
            <div className="page-header">
                <h3>貸し借りを記録</h3>
                <Button variant="ghost" onClick={() => router.push('/lending')}>← 戻る</Button>
            </div>

            <div style={{ maxWidth: '600px' }}>
                {/* 口座がない場合の警告 */}
                {!hasAccounts && (
                    <div style={{
                        background: 'var(--bg-tertiary)',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '24px',
                        border: '1px solid var(--border)'
                    }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            まず社内口座を追加してください
                        </p>
                        <Button onClick={() => setShowAccountForm(true)}>+ 口座を追加</Button>
                    </div>
                )}

                {/* クイック追加ボタン */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                    <Button variant="ghost" onClick={() => setShowAccountForm(!showAccountForm)}>
                        + 社内口座を追加
                    </Button>
                    <Button variant="secondary" onClick={() => setShowPersonForm(!showPersonForm)}>
                        + 外部相手を追加
                    </Button>
                </div>

                {/* 口座追加フォーム */}
                {showAccountForm && (
                    <div style={{
                        background: 'var(--bg-tertiary)',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '24px'
                    }}>
                        <h4 style={{ marginBottom: '12px' }}>社内口座を追加</h4>
                        <form onSubmit={saveAccount}>
                            <div className="form-group">
                                <label>口座名</label>
                                <input name="name" placeholder="例: 会社口座、現金、社長個人" required />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Button type="submit" size="sm">追加</Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => setShowAccountForm(false)}>キャンセル</Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* 相手追加フォーム */}
                {showPersonForm && (
                    <div style={{
                        background: 'var(--bg-tertiary)',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '24px'
                    }}>
                        <h4 style={{ marginBottom: '12px' }}>外部相手を追加</h4>
                        <form onSubmit={savePerson}>
                            <div className="form-group">
                                <label>名前</label>
                                <input name="name" placeholder="例: 田中さん、株式会社〇〇" required />
                            </div>
                            <div className="form-group">
                                <label>メモ</label>
                                <input name="memo" placeholder="連絡先など" />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Button type="submit" size="sm">追加</Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => setShowPersonForm(false)}>キャンセル</Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* メイン貸し借りフォーム */}
                {hasAccounts && (
                    <div className="form-container">
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
                                <input type="number" name="amount" min="1" placeholder="10000" required />
                            </div>
                            <div className="form-group">
                                <label>日付</label>
                                <input type="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                            </div>
                            <div className="form-group">
                                <label>メモ</label>
                                <input type="text" name="memo" placeholder="例: 立替分、飲み会代" />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting ? '保存中...' : '記録する'}
                                </Button>
                                <Button type="button" variant="ghost" onClick={() => router.push('/lending')}>
                                    キャンセル
                                </Button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

function NewLendingPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <NewLendingContent />;
}

export default function Page() {
    return (
        <AuthProvider>
            <NewLendingPage />
        </AuthProvider>
    );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
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
            <style jsx>{`
                .mobile-form-container {
                    max-width: 600px;
                    padding: 0 16px;
                }
                .mobile-header {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                .mobile-header h3 {
                    font-size: 18px;
                    margin: 0;
                }
                .quick-buttons {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 24px;
                    flex-wrap: wrap;
                }
                .form-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }
                .form-actions {
                    display: flex;
                    gap: 12px;
                    margin-top: 24px;
                }
                .inline-form {
                    background: var(--bg-tertiary);
                    padding: 16px;
                    border-radius: 8px;
                    margin-bottom: 24px;
                }
                .inline-form-buttons {
                    display: flex;
                    gap: 8px;
                }
                @media (max-width: 600px) {
                    .mobile-form-container {
                        padding: 0;
                    }
                    .mobile-header {
                        margin-bottom: 12px;
                    }
                    .mobile-header h3 {
                        display: none;
                    }
                    .quick-buttons {
                        flex-direction: column;
                        gap: 8px;
                    }
                    .quick-buttons button {
                        width: 100%;
                    }
                    .form-row {
                        grid-template-columns: 1fr;
                        gap: 0;
                    }
                    .form-actions {
                        flex-direction: column;
                    }
                    .form-actions button {
                        width: 100%;
                    }
                    .inline-form {
                        padding: 12px;
                    }
                    .inline-form-buttons {
                        flex-direction: column;
                    }
                    .inline-form-buttons button {
                        width: 100%;
                    }
                }
            `}</style>

            <div className="mobile-header">
                <h3>貸し借りを記録</h3>
                <Button variant="ghost" onClick={() => router.push('/lending')}>← 戻る</Button>
            </div>

            <div className="mobile-form-container">
                {/* 口座がない場合の警告 */}
                {!hasAccounts && (
                    <div className="inline-form" style={{ border: '1px solid var(--border)' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                            まず社内口座を追加してください
                        </p>
                        <Button onClick={() => setShowAccountForm(true)}>+ 口座を追加</Button>
                    </div>
                )}

                {/* クイック追加ボタン */}
                <div className="quick-buttons">
                    <Button variant="ghost" onClick={() => setShowAccountForm(!showAccountForm)}>
                        + 社内口座を追加
                    </Button>
                    <Button variant="secondary" onClick={() => setShowPersonForm(!showPersonForm)}>
                        + 外部相手を追加
                    </Button>
                </div>

                {/* 口座追加フォーム */}
                {showAccountForm && (
                    <div className="inline-form">
                        <h4 style={{ marginBottom: '12px' }}>社内口座を追加</h4>
                        <form onSubmit={saveAccount}>
                            <div className="form-group">
                                <label>口座名</label>
                                <input name="name" placeholder="例: 会社口座、現金、社長個人" required />
                            </div>
                            <div className="inline-form-buttons">
                                <Button type="submit" size="sm">追加</Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => setShowAccountForm(false)}>キャンセル</Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* 相手追加フォーム */}
                {showPersonForm && (
                    <div className="inline-form">
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
                            <div className="inline-form-buttons">
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
                            <div className="form-row">
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
                            </div>
                            <div className="form-row">
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
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>日付</label>
                                    <input type="date" name="date" defaultValue={new Date().toISOString().split('T')[0]} required />
                                </div>
                                <div className="form-group">
                                    <label>メモ</label>
                                    <input type="text" name="memo" placeholder="例: 立替分、飲み会代" />
                                </div>
                            </div>
                            <div className="form-actions">
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

export default function NewLendingPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <NewLendingContent />;
}

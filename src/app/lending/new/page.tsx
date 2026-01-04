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
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!db) return <div>Loading...</div>;

    // アクティブな口座・相手のみ表示
    const activeAccounts = db.accounts.filter(a => !a.isArchived);
    const activePersons = db.persons.filter(p => !p.isArchived);

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

    const hasAccounts = activeAccounts.length > 0;

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
                .user-header {
                    display: none;
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
                .no-account-message {
                    background: var(--bg-tertiary);
                    padding: 24px;
                    border-radius: 8px;
                    text-align: center;
                    border: 1px solid var(--border);
                }
                @media (max-width: 600px) {
                    :global(#main-header) {
                        display: none;
                    }
                    .user-header {
                        display: flex;
                        align-items: center;
                        justify-content: flex-end;
                        gap: 8px;
                        padding: 12px 0;
                        margin-bottom: 8px;
                        border-bottom: 1px solid var(--border-color);
                    }
                    .user-header .user-name {
                        font-weight: 600;
                    }
                    .user-header .user-badge {
                        background: var(--danger);
                        color: white;
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                    }
                    .mobile-form-container {
                        padding: 0;
                    }
                    .mobile-header {
                        margin-bottom: 12px;
                    }
                    .mobile-header h3 {
                        display: none;
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
                }
            `}</style>

            <div className="user-header">
                <span className="user-name">{user?.name}</span>
                {user?.isAdmin && <span className="user-badge">管理者</span>}
            </div>

            <div className="mobile-header">
                <h3>貸し借りを記録</h3>
                <Button variant="ghost" onClick={() => router.push('/lending')}>← 戻る</Button>
            </div>

            <div className="mobile-form-container">
                {/* 口座がない場合のメッセージ */}
                {!hasAccounts && (
                    <div className="no-account-message">
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            まず社内口座を追加してください
                        </p>
                        <Button onClick={() => router.push('/lending')}>
                            貸借管理ページで口座を追加
                        </Button>
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

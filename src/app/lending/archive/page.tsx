'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase } from '@/lib/db';
import { Button } from '@/components/ui/Button';

function ArchiveContent() {
    const { db, updateCollection } = useDatabase();

    if (!db) return <div>Loading...</div>;

    const archivedAccounts = db.accounts.filter(a => a.isArchived);
    const archivedPersons = db.persons.filter(p => p.isArchived);

    // アーカイブ済み取引履歴
    const archivedLendings = db.lendings.filter(l => l.isArchived);
    const archivedTransactions = (db.accountTransactions || []).filter(t => t.isArchived);
    const archivedPersonTransactions = (db.personTransactions || []).filter(t => t.isArchived);

    const unarchiveAccount = (id: number) => {
        if (confirm('この口座のアーカイブを取り消しますか？')) {
            updateCollection('accounts', items =>
                items.map(a => a.id === id ? { ...a, isArchived: false } : a)
            );
        }
    };

    const unarchivePerson = (id: number) => {
        if (confirm('この相手のアーカイブを取り消しますか？')) {
            updateCollection('persons', items =>
                items.map(p => p.id === id ? { ...p, isArchived: false } : p)
            );
        }
    };

    // 取引種類の表示名を取得
    const getTransactionTypeDisplay = (type: string, amount: number) => {
        switch (type) {
            case 'lend': return '貸し';
            case 'borrow': return '借り';
            case 'return': return '返済';
            case 'transfer': return '振替';
            case 'interest': return '受取利息';
            case 'investment_gain': return '運用損益';
            case 'deposit': return '純入金';
            case 'withdrawal': return '純出金';
            default: return type;
        }
    };

    const hasArchivedItems = archivedAccounts.length > 0 || archivedPersons.length > 0 || archivedLendings.length > 0 || archivedTransactions.length > 0 || archivedPersonTransactions.length > 0;

    return (
        <AppLayout title="アーカイブ一覧">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/lending">
                        <Button variant="secondary">← 戻る</Button>
                    </Link>
                    <h3>アーカイブ一覧</h3>
                </div>
            </div>

            {!hasArchivedItems ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📦</div>
                    <div className="empty-state-text">アーカイブされた項目はありません</div>
                </div>
            ) : (
                <>
                    {/* アーカイブ済み口座 */}
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ marginBottom: '1rem' }}>社内口座</h4>
                        {archivedAccounts.length === 0 ? (
                            <div style={{ color: 'var(--text-secondary)', padding: '1rem' }}>
                                アーカイブ済みの口座はありません
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                                {archivedAccounts.map(account => {
                                    const business = account.businessId ? db.businesses.find(b => b.id === account.businessId) : null;
                                    const relatedLendings = db.lendings.filter(l =>
                                        l.accountId === account.id ||
                                        (l.counterpartyType === 'account' && l.counterpartyId === account.id)
                                    );
                                    let lendingBalance = 0;
                                    relatedLendings.filter(l => !l.returned).forEach(l => {
                                        if (l.accountId === account.id) {
                                            lendingBalance += l.type === 'lend' ? Math.abs(l.amount) : -Math.abs(l.amount);
                                        }
                                        if (l.counterpartyType === 'account' && l.counterpartyId === account.id) {
                                            lendingBalance += l.type === 'lend' ? -Math.abs(l.amount) : Math.abs(l.amount);
                                        }
                                    });
                                    const lendingTotal = lendingBalance > 0 ? lendingBalance : 0;
                                    const borrowingTotal = lendingBalance < 0 ? Math.abs(lendingBalance) : 0;

                                    return (
                                        <div key={account.id} className="card" style={{ padding: '1rem', background: 'var(--bg-secondary)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                <Link href={`/lending/account/${account.id}`} style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                                    🏦 {account.name}
                                                </Link>
                                                <span className="badge badge-secondary">アーカイブ済</span>
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                                残高: ¥{(account.balance || 0).toLocaleString()}
                                            </div>
                                            {business && (
                                                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                                    事業: {business.name}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                                                <span style={{ color: 'var(--success)' }}>貸出: ¥{lendingTotal.toLocaleString()}</span>
                                                <span style={{ color: 'var(--danger)' }}>借入: ¥{borrowingTotal.toLocaleString()}</span>
                                            </div>
                                            {(account.tags || []).length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.75rem' }}>
                                                    {account.tags?.map(tag => (
                                                        <span key={tag} className="badge badge-primary" style={{ fontSize: '0.75rem' }}>{tag}</span>
                                                    ))}
                                                </div>
                                            )}
                                            <Button size="sm" variant="secondary" onClick={() => unarchiveAccount(account.id)} block>
                                                アーカイブ取消
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* アーカイブ済み外部相手 */}
                    <div className="card" style={{ marginBottom: '1.5rem' }}>
                        <h4 style={{ marginBottom: '1rem' }}>外部相手</h4>
                        {archivedPersons.length === 0 ? (
                            <div style={{ color: 'var(--text-secondary)', padding: '1rem' }}>
                                アーカイブ済みの相手はありません
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                                {archivedPersons.map(person => {
                                    const business = person.businessId ? db.businesses.find(b => b.id === person.businessId) : null;
                                    const relatedLendings = db.lendings.filter(l => l.personId === person.id);
                                    const lendingTotal = relatedLendings
                                        .filter(l => l.type === 'lend' && !l.returned)
                                        .reduce((sum, l) => sum + l.amount, 0);
                                    const borrowingTotal = relatedLendings
                                        .filter(l => l.type === 'borrow' && !l.returned)
                                        .reduce((sum, l) => sum + l.amount, 0);

                                    return (
                                        <div key={person.id} className="card" style={{ padding: '1rem', background: 'var(--bg-secondary)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                                <Link href={`/lending/person/${person.id}`} style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                                                    👤 {person.name}
                                                </Link>
                                                <span className="badge badge-secondary">アーカイブ済</span>
                                            </div>
                                            {business && (
                                                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                                    事業: {business.name}
                                                </div>
                                            )}
                                            {person.memo && (
                                                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                                    {person.memo}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                                                <span style={{ color: 'var(--success)' }}>貸出: ¥{lendingTotal.toLocaleString()}</span>
                                                <span style={{ color: 'var(--danger)' }}>借入: ¥{borrowingTotal.toLocaleString()}</span>
                                            </div>
                                            {(person.tags || []).length > 0 && (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.75rem' }}>
                                                    {person.tags?.map(tag => (
                                                        <span key={tag} className="badge badge-primary" style={{ fontSize: '0.75rem' }}>{tag}</span>
                                                    ))}
                                                </div>
                                            )}
                                            <Button size="sm" variant="secondary" onClick={() => unarchivePerson(person.id)} block>
                                                アーカイブ取消
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* アーカイブ済み取引履歴 */}
                    <div className="card">
                        <h4 style={{ marginBottom: '1rem' }}>取引履歴</h4>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            ※ 取引履歴のアーカイブは復活できません（閲覧のみ）
                        </p>
                        {archivedLendings.length === 0 && archivedTransactions.length === 0 && archivedPersonTransactions.length === 0 ? (
                            <div style={{ color: 'var(--text-secondary)', padding: '1rem' }}>
                                アーカイブ済みの取引はありません
                            </div>
                        ) : (
                            <div className="data-table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>日付</th>
                                            <th>口座</th>
                                            <th>相手/詳細</th>
                                            <th>種類</th>
                                            <th>金額</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* アーカイブ済み貸借履歴 */}
                                        {archivedLendings.map(l => {
                                            const account = db.accounts.find(a => a.id === l.accountId);
                                            let counterpartyName = '-';
                                            if (l.counterpartyType === 'account') {
                                                const acc = db.accounts.find(a => a.id === l.counterpartyId);
                                                counterpartyName = acc ? `💼 ${acc.name}` : '?';
                                            } else {
                                                const person = db.persons.find(p => p.id === (l.counterpartyId || l.personId));
                                                counterpartyName = person?.name || '?';
                                            }
                                            const displayType = l.type === 'return' ? '返済' : (l.amount > 0 ? '貸し' : '借り');

                                            return (
                                                <tr key={`lending-${l.id}`}>
                                                    <td>{l.date}</td>
                                                    <td>{account?.name || '-'}</td>
                                                    <td>{counterpartyName}</td>
                                                    <td><span className="badge badge-secondary">{displayType}</span></td>
                                                    <td style={{ color: l.amount >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                        {l.amount >= 0 ? '' : '-'}¥{Math.abs(l.amount).toLocaleString()}
                                                    </td>
                                                    <td>
                                                        <Link href={`/lending/transaction/lending-${l.id}`}>
                                                            <Button size="sm" variant="ghost">詳細</Button>
                                                        </Link>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {/* アーカイブ済み口座取引履歴 */}
                                        {archivedTransactions.map(t => {
                                            const account = t.type === 'transfer'
                                                ? db.accounts.find(a => a.id === t.fromAccountId)
                                                : db.accounts.find(a => a.id === t.accountId);
                                            let detailText = '-';
                                            if (t.type === 'transfer') {
                                                const toAccount = db.accounts.find(a => a.id === t.toAccountId);
                                                detailText = `→ ${toAccount?.name || '?'}`;
                                            }

                                            return (
                                                <tr key={`transaction-${t.id}`}>
                                                    <td>{t.date}</td>
                                                    <td>{account?.name || '-'}</td>
                                                    <td>{detailText}</td>
                                                    <td><span className="badge badge-secondary">{getTransactionTypeDisplay(t.type, t.amount)}</span></td>
                                                    <td style={{ color: t.amount >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                        {t.amount >= 0 ? '' : '-'}¥{Math.abs(t.amount).toLocaleString()}
                                                    </td>
                                                    <td>
                                                        <Link href={`/lending/transaction/transaction-${t.id}`}>
                                                            <Button size="sm" variant="ghost">詳細</Button>
                                                        </Link>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {/* アーカイブ済み純入出金履歴 */}
                                        {archivedPersonTransactions.map(t => {
                                            const person = db.persons.find(p => p.id === t.personId);
                                            const displayType = t.type === 'deposit' ? '純入金' : '純出金';
                                            const amount = t.type === 'deposit' ? t.amount : -t.amount;

                                            return (
                                                <tr key={`person-transaction-${t.id}`}>
                                                    <td>{t.date}</td>
                                                    <td>-</td>
                                                    <td>{person?.name || '?'}</td>
                                                    <td><span className="badge badge-secondary">{displayType}</span></td>
                                                    <td style={{ color: amount >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                        {amount >= 0 ? '' : '-'}¥{Math.abs(amount).toLocaleString()}
                                                    </td>
                                                    <td>-</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </AppLayout>
    );
}

export default function ArchivePage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <ArchiveContent />;
}

'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

function PersonDetailContent() {
    const params = useParams();
    const router = useRouter();
    const personId = Number(params.id);
    const { db, updateCollection } = useDatabase();

    const [editModalOpen, setEditModalOpen] = useState(false);
    const [tagModalOpen, setTagModalOpen] = useState(false);
    const [newTag, setNewTag] = useState('');

    if (!db) return <div>Loading...</div>;

    const person = db.persons.find(p => p.id === personId);

    if (!person) {
        return (
            <AppLayout title="相手詳細">
                <div className="empty-state">
                    <div className="empty-state-icon">❌</div>
                    <div className="empty-state-text">相手が見つかりません</div>
                    <Link href="/lending">
                        <Button>戻る</Button>
                    </Link>
                </div>
            </AppLayout>
        );
    }

    const business = person.businessId ? db.businesses.find(b => b.id === person.businessId) : null;

    // この相手に関連する貸借履歴
    const relatedLendings = db.lendings.filter(l => l.personId === personId);

    // 貸借合計計算
    const lendingTotal = relatedLendings
        .filter(l => l.type === 'lend' && !l.returned)
        .reduce((sum, l) => sum + l.amount, 0);
    const borrowingTotal = relatedLendings
        .filter(l => l.type === 'borrow' && !l.returned)
        .reduce((sum, l) => sum + l.amount, 0);

    const savePersonInfo = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        updateCollection('persons', items =>
            items.map(p => p.id === personId ? {
                ...p,
                name: formData.get('name') as string,
                memo: formData.get('memo') as string,
                businessId: formData.get('businessId') ? Number(formData.get('businessId')) : undefined,
            } : p)
        );
        setEditModalOpen(false);
    };

    const addTag = () => {
        if (!newTag.trim()) return;
        const currentTags = person.tags || [];
        if (currentTags.includes(newTag.trim())) {
            setNewTag('');
            return;
        }
        updateCollection('persons', items =>
            items.map(p => p.id === personId ? {
                ...p,
                tags: [...currentTags, newTag.trim()]
            } : p)
        );
        setNewTag('');
    };

    const removeTag = (tag: string) => {
        updateCollection('persons', items =>
            items.map(p => p.id === personId ? {
                ...p,
                tags: (p.tags || []).filter(t => t !== tag)
            } : p)
        );
    };

    const toggleArchive = () => {
        const action = person.isArchived ? 'アーカイブを取り消しますか？' : 'この相手をアーカイブしますか？';
        if (confirm(action)) {
            updateCollection('persons', items =>
                items.map(p => p.id === personId ? { ...p, isArchived: !p.isArchived } : p)
            );
            if (!person.isArchived) {
                router.push('/lending');
            }
        }
    };

    const markAsReturned = (lendingId: number) => {
        if (confirm('この貸借を返済済みにしますか？')) {
            updateCollection('lendings', items =>
                items.map(l => l.id === lendingId ? { ...l, returned: true } : l)
            );
        }
    };

    return (
        <AppLayout title={`相手詳細: ${person.name}`}>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/lending">
                        <Button variant="secondary">← 戻る</Button>
                    </Link>
                    <h3>{person.name}</h3>
                    {person.isArchived && <span className="badge badge-secondary">アーカイブ済み</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button variant="secondary" onClick={() => setEditModalOpen(true)}>編集</Button>
                    <Button
                        variant={person.isArchived ? 'primary' : 'danger'}
                        onClick={toggleArchive}
                    >
                        {person.isArchived ? 'アーカイブ取消' : 'アーカイブ'}
                    </Button>
                </div>
            </div>

            {/* 相手情報 */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>貸出中</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--success)' }}>
                            ¥{lendingTotal.toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>借入中</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--danger)' }}>
                            ¥{borrowingTotal.toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>差引</div>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            color: lendingTotal - borrowingTotal >= 0 ? 'var(--success)' : 'var(--danger)'
                        }}>
                            ¥{(lendingTotal - borrowingTotal).toLocaleString()}
                        </div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>事業</div>
                        <div>{business?.name || '未設定'}</div>
                    </div>
                </div>

                {person.memo && (
                    <div style={{ marginTop: '1rem' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>メモ</div>
                        <div>{person.memo}</div>
                    </div>
                )}

                {/* タグ */}
                <div style={{ marginTop: '1rem' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>タグ</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        {(person.tags || []).map(tag => (
                            <span key={tag} className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                {tag}
                                <button
                                    onClick={() => removeTag(tag)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: '0.25rem' }}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                        <Button size="sm" variant="secondary" onClick={() => setTagModalOpen(true)}>+ タグ追加</Button>
                    </div>
                </div>
            </div>

            {/* 貸借履歴 */}
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4>貸借履歴</h4>
                    <Link href={`/lending/new?personId=${personId}`}>
                        <Button size="sm">+ 新規貸借</Button>
                    </Link>
                </div>
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
                                    <th>口座</th>
                                    <th>種類</th>
                                    <th>金額</th>
                                    <th>状態</th>
                                    <th>返済日</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {relatedLendings
                                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                    .map(l => {
                                        const account = db.accounts.find(a => a.id === l.accountId);
                                        return (
                                            <tr key={l.id}>
                                                <td>{l.date}</td>
                                                <td>
                                                    <Link href={`/lending/account/${l.accountId}`} style={{ color: 'var(--primary)' }}>
                                                        {account?.name || '不明'}
                                                    </Link>
                                                </td>
                                                <td>
                                                    <span className={`badge ${l.type === 'lend' ? 'badge-success' : 'badge-danger'}`}>
                                                        {l.type === 'lend' ? '貸出' : '借入'}
                                                    </span>
                                                </td>
                                                <td>¥{l.amount.toLocaleString()}</td>
                                                <td>
                                                    <span className={`badge ${l.returned ? 'badge-secondary' : 'badge-warning'}`}>
                                                        {l.returned ? '返済済' : '未返済'}
                                                    </span>
                                                </td>
                                                <td>-</td>
                                                <td>
                                                    {!l.returned && (
                                                        <Button size="sm" variant="secondary" onClick={() => markAsReturned(l.id)}>
                                                            返済済にする
                                                        </Button>
                                                    )}
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
            <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="相手情報編集">
                <form onSubmit={savePersonInfo}>
                    <div className="form-group">
                        <label>名前</label>
                        <input name="name" defaultValue={person.name} required />
                    </div>
                    <div className="form-group">
                        <label>事業</label>
                        <select name="businessId" defaultValue={person.businessId || ''}>
                            <option value="">未設定</option>
                            {db.businesses.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>メモ</label>
                        <textarea name="memo" defaultValue={person.memo} />
                    </div>
                    <Button type="submit" block>保存</Button>
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
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
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
                                    if (!(person.tags || []).includes(tag.name)) {
                                        updateCollection('persons', items =>
                                            items.map(p => p.id === personId ? {
                                                ...p,
                                                tags: [...(p.tags || []), tag.name]
                                            } : p)
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

export default function PersonDetailPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <PersonDetailContent />;
}

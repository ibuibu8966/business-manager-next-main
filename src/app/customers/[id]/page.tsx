'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Customer, Course, Subscription } from '@/types';

function CustomerDetailContent() {
    const params = useParams();
    const router = useRouter();
    const customerId = Number(params.id);
    const { user } = useAuth();
    const { db, updateCollection } = useDatabase();

    const [editModalOpen, setEditModalOpen] = useState(false);
    const [tagModalOpen, setTagModalOpen] = useState(false);
    const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
    const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
    const [newMemo, setNewMemo] = useState('');
    const [newTagInput, setNewTagInput] = useState('');

    if (!db) return <div>Loading...</div>;

    const customer = db.customers.find(c => c.id === customerId);

    if (!customer) {
        return (
            <AppLayout title="顧客詳細">
                <div className="empty-state">
                    <div className="empty-state-icon">!</div>
                    <div className="empty-state-text">顧客が見つかりません</div>
                    <Link href="/customers">
                        <Button>戻る</Button>
                    </Link>
                </div>
            </AppLayout>
        );
    }

    // 関連データ取得
    const customerHistories = (db.customerHistories || [])
        .filter(h => h.customerId === customerId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const subscriptions = (db.subscriptions || []).filter(s => s.customerId === customerId);
    const relatedTickets = db.tickets.filter(t => t.customerId === customerId);

    const getCourse = (courseId: number) => (db.courses || []).find(c => c.id === courseId);
    const getSalon = (salonId: number) => (db.salons || []).find(s => s.id === salonId);

    const getPaymentServiceLabel = (service: string) => {
        const labels: Record<string, string> = {
            paypal: 'Paypal',
            univapay: 'Univapay',
            memberpay: 'メンバーペイ'
        };
        return labels[service] || service;
    };

    const getActionLabel = (action: string) => {
        const labels: Record<string, string> = {
            created: '作成',
            updated: '更新',
            memo: 'メモ',
            tag_added: 'タグ追加',
            tag_removed: 'タグ削除'
        };
        return labels[action] || action;
    };

    const getActionBadgeClass = (action: string) => {
        if (action === 'memo') return 'badge-primary';
        if (action === 'created') return 'badge-success';
        return 'badge-secondary';
    };

    // メモ追加
    const addMemo = () => {
        if (!newMemo.trim()) return;
        updateCollection('customerHistories', items => [...items, {
            id: genId(items),
            customerId,
            action: 'memo' as const,
            description: newMemo.trim(),
            userId: user?.id || 1,
            createdAt: new Date().toISOString()
        }]);
        setNewMemo('');
    };

    // タグ追加
    const addTag = (tagName: string) => {
        const currentTags = customer.tags || [];
        if (currentTags.includes(tagName)) return;

        // 新規タグをtagsコレクションに追加
        if (!db.tags.some(t => t.name === tagName)) {
            updateCollection('tags', items => [...items, {
                id: genId(items),
                name: tagName,
                color: '#6366f1'
            }]);
        }

        updateCollection('customers', items =>
            items.map(c => c.id === customerId ? {
                ...c,
                tags: [...currentTags, tagName],
                updatedAt: new Date().toISOString()
            } : c)
        );

        // 履歴追加
        updateCollection('customerHistories', items => [...items, {
            id: genId(items),
            customerId,
            action: 'tag_added' as const,
            description: `タグ「${tagName}」を追加`,
            userId: user?.id || 1,
            createdAt: new Date().toISOString()
        }]);
    };

    // タグ削除
    const removeTag = (tagName: string) => {
        updateCollection('customers', items =>
            items.map(c => c.id === customerId ? {
                ...c,
                tags: (c.tags || []).filter(t => t !== tagName),
                updatedAt: new Date().toISOString()
            } : c)
        );

        updateCollection('customerHistories', items => [...items, {
            id: genId(items),
            customerId,
            action: 'tag_removed' as const,
            description: `タグ「${tagName}」を削除`,
            userId: user?.id || 1,
            createdAt: new Date().toISOString()
        }]);
    };

    // 基本情報保存
    const saveCustomerInfo = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const updates = {
            name: formData.get('name') as string,
            phone: formData.get('phone') as string || undefined,
            email: formData.get('email') as string || undefined,
            address: formData.get('address') as string || undefined,
            discordName: formData.get('discordName') as string || undefined,
            lineName: formData.get('lineName') as string || undefined,
            paypalId: formData.get('paypalId') as string || undefined,
            univapayId: formData.get('univapayId') as string || undefined,
            memberpayId: formData.get('memberpayId') as string || undefined,
            note: formData.get('note') as string || undefined,
            updatedAt: new Date().toISOString()
        };

        updateCollection('customers', items =>
            items.map(c => c.id === customerId ? { ...c, ...updates } : c)
        );

        updateCollection('customerHistories', items => [...items, {
            id: genId(items),
            customerId,
            action: 'updated' as const,
            description: '基本情報を更新',
            userId: user?.id || 1,
            createdAt: new Date().toISOString()
        }]);

        setEditModalOpen(false);
    };

    // 加入コース追加
    const saveSubscription = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        if (editingSubscription) {
            updateCollection('subscriptions', items =>
                items.map(s => s.id === editingSubscription.id ? {
                    ...s,
                    courseId: parseInt(formData.get('courseId') as string),
                    paymentService: formData.get('paymentService') as 'paypal' | 'univapay' | 'memberpay',
                    isExempt: formData.get('isExempt') === 'on',
                } : s)
            );
        } else {
            updateCollection('subscriptions', items => [...items, {
                id: genId(items),
                customerId,
                courseId: parseInt(formData.get('courseId') as string),
                paymentService: formData.get('paymentService') as 'paypal' | 'univapay' | 'memberpay',
                isExempt: formData.get('isExempt') === 'on',
                isActive: true,
                createdAt: new Date().toISOString()
            }]);
        }
        setSubscriptionModalOpen(false);
        setEditingSubscription(null);
    };

    // 退会処理
    const withdrawSubscription = (subscriptionId: number) => {
        if (!confirm('この加入コースを退会処理しますか？')) return;
        updateCollection('subscriptions', items =>
            items.map(s => s.id === subscriptionId ? {
                ...s,
                isActive: false,
                withdrawnAt: new Date().toISOString()
            } : s)
        );
    };

    // 加入復活
    const reactivateSubscription = (subscriptionId: number) => {
        updateCollection('subscriptions', items =>
            items.map(s => s.id === subscriptionId ? {
                ...s,
                isActive: true,
                withdrawnAt: undefined
            } : s)
        );
    };

    // 加入削除
    const deleteSubscription = (subscriptionId: number) => {
        if (!confirm('この加入情報を完全に削除しますか？')) return;
        updateCollection('subscriptions', items => items.filter(s => s.id !== subscriptionId));
        updateCollection('monthlyChecks', items => items.filter(m => m.subscriptionId !== subscriptionId));
    };

    return (
        <AppLayout title={`顧客詳細: ${customer.name}`}>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/customers">
                        <Button variant="secondary">← 戻る</Button>
                    </Link>
                    <h3>{customer.name}</h3>
                </div>
                <Button variant="secondary" onClick={() => setEditModalOpen(true)}>編集</Button>
            </div>

            {/* 基本情報カード */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <h4 style={{ marginBottom: '1rem' }}>基本情報</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>電話番号</div>
                        <div>{customer.phone || '-'}</div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>メールアドレス</div>
                        <div>{customer.email || '-'}</div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>住所</div>
                        <div>{customer.address || '-'}</div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Discord</div>
                        <div>{customer.discordName || '-'}</div>
                    </div>
                    <div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>LINE</div>
                        <div>{customer.lineName || '-'}</div>
                    </div>
                </div>

                {/* 決済ID */}
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>決済ID</div>
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                        <div><strong>Paypal:</strong> {customer.paypalId || '-'}</div>
                        <div><strong>Univapay:</strong> {customer.univapayId || '-'}</div>
                        <div><strong>メンバーペイ:</strong> {customer.memberpayId || '-'}</div>
                    </div>
                </div>

                {/* 備考 */}
                {customer.note && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>備考</div>
                        <div>{customer.note}</div>
                    </div>
                )}

                {/* タグ */}
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>タグ</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                        {(customer.tags || []).map(tag => (
                            <span key={tag} className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                {tag}
                                <button
                                    type="button"
                                    onClick={() => removeTag(tag)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                                >
                                    x
                                </button>
                            </span>
                        ))}
                        <Button size="sm" variant="secondary" onClick={() => setTagModalOpen(true)}>+ タグ追加</Button>
                    </div>
                </div>
            </div>

            {/* 加入コースセクション */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ margin: 0 }}>加入コース</h4>
                    <Button size="sm" onClick={() => { setEditingSubscription(null); setSubscriptionModalOpen(true); }}>+ コース追加</Button>
                </div>
                {subscriptions.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {subscriptions.map(sub => {
                            const course = getCourse(sub.courseId);
                            const salon = course ? getSalon(course.salonId) : null;
                            return (
                                <div
                                    key={sub.id}
                                    style={{
                                        padding: '1rem',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '8px',
                                        backgroundColor: sub.isActive ? 'transparent' : 'rgba(0,0,0,0.05)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>
                                                {salon?.name} / {course?.name || '不明なコース'}
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                決済: {getPaymentServiceLabel(sub.paymentService)}
                                                {sub.isExempt && <span className="badge" style={{ backgroundColor: '#eab308', marginLeft: '0.5rem' }}>免除</span>}
                                            </div>
                                            <div style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                                                ステータス: {sub.isActive ? (
                                                    <span style={{ color: 'var(--success)' }}>アクティブ</span>
                                                ) : (
                                                    <span style={{ color: 'var(--danger)' }}>退会済み ({sub.withdrawnAt?.split('T')[0]})</span>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <Button size="sm" variant="secondary" onClick={() => { setEditingSubscription(sub); setSubscriptionModalOpen(true); }}>編集</Button>
                                            {sub.isActive ? (
                                                <Button size="sm" variant="danger" onClick={() => withdrawSubscription(sub.id)}>退会</Button>
                                            ) : (
                                                <>
                                                    <Button size="sm" variant="secondary" onClick={() => reactivateSubscription(sub.id)}>復活</Button>
                                                    <Button size="sm" variant="danger" onClick={() => deleteSubscription(sub.id)}>削除</Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                        加入コースがありません
                    </div>
                )}
            </div>

            {/* メモ履歴セクション */}
            <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <h4 style={{ marginBottom: '1rem' }}>対応履歴・メモ</h4>

                {/* メモ入力フォーム */}
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                        <textarea
                            value={newMemo}
                            onChange={e => setNewMemo(e.target.value)}
                            placeholder="メモを入力..."
                            rows={3}
                            style={{ flex: 1, padding: '0.5rem', border: '1px solid var(--border-color)', borderRadius: '4px', resize: 'vertical' }}
                        />
                        <Button onClick={addMemo}>追加</Button>
                    </div>
                </div>

                {/* 履歴一覧 */}
                <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                    {customerHistories.length > 0 ? (
                        customerHistories.map(history => {
                            const historyUser = db.users.find(u => u.id === history.userId);
                            return (
                                <div key={history.id} style={{
                                    padding: '0.75rem 1rem',
                                    borderBottom: '1px solid var(--border-color)',
                                    fontSize: '0.875rem'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                        <span>
                                            <strong>{historyUser?.name || '不明'}</strong>
                                            <span className={`badge ${getActionBadgeClass(history.action)}`} style={{ marginLeft: '0.5rem', fontSize: '10px' }}>
                                                {getActionLabel(history.action)}
                                            </span>
                                        </span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                            {new Date(history.createdAt).toLocaleString('ja-JP')}
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                                        {history.description}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                            履歴がありません
                        </div>
                    )}
                </div>
            </div>

            {/* 関連チケット */}
            <div className="card" style={{ padding: '1.5rem' }}>
                <h4 style={{ marginBottom: '1rem' }}>関連チケット ({relatedTickets.length}件)</h4>
                {relatedTickets.length > 0 ? (
                    <div className="data-table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>タイトル</th>
                                    <th>ステータス</th>
                                    <th>作成日</th>
                                </tr>
                            </thead>
                            <tbody>
                                {relatedTickets.map(ticket => (
                                    <tr key={ticket.id}>
                                        <td>
                                            <Link href={`/tickets?id=${ticket.id}`} style={{ color: 'var(--primary)' }}>
                                                {ticket.title}
                                            </Link>
                                        </td>
                                        <td>
                                            <span className={`badge ${
                                                ticket.status === '完了' ? 'badge-done' :
                                                ticket.status === '対応中' ? 'badge-active' :
                                                ticket.status === '保留' ? 'badge-pending' : ''
                                            }`}>
                                                {ticket.status}
                                            </span>
                                        </td>
                                        <td>{ticket.createdAt?.split('T')[0]}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="empty-state" style={{ padding: '2rem' }}>
                        <div className="empty-state-text">関連チケットがありません</div>
                    </div>
                )}
            </div>

            {/* 編集モーダル */}
            <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="顧客情報編集">
                <form onSubmit={saveCustomerInfo}>
                    <div className="form-group">
                        <label>顧客名 *</label>
                        <input name="name" defaultValue={customer.name} required />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>電話番号</label>
                            <input name="phone" type="tel" defaultValue={customer.phone} />
                        </div>
                        <div className="form-group">
                            <label>メールアドレス</label>
                            <input name="email" type="email" defaultValue={customer.email} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>住所</label>
                        <input name="address" defaultValue={customer.address} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>Discord名</label>
                            <input name="discordName" defaultValue={customer.discordName} />
                        </div>
                        <div className="form-group">
                            <label>LINE名</label>
                            <input name="lineName" defaultValue={customer.lineName} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>Paypal ID</label>
                            <input name="paypalId" defaultValue={customer.paypalId} />
                        </div>
                        <div className="form-group">
                            <label>Univapay ID</label>
                            <input name="univapayId" defaultValue={customer.univapayId} />
                        </div>
                        <div className="form-group">
                            <label>メンバーペイ ID</label>
                            <input name="memberpayId" defaultValue={customer.memberpayId} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>備考</label>
                        <textarea name="note" defaultValue={customer.note} rows={2} />
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* タグ追加モーダル */}
            <Modal isOpen={tagModalOpen} onClose={() => { setTagModalOpen(false); setNewTagInput(''); }} title="タグ追加">
                <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                            type="text"
                            value={newTagInput}
                            onChange={e => setNewTagInput(e.target.value)}
                            placeholder="新しいタグ名"
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (newTagInput.trim()) {
                                        addTag(newTagInput.trim());
                                        setNewTagInput('');
                                    }
                                }
                            }}
                            style={{ flex: 1 }}
                        />
                        <Button onClick={() => {
                            if (newTagInput.trim()) {
                                addTag(newTagInput.trim());
                                setNewTagInput('');
                            }
                        }}>追加</Button>
                    </div>
                </div>
                {db.tags.length > 0 && (
                    <div>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>既存タグから選択:</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {db.tags
                                .filter(t => !(customer.tags || []).includes(t.name))
                                .map(tag => (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        className="badge"
                                        style={{ backgroundColor: tag.color || '#6366f1', cursor: 'pointer', border: 'none' }}
                                        onClick={() => addTag(tag.name)}
                                    >
                                        + {tag.name}
                                    </button>
                                ))}
                        </div>
                    </div>
                )}
            </Modal>

            {/* 加入コース追加/編集モーダル */}
            <Modal isOpen={subscriptionModalOpen} onClose={() => { setSubscriptionModalOpen(false); setEditingSubscription(null); }} title={editingSubscription ? '加入コース編集' : '加入コース追加'}>
                <form onSubmit={saveSubscription}>
                    <div className="form-group">
                        <label>コース *</label>
                        <select name="courseId" defaultValue={editingSubscription?.courseId} required>
                            <option value="">選択してください</option>
                            {(db.salons || []).map(salon => (
                                <optgroup key={salon.id} label={salon.name}>
                                    {(db.courses || []).filter(c => c.salonId === salon.id).map(course => (
                                        <option key={course.id} value={course.id}>{course.name}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>決済サービス *</label>
                        <select name="paymentService" defaultValue={editingSubscription?.paymentService || 'paypal'} required>
                            <option value="paypal">Paypal</option>
                            <option value="univapay">Univapay</option>
                            <option value="memberpay">メンバーペイ</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="checkbox" name="isExempt" defaultChecked={editingSubscription?.isExempt} />
                            決済免除
                        </label>
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

export default function CustomerDetailPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <CustomerDetailContent />;
}

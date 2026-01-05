'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Ticket, TicketHistory } from '@/types';

function TicketsContent() {
    const { db, updateCollection } = useDatabase();
    const { user } = useAuth();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterSource, setFilterSource] = useState('');
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    const [sourceModalOpen, setSourceModalOpen] = useState(false);
    const [newSourceName, setNewSourceName] = useState('');
    const [newComment, setNewComment] = useState('');

    if (!db) return <div>Loading...</div>;

    let tickets = [...db.tickets];
    if (filterStatus) {
        tickets = tickets.filter(t => t.status === filterStatus);
    } else {
        // 「全ステータス」の場合は完了を除外
        tickets = tickets.filter(t => t.status !== '完了');
    }
    if (filterSource) tickets = tickets.filter(t => t.source === filterSource);

    const openModal = (ticket?: Ticket) => {
        setEditingTicket(ticket || null);
        setModalOpen(true);
    };

    const openDetailModal = (ticket: Ticket) => {
        setSelectedTicket(ticket);
        setDetailModalOpen(true);
        setNewComment('');
    };

    // 履歴追加
    const addHistory = (ticketId: number, action: TicketHistory['action'], description: string) => {
        updateCollection('ticketHistories', histories => [
            ...histories,
            {
                id: genId(histories),
                ticketId,
                action,
                description,
                userId: user?.id || 1,
                createdAt: new Date().toISOString()
            }
        ]);
    };

    const saveTicket = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const ticketData = {
            title: formData.get('title') as string,
            description: formData.get('description') as string,
            status: formData.get('status') as Ticket['status'],
            source: formData.get('source') as string,
            customerId: formData.get('customerId') ? parseInt(formData.get('customerId') as string) : undefined,
            assignedUserId: formData.get('assignedUserId') ? parseInt(formData.get('assignedUserId') as string) : user?.id,
        };

        if (editingTicket) {
            // 変更内容を検出
            const changes: string[] = [];
            if (editingTicket.title !== ticketData.title) {
                changes.push(`タイトル: ${editingTicket.title} → ${ticketData.title}`);
            }
            if (editingTicket.description !== ticketData.description) {
                changes.push(`説明を変更`);
            }
            if (editingTicket.status !== ticketData.status) {
                changes.push(`ステータス: ${editingTicket.status} → ${ticketData.status}`);
            }
            if (editingTicket.source !== ticketData.source) {
                const oldSource = getSourceName(editingTicket.source);
                const newSource = getSourceName(ticketData.source);
                changes.push(`経路: ${oldSource} → ${newSource}`);
            }
            if (editingTicket.customerId !== ticketData.customerId) {
                const oldCustomer = db.customers.find(c => c.id === editingTicket.customerId)?.name || 'なし';
                const newCustomer = db.customers.find(c => c.id === ticketData.customerId)?.name || 'なし';
                changes.push(`顧客: ${oldCustomer} → ${newCustomer}`);
            }
            if (editingTicket.assignedUserId !== ticketData.assignedUserId) {
                const oldUser = db.users.find(u => u.id === editingTicket.assignedUserId)?.name || 'なし';
                const newUser = db.users.find(u => u.id === ticketData.assignedUserId)?.name || 'なし';
                changes.push(`担当者: ${oldUser} → ${newUser}`);
            }

            updateCollection('tickets', items =>
                items.map(t => t.id === editingTicket.id ? { ...t, ...ticketData } : t)
            );

            if (changes.length > 0) {
                addHistory(editingTicket.id, 'updated', changes.join('、'));
            }
        } else {
            const newId = genId(db.tickets);
            updateCollection('tickets', items => [
                ...items,
                { id: newId, ...ticketData, createdAt: new Date().toISOString() }
            ]);
            addHistory(newId, 'created', 'チケットを作成');
        }
        setModalOpen(false);
    };

    const deleteTicket = (id: number) => {
        if (confirm('このチケットを削除しますか？')) {
            updateCollection('tickets', items => items.filter(t => t.id !== id));
            updateCollection('ticketHistories', items => items.filter(h => h.ticketId !== id));
        }
    };

    // ステータス変更
    const changeStatus = (ticket: Ticket, newStatus: Ticket['status']) => {
        updateCollection('tickets', items =>
            items.map(t => t.id === ticket.id ? { ...t, status: newStatus, assignedUserId: user?.id } : t)
        );
        addHistory(ticket.id, 'status', `ステータスを「${newStatus}」に変更`);
    };

    // メモ追加（テーブルから直接）
    const addMemoToTicket = (ticketId: number, memo: string) => {
        addHistory(ticketId, 'memo', memo);
        // 担当者を更新
        updateCollection('tickets', items =>
            items.map(t => t.id === ticketId ? { ...t, assignedUserId: user?.id } : t)
        );
    };

    // コメント追加（詳細モーダルから）
    const addComment = () => {
        if (!selectedTicket || !newComment.trim()) return;
        addHistory(selectedTicket.id, 'comment', newComment.trim());
        // 担当者を更新
        updateCollection('tickets', items =>
            items.map(t => t.id === selectedTicket.id ? { ...t, assignedUserId: user?.id } : t)
        );
        setNewComment('');
    };

    // 経路追加
    const addSource = () => {
        if (!newSourceName.trim()) return;
        const key = newSourceName.trim().toLowerCase().replace(/\s+/g, '_');
        updateCollection('ticketSources', sources => [
            ...sources,
            { id: genId(sources), name: newSourceName.trim(), key }
        ]);
        setNewSourceName('');
        setSourceModalOpen(false);
    };

    // 経路削除
    const deleteSource = (id: number) => {
        if (confirm('この経路を削除しますか？')) {
            updateCollection('ticketSources', sources => sources.filter(s => s.id !== id));
        }
    };

    // 経路名取得
    const getSourceName = (sourceKey: string) => {
        const source = db.ticketSources.find(s => s.key === sourceKey);
        return source?.name || sourceKey;
    };

    // チケットの履歴取得
    const getTicketHistories = (ticketId: number) => {
        return db.ticketHistories
            .filter(h => h.ticketId === ticketId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    };

    // 最終対応者取得
    const getLastHandler = (ticketId: number) => {
        const histories = getTicketHistories(ticketId);
        if (histories.length === 0) return null;
        const lastHistory = histories[0];
        return db.users.find(u => u.id === lastHistory.userId);
    };

    return (
        <AppLayout title="チケット管理">
            <div className="page-header">
                <h3>チケット管理</h3>
                <div className="btn-group">
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="">全ステータス</option>
                        <option value="新規">新規</option>
                        <option value="対応中">対応中</option>
                        <option value="保留">保留</option>
                        <option value="完了">完了</option>
                    </select>
                    <select value={filterSource} onChange={e => setFilterSource(e.target.value)}>
                        <option value="">全経路</option>
                        {db.ticketSources.map(s => (
                            <option key={s.id} value={s.key}>{s.name}</option>
                        ))}
                    </select>
                    <Button variant="ghost" onClick={() => setSourceModalOpen(true)}>経路管理</Button>
                    <Button onClick={() => openModal()}>+ 新規チケット</Button>
                </div>
            </div>

            <div className="data-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>タイトル</th>
                            <th>ステータス</th>
                            <th>経路</th>
                            <th>顧客</th>
                            <th>最終担当</th>
                            <th>作成日</th>
                            <th style={{ minWidth: '180px' }}>メモ入力</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tickets.map(ticket => {
                            const customer = db.customers.find(c => c.id === ticket.customerId);
                            const lastHandler = getLastHandler(ticket.id) || db.users.find(u => u.id === ticket.assignedUserId);
                            const historyCount = db.ticketHistories.filter(h => h.ticketId === ticket.id).length;
                            return (
                                <tr key={ticket.id}>
                                    <td>
                                        <span
                                            style={{ cursor: 'pointer', color: 'var(--primary)' }}
                                            onClick={() => openDetailModal(ticket)}
                                        >
                                            {ticket.title}
                                        </span>
                                        {historyCount > 0 && (
                                            <span className="badge" style={{ marginLeft: '8px', fontSize: '10px' }}>
                                                {historyCount}件
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <span className={`badge badge-${ticket.status === '完了' ? 'done' : ticket.status === '対応中' ? 'active' : 'pending'}`}>
                                            {ticket.status}
                                        </span>
                                    </td>
                                    <td>{getSourceName(ticket.source)}</td>
                                    <td>{customer?.name || '-'}</td>
                                    <td>{lastHandler?.name || '-'}</td>
                                    <td>{ticket.createdAt?.split('T')[0]}</td>
                                    <td>
                                        <input
                                            type="text"
                                            placeholder="メモを追加... (Enter)"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                    addMemoToTicket(ticket.id, e.currentTarget.value.trim());
                                                    e.currentTarget.value = '';
                                                }
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '4px 8px',
                                                fontSize: '12px',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '4px',
                                                background: 'var(--bg-tertiary)',
                                                color: 'var(--text-primary)'
                                            }}
                                        />
                                    </td>
                                    <td className="actions-cell">
                                        <Button size="sm" variant="ghost" onClick={() => openDetailModal(ticket)}>詳細</Button>
                                        <Button size="sm" variant="secondary" onClick={() => openModal(ticket)}>編集</Button>
                                        <Button size="sm" variant="danger" onClick={() => deleteTicket(ticket.id)}>削除</Button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {tickets.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-state-icon">🎫</div>
                        <div className="empty-state-text">チケットがありません</div>
                    </div>
                )}
            </div>

            {/* 新規/編集モーダル */}
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingTicket ? 'チケット編集' : '新規チケット'}>
                <form onSubmit={saveTicket}>
                    <div className="form-group">
                        <label>タイトル</label>
                        <input name="title" defaultValue={editingTicket?.title} required />
                    </div>
                    <div className="form-group">
                        <label>説明</label>
                        <textarea name="description" defaultValue={editingTicket?.description} />
                    </div>
                    <div className="form-group">
                        <label>経路</label>
                        <select name="source" defaultValue={editingTicket?.source || 'phone'}>
                            {db.ticketSources.map(s => (
                                <option key={s.id} value={s.key}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>ステータス</label>
                        <select name="status" defaultValue={editingTicket?.status || '新規'}>
                            <option value="新規">新規</option>
                            <option value="対応中">対応中</option>
                            <option value="保留">保留</option>
                            <option value="完了">完了</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>顧客</label>
                        <select name="customerId" defaultValue={editingTicket?.customerId}>
                            <option value="">選択なし</option>
                            {db.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>担当者</label>
                        <select name="assignedUserId" defaultValue={editingTicket?.assignedUserId || user?.id}>
                            {db.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* 詳細モーダル */}
            <Modal
                isOpen={detailModalOpen}
                onClose={() => setDetailModalOpen(false)}
                title="チケット詳細"
            >
                {selectedTicket && (
                    <div>
                        <div style={{ marginBottom: '16px' }}>
                            <h4 style={{ marginBottom: '8px' }}>{selectedTicket.title}</h4>
                            {selectedTicket.description && (
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                    {selectedTicket.description}
                                </p>
                            )}
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '14px' }}>
                                <span>
                                    <strong>ステータス:</strong>{' '}
                                    <span className={`badge badge-${selectedTicket.status === '完了' ? 'done' : selectedTicket.status === '対応中' ? 'active' : 'pending'}`}>
                                        {selectedTicket.status}
                                    </span>
                                </span>
                                <span><strong>経路:</strong> {getSourceName(selectedTicket.source)}</span>
                                <span><strong>顧客:</strong> {db.customers.find(c => c.id === selectedTicket.customerId)?.name || '-'}</span>
                                <span><strong>作成日:</strong> {selectedTicket.createdAt?.split('T')[0]}</span>
                            </div>
                        </div>

                        {/* ステータス変更ボタン */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                            {selectedTicket.status !== '対応中' && (
                                <Button size="sm" variant="primary" onClick={() => { changeStatus(selectedTicket, '対応中'); setSelectedTicket({ ...selectedTicket, status: '対応中' }); }}>
                                    対応中にする
                                </Button>
                            )}
                            {selectedTicket.status !== '保留' && (
                                <Button size="sm" variant="secondary" onClick={() => { changeStatus(selectedTicket, '保留'); setSelectedTicket({ ...selectedTicket, status: '保留' }); }}>
                                    保留にする
                                </Button>
                            )}
                            {selectedTicket.status !== '完了' && (
                                <Button size="sm" variant="success" onClick={() => { changeStatus(selectedTicket, '完了'); setSelectedTicket({ ...selectedTicket, status: '完了' }); }}>
                                    完了にする
                                </Button>
                            )}
                        </div>

                        {/* コメント入力 */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>対応コメント</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                                <textarea
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value)}
                                    placeholder="コメントを入力..."
                                    rows={3}
                                    style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px', resize: 'vertical' }}
                                />
                                <Button onClick={addComment}>送信</Button>
                            </div>
                        </div>

                        {/* 履歴一覧 */}
                        <div>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>対応履歴</label>
                            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px' }}>
                                {getTicketHistories(selectedTicket.id).length > 0 ? (
                                    getTicketHistories(selectedTicket.id).map(history => {
                                        const historyUser = db.users.find(u => u.id === history.userId);
                                        const actionLabel = {
                                            created: '作成',
                                            status: 'ステータス',
                                            comment: 'コメント',
                                            memo: 'メモ',
                                            updated: '更新'
                                        }[history.action];
                                        return (
                                            <div key={history.id} style={{
                                                padding: '8px',
                                                borderBottom: '1px solid var(--border-color)',
                                                fontSize: '13px'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span>
                                                        <strong>{historyUser?.name || '不明'}</strong>
                                                        <span className="badge" style={{ marginLeft: '8px', fontSize: '10px' }}>{actionLabel}</span>
                                                    </span>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                                        {new Date(history.createdAt).toLocaleString('ja-JP')}
                                                    </span>
                                                </div>
                                                <div style={{ color: 'var(--text-secondary)' }}>{history.description}</div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>
                                        履歴がありません
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* 経路管理モーダル */}
            <Modal isOpen={sourceModalOpen} onClose={() => setSourceModalOpen(false)} title="経路管理">
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>新規経路追加</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            value={newSourceName}
                            onChange={e => setNewSourceName(e.target.value)}
                            placeholder="経路名（例: LINE, FAX）"
                            style={{ flex: 1, padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                        />
                        <Button onClick={addSource}>追加</Button>
                    </div>
                </div>

                <div>
                    <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>登録済み経路</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {db.ticketSources.map(source => (
                            <span key={source.id} className="badge" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {source.name}
                                <button
                                    onClick={() => deleteSource(source.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            </Modal>
        </AppLayout>
    );
}

export default function TicketsPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <TicketsContent />;
}

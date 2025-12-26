'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Ticket } from '@/types';

function TicketsContent() {
    const { db, updateCollection } = useDatabase();
    const { user } = useAuth();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterSource, setFilterSource] = useState('');

    if (!db) return <div>Loading...</div>;

    let tickets = [...db.tickets];
    if (filterStatus) tickets = tickets.filter(t => t.status === filterStatus);
    if (filterSource) tickets = tickets.filter(t => t.source === filterSource);

    const openModal = (ticket?: Ticket) => {
        setEditingTicket(ticket || null);
        setModalOpen(true);
    };

    const saveTicket = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const ticketData = {
            title: formData.get('title') as string,
            description: formData.get('description') as string,
            status: formData.get('status') as Ticket['status'],
            source: formData.get('source') as Ticket['source'],
            customerId: formData.get('customerId') ? parseInt(formData.get('customerId') as string) : undefined,
            assignedUserId: formData.get('assignedUserId') ? parseInt(formData.get('assignedUserId') as string) : user?.id,
        };

        if (editingTicket) {
            updateCollection('tickets', items =>
                items.map(t => t.id === editingTicket.id ? { ...t, ...ticketData } : t)
            );
        } else {
            updateCollection('tickets', items => [
                ...items,
                { id: genId(items), ...ticketData, createdAt: new Date().toISOString() }
            ]);
        }
        setModalOpen(false);
    };

    const deleteTicket = (id: number) => {
        if (confirm('このチケットを削除しますか？')) {
            updateCollection('tickets', items => items.filter(t => t.id !== id));
        }
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
                        <option value="phone">電話</option>
                        <option value="email">メール</option>
                        <option value="web">Web</option>
                        <option value="other">その他</option>
                    </select>
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
                            <th>担当</th>
                            <th>作成日</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tickets.map(ticket => {
                            const customer = db.customers.find(c => c.id === ticket.customerId);
                            const assignee = db.users.find(u => u.id === ticket.assignedUserId);
                            return (
                                <tr key={ticket.id}>
                                    <td>{ticket.title}</td>
                                    <td>
                                        <span className={`badge badge-${ticket.status === '完了' ? 'done' : ticket.status === '対応中' ? 'active' : 'pending'}`}>
                                            {ticket.status}
                                        </span>
                                    </td>
                                    <td>{ticket.source}</td>
                                    <td>{customer?.name || '-'}</td>
                                    <td>{assignee?.name || '-'}</td>
                                    <td>{ticket.createdAt?.split('T')[0]}</td>
                                    <td className="actions-cell">
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
                            <option value="phone">電話</option>
                            <option value="email">メール</option>
                            <option value="web">Web</option>
                            <option value="other">その他</option>
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
        </AppLayout>
    );
}

export default function TicketsPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <TicketsContent />;
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Business } from '@/types';

function BusinessesContent() {
    const { db, updateCollection } = useDatabase();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
    const [search, setSearch] = useState('');

    if (!db) return <div>Loading...</div>;

    let businesses = [...db.businesses];
    if (search) businesses = businesses.filter(b => b.name.toLowerCase().includes(search.toLowerCase()));

    const openModal = (business?: Business) => {
        setEditingBusiness(business || null);
        setModalOpen(true);
    };

    const saveBusiness = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const businessData = {
            name: formData.get('name') as string,
            description: formData.get('description') as string,
        };

        if (editingBusiness) {
            updateCollection('businesses', items =>
                items.map(b => b.id === editingBusiness.id ? { ...b, ...businessData } : b)
            );
        } else {
            updateCollection('businesses', items => [
                ...items,
                { id: genId(items), ...businessData }
            ]);
        }
        setModalOpen(false);
    };

    const deleteBusiness = (id: number) => {
        if (confirm('この事業を削除しますか？')) {
            updateCollection('businesses', items => items.filter(b => b.id !== id));
        }
    };

    return (
        <AppLayout title="事業管理">
            <div className="page-header">
                <h3>事業管理</h3>
                <Button onClick={() => openModal()}>+ 新規事業</Button>
            </div>

            <div className="search-box">
                <input
                    placeholder="事業を検索..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <div className="accounts-grid">
                {businesses.map(business => {
                    const contracts = db.contracts.filter(c => c.businessId === business.id).length;
                    const manuals = db.manuals.filter(m => m.businessId === business.id && !m.isArchived).length;
                    const checklists = db.checklists?.filter(c => c.businessId === business.id && !c.isArchived).length || 0;
                    const tasks = db.tasks.filter(t => t.businessId === business.id).length;
                    const income = db.transactions.filter(t => t.businessId === business.id && t.type === 'income').reduce((s, t) => s + t.amount, 0);
                    const expense = db.transactions.filter(t => t.businessId === business.id && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
                    const profit = income - expense;

                    return (
                        <Link key={business.id} href={`/businesses/${business.id}`} style={{ textDecoration: 'none' }}>
                            <div className="account-card">
                                <h4>{business.name}</h4>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
                                    {business.description}
                                </p>
                                <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                                    <span>📄 契約: {contracts}</span>
                                    <span>📚 マニュアル: {manuals}</span>
                                    <span>✅ チェックリスト: {checklists}</span>
                                    <span>📋 タスク: {tasks}</span>
                                </div>
                                <div style={{ marginTop: '12px', fontSize: '16px', fontWeight: 600 }} className={profit >= 0 ? 'amount-positive' : 'amount-negative'}>
                                    利益: ¥{profit.toLocaleString()}
                                </div>
                                <div style={{ marginTop: '8px' }}>
                                    <Button size="sm" variant="danger" onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteBusiness(business.id); }}>
                                        削除
                                    </Button>
                                </div>
                            </div>
                        </Link>
                    );
                })}
                {businesses.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-state-icon">🏢</div>
                        <div className="empty-state-text">事業を追加してください</div>
                    </div>
                )}
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingBusiness ? '事業編集' : '新規事業'}>
                <form onSubmit={saveBusiness}>
                    <div className="form-group">
                        <label>事業名</label>
                        <input name="name" defaultValue={editingBusiness?.name} required />
                    </div>
                    <div className="form-group">
                        <label>説明</label>
                        <textarea name="description" defaultValue={editingBusiness?.description} />
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

export default function BusinessesPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <BusinessesContent />;
}

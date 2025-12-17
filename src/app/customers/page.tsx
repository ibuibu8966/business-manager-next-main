'use client';

import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Customer } from '@/types';

function CustomersContent() {
    const { db, updateCollection } = useDatabase();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [search, setSearch] = useState('');

    if (!db) return <div>Loading...</div>;

    let customers = [...db.customers];
    if (search) customers = customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search)
    );

    const openModal = (customer?: Customer) => {
        setEditingCustomer(customer || null);
        setModalOpen(true);
    };

    const saveCustomer = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const customerData = {
            name: formData.get('name') as string,
            email: formData.get('email') as string,
            phone: formData.get('phone') as string,
            address: formData.get('address') as string,
            memo: formData.get('memo') as string,
        };

        if (editingCustomer) {
            updateCollection('customers', items =>
                items.map(c => c.id === editingCustomer.id ? { ...c, ...customerData } : c)
            );
        } else {
            updateCollection('customers', items => [
                ...items,
                { id: genId(items), ...customerData }
            ]);
        }
        setModalOpen(false);
    };

    const deleteCustomer = (id: number) => {
        if (confirm('この顧客を削除しますか？')) {
            updateCollection('customers', items => items.filter(c => c.id !== id));
        }
    };

    return (
        <AppLayout title="顧客・対応履歴">
            <div className="page-header">
                <h3>顧客・対応履歴</h3>
                <Button onClick={() => openModal()}>+ 新規顧客</Button>
            </div>

            <div className="search-box">
                <input
                    placeholder="顧客を検索（名前、メール、電話）..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            <div className="data-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>顧客名</th>
                            <th>電話</th>
                            <th>メール</th>
                            <th>住所</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers.map(customer => (
                            <tr key={customer.id}>
                                <td>{customer.name}</td>
                                <td>{customer.phone || '-'}</td>
                                <td>{customer.email || '-'}</td>
                                <td>{customer.address || '-'}</td>
                                <td className="actions-cell">
                                    <Button size="sm" variant="secondary" onClick={() => openModal(customer)}>編集</Button>
                                    <Button size="sm" variant="danger" onClick={() => deleteCustomer(customer.id)}>削除</Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {customers.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-state-icon">👥</div>
                        <div className="empty-state-text">顧客がいません</div>
                    </div>
                )}
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingCustomer ? '顧客編集' : '新規顧客'}>
                <form onSubmit={saveCustomer}>
                    <div className="form-group">
                        <label>顧客名</label>
                        <input name="name" defaultValue={editingCustomer?.name} required />
                    </div>
                    <div className="form-group">
                        <label>電話番号</label>
                        <input name="phone" type="tel" defaultValue={editingCustomer?.phone} />
                    </div>
                    <div className="form-group">
                        <label>メールアドレス</label>
                        <input name="email" type="email" defaultValue={editingCustomer?.email} />
                    </div>
                    <div className="form-group">
                        <label>住所</label>
                        <input name="address" defaultValue={editingCustomer?.address} />
                    </div>
                    <div className="form-group">
                        <label>メモ</label>
                        <textarea name="memo" defaultValue={editingCustomer?.memo} />
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

function CustomersPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <CustomersContent />;
}

export default function Page() {
    return (
        <AuthProvider>
            <CustomersPage />
        </AuthProvider>
    );
}

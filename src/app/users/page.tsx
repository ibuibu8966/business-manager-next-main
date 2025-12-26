'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { User } from '@/types';

function UsersContent() {
    const { db, updateCollection } = useDatabase();
    const { user: currentUser } = useAuth();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    if (!db) return <div>Loading...</div>;
    if (!currentUser?.isAdmin) {
        return (
            <AppLayout title="ユーザー管理">
                <div className="empty-state">
                    <div className="empty-state-icon">🔒</div>
                    <div className="empty-state-text">管理者権限が必要です</div>
                </div>
            </AppLayout>
        );
    }

    const openModal = (user?: User) => {
        if (!user) {
            alert('新規ユーザーはログイン画面の「アカウントを作成」から登録してください。');
            return;
        }
        setEditingUser(user || null);
        setModalOpen(true);
    };

    const saveUser = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const userData = {
            name: formData.get('name') as string,
            email: formData.get('email') as string,
            isAdmin: formData.get('isAdmin') === 'true',
        };

        if (editingUser) {
            updateCollection('users', items =>
                items.map(u => u.id === editingUser.id ? { ...u, ...userData } : u)
            );
        }
        setModalOpen(false);
    };

    const deleteUser = (id: number | string) => {
        if (id === currentUser.id) {
            alert('自分自身は削除できません');
            return;
        }
        if (confirm('このユーザーを削除しますか？')) {
            updateCollection('users', items => items.filter(u => u.id !== id));
        }
    };

    return (
        <AppLayout title="ユーザー管理">
            <div className="page-header">
                <h3>ユーザー管理</h3>
                <Button onClick={() => openModal()}>+ 新規ユーザー</Button>
            </div>

            <div className="data-table-container">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>名前</th>
                            <th>メール</th>
                            <th>権限</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {db.users.map(user => (
                            <tr key={user.id}>
                                <td>{user.name}</td>
                                <td>{user.email}</td>
                                <td>
                                    <span className={`badge ${user.isAdmin ? 'badge-admin' : 'badge-user'}`}>
                                        {user.isAdmin ? '管理者' : 'スタッフ'}
                                    </span>
                                </td>
                                <td className="actions-cell">
                                    <Button size="sm" variant="secondary" onClick={() => openModal(user)}>編集</Button>
                                    {user.id !== currentUser.id && (
                                        <Button size="sm" variant="danger" onClick={() => deleteUser(user.id)}>削除</Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="ユーザー編集">
                <form onSubmit={saveUser}>
                    <div className="form-group">
                        <label>名前</label>
                        <input name="name" defaultValue={editingUser?.name} required />
                    </div>
                    <div className="form-group">
                        <label>メールアドレス</label>
                        <input name="email" type="email" defaultValue={editingUser?.email} required />
                    </div>
                    <div className="form-group">
                        <label>権限</label>
                        <select name="isAdmin" defaultValue={editingUser?.isAdmin ? 'true' : 'false'}>
                            <option value="false">スタッフ</option>
                            <option value="true">管理者</option>
                        </select>
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

export default function UsersPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <UsersContent />;
}

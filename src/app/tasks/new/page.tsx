'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Task } from '@/types';

function NewTaskContent() {
    const router = useRouter();
    const { db, updateCollection } = useDatabase();
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!db) return <div>Loading...</div>;

    const saveTask = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const taskData = {
            title: formData.get('title') as string,
            description: formData.get('description') as string,
            status: formData.get('status') as Task['status'],
            priority: formData.get('priority') as Task['priority'],
            dueDate: formData.get('dueDate') as string,
            showAfter: formData.get('showAfter') as string || undefined,
            userId: user?.id || 1,
        };

        const newId = genId(db.tasks);
        updateCollection('tasks', tasks => [
            ...tasks,
            { id: newId, ...taskData, createdAt: new Date().toISOString() }
        ]);

        // 履歴を追加
        updateCollection('taskHistories', histories => [
            ...histories,
            {
                id: genId(histories),
                taskId: newId,
                action: 'created' as const,
                description: 'タスクを作成',
                userId: user?.id || 1,
                createdAt: new Date().toISOString()
            }
        ]);

        router.push('/tasks');
    };

    return (
        <AppLayout title="新規タスク">
            <style jsx>{`
                .mobile-form-container {
                    max-width: 600px;
                    padding: 0 16px;
                }
                .mobile-header {
                    flex-direction: row;
                    align-items: center;
                    gap: 12px;
                }
                .mobile-header h3 {
                    font-size: 18px;
                    margin: 0;
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
                @media (max-width: 600px) {
                    .mobile-form-container {
                        padding: 0 8px;
                    }
                    .mobile-header {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 8px;
                    }
                    .mobile-header h3 {
                        font-size: 16px;
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

            <div className="page-header mobile-header">
                <h3>新規タスク作成</h3>
                <Button variant="ghost" onClick={() => router.push('/tasks')}>← 戻る</Button>
            </div>

            <div className="form-container mobile-form-container">
                <form onSubmit={saveTask}>
                    <div className="form-group">
                        <label>タイトル</label>
                        <input name="title" placeholder="タスクのタイトルを入力" required />
                    </div>
                    <div className="form-group">
                        <label>説明</label>
                        <textarea name="description" placeholder="タスクの詳細を入力" rows={4} />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>ステータス</label>
                            <select name="status" defaultValue="未着手">
                                <option value="未着手">未着手</option>
                                <option value="進行中">進行中</option>
                                <option value="完了">完了</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>優先度</label>
                            <select name="priority" defaultValue="medium">
                                <option value="high">高</option>
                                <option value="medium">中</option>
                                <option value="low">低</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>期限</label>
                            <input type="date" name="dueDate" />
                        </div>
                        <div className="form-group">
                            <label>表示開始日時</label>
                            <input type="datetime-local" name="showAfter" />
                        </div>
                    </div>
                    <div className="form-actions">
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? '保存中...' : 'タスクを作成'}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => router.push('/tasks')}>
                            キャンセル
                        </Button>
                    </div>
                </form>
            </div>
        </AppLayout>
    );
}

export default function NewTaskPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <NewTaskContent />;
}

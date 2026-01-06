'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { BusinessResourceSelector } from '@/components/task/BusinessResourceSelector';
import { Task, ChecklistBlock } from '@/types';

function NewTaskContent() {
    const router = useRouter();
    const { db, updateCollection } = useDatabase();
    const { user, logout } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // マニュアル・チェックリスト選択用の状態
    const [selectedBusinessId, setSelectedBusinessId] = useState<number | undefined>(undefined);
    const [selectedManualId, setSelectedManualId] = useState<number | undefined>(undefined);
    const [selectedChecklistId, setSelectedChecklistId] = useState<number | undefined>(undefined);
    const [checklistBlocks, setChecklistBlocks] = useState<ChecklistBlock[] | undefined>(undefined);

    if (!db) return <div>Loading...</div>;

    // 事業選択時のハンドラ
    const handleBusinessChange = (businessId: number | undefined) => {
        setSelectedBusinessId(businessId);
        // 事業が変わったらリソース選択をリセット
        setSelectedManualId(undefined);
        setSelectedChecklistId(undefined);
        setChecklistBlocks(undefined);
    };

    const saveTask = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const taskData = {
            title: formData.get('title') as string,
            description: (formData.get('description') as string) || undefined,
            status: formData.get('status') as Task['status'],
            priority: formData.get('priority') as Task['priority'],
            dueDate: (formData.get('dueDate') as string) || undefined,
            showAfter: (formData.get('showAfter') as string) || undefined,
            businessId: selectedBusinessId,
            assigneeId: formData.get('assigneeId') ? Number(formData.get('assigneeId')) : undefined,
            userId: user?.id || 1,
            // マニュアル・チェックリスト連携
            attachedManualId: selectedManualId,
            attachedChecklistId: selectedChecklistId,
            checklistBlocks: checklistBlocks,
        };

        const newId = genId(db.tasks);
        const insertResults = await updateCollection('tasks', tasks => [
            ...tasks,
            { id: newId, ...taskData, createdAt: new Date().toISOString() }
        ]);

        // Supabaseから返されたIDを使用（なければローカルID）
        const actualTaskId = insertResults.length > 0 ? insertResults[0].supabaseId : newId;

        // 履歴を追加
        updateCollection('taskHistories', histories => [
            ...histories,
            {
                id: genId(histories),
                taskId: actualTaskId,
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
                .resource-selector-wrapper {
                    margin: 16px 0;
                }
                @media (max-width: 600px) {
                    :global(#main-header) {
                        display: none;
                    }
                    :global(.sidebar-footer) {
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
                    .user-header .logout-btn {
                        background: none;
                        border: none;
                        color: var(--text-secondary);
                        cursor: pointer;
                        font-size: 14px;
                        padding: 4px 8px;
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
                <button className="logout-btn" onClick={logout}>ログアウト</button>
            </div>

            <div className="mobile-header">
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
                    <div className="form-row">
                        <div className="form-group">
                            <label>事業</label>
                            <select
                                name="businessId"
                                value={selectedBusinessId || ''}
                                onChange={e => handleBusinessChange(e.target.value ? Number(e.target.value) : undefined)}
                            >
                                <option value="">未設定</option>
                                {db.businesses.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>担当者</label>
                            <select name="assigneeId" defaultValue="">
                                <option value="">未設定</option>
                                {db.users.map(u => (
                                    <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 事業選択時にマニュアル・チェックリスト選択を表示 */}
                    {selectedBusinessId && (
                        <div className="resource-selector-wrapper">
                            <BusinessResourceSelector
                                businessId={selectedBusinessId}
                                selectedManualId={selectedManualId}
                                selectedChecklistId={selectedChecklistId}
                                onManualSelect={setSelectedManualId}
                                onChecklistSelect={(checklistId, blocks) => {
                                    setSelectedChecklistId(checklistId);
                                    setChecklistBlocks(blocks);
                                }}
                            />
                        </div>
                    )}

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

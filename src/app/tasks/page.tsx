'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Task, TaskHistory } from '@/types';

function TasksContent() {
    const { db, updateCollection } = useDatabase();
    const { user } = useAuth();
    const [modalOpen, setModalOpen] = useState(false);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [filterStatus, setFilterStatus] = useState('');
    const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
    const [newMemo, setNewMemo] = useState('');

    if (!db) return <div>Loading...</div>;

    const now = new Date();

    // showAfterが未来のタスクは非表示
    let tasks = db.tasks.filter(t => {
        if (t.showAfter) {
            return new Date(t.showAfter) <= now;
        }
        return true;
    });

    if (filterStatus) tasks = tasks.filter(t => t.status === filterStatus);

    const openModal = (task?: Task) => {
        setEditingTask(task || null);
        setModalOpen(true);
    };

    const openDetailModal = (task: Task) => {
        setSelectedTask(task);
        setNewMemo('');
        setDetailModalOpen(true);
    };

    // 履歴を追加するヘルパー
    const addHistory = (taskId: number, action: TaskHistory['action'], description: string) => {
        updateCollection('taskHistories', histories => [
            ...histories,
            {
                id: genId(histories),
                taskId,
                action,
                description,
                userId: user?.id || 1,
                createdAt: new Date().toISOString()
            }
        ]);

        // 管理者に通知（自分以外）
        if (user && !user.isAdmin) {
            db.users.filter(u => u.isAdmin && u.id !== user.id).forEach(admin => {
                updateCollection('notifications', notifs => [
                    ...notifs,
                    {
                        id: genId(notifs),
                        type: 'task_update' as const,
                        taskId,
                        userId: admin.id,
                        message: `${user.name}がタスクを更新: ${description}`,
                        isRead: false,
                        createdAt: new Date().toISOString()
                    }
                ]);
            });
        }
    };

    // ワンクリックでステータス変更
    const changeStatus = (task: Task, newStatus: Task['status']) => {
        if (task.status === newStatus) return;

        const oldStatus = task.status;
        updateCollection('tasks', tasks =>
            tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t)
        );
        addHistory(task.id, 'status', `${oldStatus} → ${newStatus}`);
    };

    const saveTask = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const taskData = {
            title: formData.get('title') as string,
            description: formData.get('description') as string,
            status: formData.get('status') as Task['status'],
            priority: formData.get('priority') as Task['priority'],
            dueDate: formData.get('dueDate') as string,
            showAfter: formData.get('showAfter') as string || undefined,
            businessId: formData.get('businessId') ? Number(formData.get('businessId')) : undefined,
            assigneeId: formData.get('assigneeId') ? Number(formData.get('assigneeId')) : undefined,
            userId: user?.id || 1,
        };

        if (editingTask) {
            updateCollection('tasks', tasks =>
                tasks.map(t => t.id === editingTask.id ? { ...t, ...taskData } : t)
            );
        } else {
            const newId = genId(db.tasks);
            updateCollection('tasks', tasks => [
                ...tasks,
                { id: newId, ...taskData, createdAt: new Date().toISOString() }
            ]);
            addHistory(newId, 'created', 'タスクを作成');
        }
        setModalOpen(false);
    };

    // メモを追加
    const addMemo = () => {
        if (!selectedTask || !newMemo.trim()) return;
        addHistory(selectedTask.id, 'memo', newMemo.trim());
        setNewMemo('');
    };

    // リマインダー設定
    const setReminder = (task: Task, datetime: string) => {
        updateCollection('tasks', tasks =>
            tasks.map(t => t.id === task.id ? { ...t, showAfter: datetime } : t)
        );
        addHistory(task.id, 'reminder', `${datetime}まで非表示に設定`);
        setDetailModalOpen(false);
    };

    const deleteTask = (id: number) => {
        const task = db.tasks.find(t => t.id === id);
        if (!task) return;

        if (confirm('このタスクを削除しますか？')) {
            addHistory(id, 'deleted', `タスク「${task.title}」を削除`);
            updateCollection('tasks', tasks => tasks.filter(t => t.id !== id));
        }
    };

    // タスクの履歴を取得
    const getTaskHistory = (taskId: number): TaskHistory[] => {
        return db.taskHistories
            .filter(h => h.taskId === taskId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    };

    // 期限超過チェック
    const isOverdue = (task: Task) => {
        if (!task.dueDate || task.status === '完了') return false;
        return new Date(task.dueDate) < now;
    };

    return (
        <AppLayout title="タスク管理">
            <div className="page-header">
                <h3>タスク管理</h3>
                <div className="btn-group">
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="">全て</option>
                        <option value="未着手">未着手</option>
                        <option value="進行中">進行中</option>
                        <option value="完了">完了</option>
                    </select>
                    <Button variant="secondary" onClick={() => setViewMode(viewMode === 'card' ? 'table' : 'card')}>
                        {viewMode === 'card' ? '📋' : '📇'}
                    </Button>
                    <Button onClick={() => openModal()}>+ 新規タスク</Button>
                </div>
            </div>

            {viewMode === 'card' ? (
                <div className="task-cards-grid">
                    {tasks.map(task => (
                        <div
                            key={task.id}
                            className={`task-card priority-${task.priority} status-${task.status} ${isOverdue(task) ? 'overdue' : ''}`}
                            style={isOverdue(task) ? { borderColor: 'var(--danger)', borderWidth: '2px' } : {}}
                        >
                            <div className="task-card-header">
                                <span className={`badge badge-${task.status === '完了' ? 'done' : task.status === '進行中' ? 'active' : 'pending'}`}>
                                    {task.status}
                                </span>
                                {isOverdue(task) && <span className="badge" style={{ background: 'var(--danger)', color: 'white' }}>⚠️ 期限超過</span>}
                            </div>
                            <h4 className="task-card-title" onClick={() => openDetailModal(task)} style={{ cursor: 'pointer' }}>
                                {task.title}
                            </h4>
                            <p className="task-card-desc">{task.description}</p>
                            <div className="task-card-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {task.dueDate && <span>📅 {task.dueDate}</span>}
                                {task.businessId && (
                                    <span>🏢 {db.businesses.find(b => b.id === task.businessId)?.name}</span>
                                )}
                                {task.assigneeId && (
                                    <span>👤 {db.users.find(u => u.id === task.assigneeId)?.name}</span>
                                )}
                            </div>
                            <div className="task-card-actions" style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                {task.status !== '進行中' && (
                                    <Button size="sm" variant="primary" onClick={() => changeStatus(task, '進行中')}>進行中</Button>
                                )}
                                {task.status !== '完了' && (
                                    <Button size="sm" variant="success" onClick={() => changeStatus(task, '完了')}>完了</Button>
                                )}
                                {task.status === '完了' && (
                                    <Button size="sm" variant="secondary" onClick={() => changeStatus(task, '未着手')}>戻す</Button>
                                )}
                                {task.status === '完了' && (
                                    <button
                                        type="button"
                                        onClick={() => deleteTask(task.id)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '4px 8px',
                                            color: 'var(--danger)',
                                            fontSize: '16px'
                                        }}
                                        title="削除"
                                    >
                                        🗑️
                                    </button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => openDetailModal(task)}>詳細</Button>
                            </div>
                        </div>
                    ))}
                    {tasks.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">✅</div>
                            <div className="empty-state-text">タスクがありません</div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="data-table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>タイトル</th>
                                <th>ステータス</th>
                                <th>期限</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map(task => (
                                <tr key={task.id} style={isOverdue(task) ? { background: 'rgba(239, 68, 68, 0.1)' } : {}}>
                                    <td onClick={() => openDetailModal(task)} style={{ cursor: 'pointer' }}>{task.title}</td>
                                    <td>
                                        <span className={`badge badge-${task.status === '完了' ? 'done' : 'pending'}`}>
                                            {task.status}
                                        </span>
                                        {isOverdue(task) && <span style={{ color: 'var(--danger)', marginLeft: '8px' }}>⚠️</span>}
                                    </td>
                                    <td>{task.dueDate || '-'}</td>
                                    <td className="actions-cell">
                                        {task.status !== '完了' && (
                                            <Button size="sm" variant="success" onClick={() => changeStatus(task, '完了')}>完了</Button>
                                        )}
                                        <Button size="sm" variant="secondary" onClick={() => openDetailModal(task)}>詳細</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 新規・編集モーダル */}
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingTask ? 'タスク編集' : '新規タスク'}>
                <form onSubmit={saveTask}>
                    <div className="form-group">
                        <label>タイトル</label>
                        <input name="title" defaultValue={editingTask?.title} required />
                    </div>
                    <div className="form-group">
                        <label>説明</label>
                        <textarea name="description" defaultValue={editingTask?.description} />
                    </div>
                    <div className="form-group">
                        <label>ステータス</label>
                        <select name="status" defaultValue={editingTask?.status || '未着手'}>
                            <option value="未着手">未着手</option>
                            <option value="進行中">進行中</option>
                            <option value="完了">完了</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>優先度</label>
                        <select name="priority" defaultValue={editingTask?.priority || 'medium'}>
                            <option value="high">高</option>
                            <option value="medium">中</option>
                            <option value="low">低</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>期限</label>
                        <input type="date" name="dueDate" defaultValue={editingTask?.dueDate} />
                    </div>
                    <div className="form-group">
                        <label>事業</label>
                        <select name="businessId" defaultValue={editingTask?.businessId || ''}>
                            <option value="">未設定</option>
                            {db.businesses.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>担当者</label>
                        <select name="assigneeId" defaultValue={editingTask?.assigneeId || ''}>
                            <option value="">未設定</option>
                            {db.users.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>表示開始日時（この日時まで非表示）</label>
                        <input type="datetime-local" name="showAfter" defaultValue={editingTask?.showAfter} />
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* 詳細モーダル */}
            <Modal isOpen={detailModalOpen} onClose={() => setDetailModalOpen(false)} title="タスク詳細">
                {selectedTask && (
                    <div>
                        <h4 style={{ marginBottom: '16px' }}>{selectedTask.title}</h4>

                        <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
                            <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ステータス</label>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                    <Button
                                        size="sm"
                                        variant={selectedTask.status === '未着手' ? 'primary' : 'ghost'}
                                        onClick={() => { changeStatus(selectedTask, '未着手'); setSelectedTask({ ...selectedTask, status: '未着手' }); }}
                                    >未着手</Button>
                                    <Button
                                        size="sm"
                                        variant={selectedTask.status === '進行中' ? 'primary' : 'ghost'}
                                        onClick={() => { changeStatus(selectedTask, '進行中'); setSelectedTask({ ...selectedTask, status: '進行中' }); }}
                                    >進行中</Button>
                                    <Button
                                        size="sm"
                                        variant={selectedTask.status === '完了' ? 'success' : 'ghost'}
                                        onClick={() => { changeStatus(selectedTask, '完了'); setSelectedTask({ ...selectedTask, status: '完了' }); }}
                                    >完了</Button>
                                </div>
                            </div>

                            {selectedTask.dueDate && (
                                <div>
                                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>期限</label>
                                    <div>{selectedTask.dueDate}</div>
                                </div>
                            )}

                            <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>事業</label>
                                <div>{db.businesses.find(b => b.id === selectedTask.businessId)?.name || '未設定'}</div>
                            </div>

                            <div>
                                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>担当者</label>
                                <div>{db.users.find(u => u.id === selectedTask.assigneeId)?.name || '未設定'}</div>
                            </div>

                            {selectedTask.description && (
                                <div>
                                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>説明</label>
                                    <div>{selectedTask.description}</div>
                                </div>
                            )}
                        </div>

                        {/* メモ追加 */}
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📝 メモを追加</label>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                <input
                                    type="text"
                                    value={newMemo}
                                    onChange={e => setNewMemo(e.target.value)}
                                    placeholder="例: 一旦連絡済み、明日確認"
                                    style={{ flex: 1 }}
                                />
                                <Button size="sm" onClick={addMemo}>追加</Button>
                            </div>
                        </div>

                        {/* リマインダー設定 */}
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>⏰ 非表示にする（リマインダー）</label>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                <input
                                    type="datetime-local"
                                    id="reminder-datetime"
                                    defaultValue={selectedTask.showAfter}
                                    style={{ flex: 1 }}
                                />
                                <Button size="sm" onClick={() => {
                                    const input = document.getElementById('reminder-datetime') as HTMLInputElement;
                                    if (input.value) setReminder(selectedTask, input.value);
                                }}>設定</Button>
                            </div>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                指定した日時までタスク一覧から非表示になります
                            </p>
                        </div>

                        {/* 履歴 */}
                        <div>
                            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>📋 更新履歴</label>
                            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {getTaskHistory(selectedTask.id).map(h => {
                                    const historyUser = db.users.find(u => u.id === h.userId);
                                    return (
                                        <div key={h.id} style={{
                                            padding: '8px 12px',
                                            borderLeft: '2px solid var(--border)',
                                            marginBottom: '8px',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: '0 4px 4px 0'
                                        }}>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {new Date(h.createdAt).toLocaleString('ja-JP')} - {historyUser?.name || '?'}
                                            </div>
                                            <div style={{ fontSize: '14px', marginTop: '2px' }}>{h.description}</div>
                                        </div>
                                    );
                                })}
                                {getTaskHistory(selectedTask.id).length === 0 && (
                                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>履歴がありません</p>
                                )}
                            </div>
                        </div>

                        <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
                            <Button variant="secondary" onClick={() => { openModal(selectedTask); setDetailModalOpen(false); }}>編集</Button>
                            <Button variant="danger" onClick={() => { deleteTask(selectedTask.id); setDetailModalOpen(false); }}>削除</Button>
                        </div>
                    </div>
                )}
            </Modal>
        </AppLayout>
    );
}

export default function TasksPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <TasksContent />;
}

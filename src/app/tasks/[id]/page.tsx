'use client';

import { useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { BlockEditor, Block } from '@/components/editor/BlockEditor';
import { Task, TaskHistory, ChecklistBlock } from '@/types';
import { useDebouncedCallback } from 'use-debounce';

function TaskDetailContent() {
    const params = useParams();
    const router = useRouter();
    const { db, updateCollection } = useDatabase();
    const { user } = useAuth();
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
    const [newMemo, setNewMemo] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [manualOpen, setManualOpen] = useState(false);
    const initialLoadDone = useRef(false);

    const taskId = Number(params.id);

    // チェックリストの変更を保存（デバウンス）- フックは条件分岐の前に配置
    const debouncedSaveChecklist = useDebouncedCallback((blocks: Block[]) => {
        setIsSaving(true);
        updateCollection('tasks', tasks =>
            tasks.map(t => t.id === taskId ? {
                ...t,
                checklistBlocks: blocks as ChecklistBlock[],
            } : t)
        );
        setLastSaved(new Date());
        setTimeout(() => setIsSaving(false), 500);
    }, 1000);

    const handleChecklistChange = useCallback((blocks: Block[]) => {
        if (!initialLoadDone.current) {
            initialLoadDone.current = true;
            return;
        }
        debouncedSaveChecklist(blocks);
    }, [debouncedSaveChecklist]);

    if (!db) return <div>Loading...</div>;

    const task = db.tasks.find(t => t.id === taskId);

    if (!task) {
        return (
            <AppLayout title="タスクが見つかりません">
                <div className="empty-state">
                    <div className="empty-state-icon">?</div>
                    <div className="empty-state-text">タスクが見つかりません</div>
                    <Link href="/tasks">
                        <Button>タスク一覧へ戻る</Button>
                    </Link>
                </div>
            </AppLayout>
        );
    }

    const business = task.businessId ? db.businesses.find(b => b.id === task.businessId) : null;
    const assignee = task.assigneeId ? db.users.find(u => u.id === task.assigneeId) : null;
    const attachedManual = task.attachedManualId ? db.manuals.find(m => m.id === task.attachedManualId) : null;

    // 履歴を追加するヘルパー
    const addHistory = (action: TaskHistory['action'], description: string) => {
        updateCollection('taskHistories', histories => [
            ...histories,
            {
                id: genId(histories),
                taskId: task.id,
                action,
                description,
                userId: user?.id || 1,
                createdAt: new Date().toISOString()
            }
        ]);
    };

    // チェックリストの進捗を計算
    const checklistBlocks = (task.checklistBlocks || []) as ChecklistBlock[];
    const checkboxBlocks = checklistBlocks.filter(b => b.type === 'checkbox');
    const checkedCount = checkboxBlocks.filter(b => b.checked).length;
    const totalCount = checkboxBlocks.length;
    const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
    const allChecked = totalCount === 0 || checkedCount === totalCount;

    // ステータス変更
    const changeStatus = (newStatus: Task['status']) => {
        if (task.status === newStatus) return;

        // チェックリストがあって未完了の場合はブロック
        if (newStatus === '完了' && !allChecked) {
            return; // ボタンがdisabledなので通常ここには来ない
        }

        const oldStatus = task.status;
        updateCollection('tasks', tasks =>
            tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t)
        );
        addHistory('status', `${oldStatus} → ${newStatus}`);
    };

    // メモを追加
    const addMemoToTask = () => {
        if (!newMemo.trim()) return;
        addHistory('memo', newMemo.trim());
        setNewMemo('');
    };

    // タスク編集を保存
    const saveTaskEdit = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        updateCollection('tasks', tasks =>
            tasks.map(t => t.id === task.id ? {
                ...t,
                title: formData.get('title') as string,
                description: (formData.get('description') as string) || undefined,
                priority: formData.get('priority') as Task['priority'],
                dueDate: (formData.get('dueDate') as string) || undefined,
                assigneeId: formData.get('assigneeId') ? Number(formData.get('assigneeId')) : undefined,
            } : t)
        );
        addHistory('updated', 'タスクを編集');
        setEditModalOpen(false);
    };

    // タスク削除
    const deleteTask = () => {
        if (confirm('このタスクを削除しますか？')) {
            updateCollection('taskHistories', histories => [
                ...histories,
                {
                    id: genId(histories),
                    taskId: task.id,
                    action: 'deleted' as const,
                    description: `タスク「${task.title}」を削除`,
                    userId: user?.id || 1,
                    createdAt: new Date().toISOString()
                }
            ]);
            setTimeout(() => {
                updateCollection('tasks', tasks => tasks.filter(t => t.id !== task.id));
                router.push('/tasks');
            }, 100);
        }
    };

    // チェックリストをテンプレートとして保存
    const saveAsTemplate = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        if (!task.businessId || !task.checklistBlocks) return;

        const newChecklist = {
            id: genId(db.checklists),
            businessId: task.businessId,
            title: formData.get('title') as string,
            description: (formData.get('description') as string) || undefined,
            blocks: JSON.parse(JSON.stringify(task.checklistBlocks)), // ディープコピー
            isArchived: false,
            createdAt: new Date().toISOString(),
        };

        updateCollection('checklists', checklists => [...checklists, newChecklist]);
        setSaveTemplateModalOpen(false);
        alert('チェックリストをテンプレートとして保存しました');
    };

    // タスク履歴を取得
    const getTaskHistory = (): TaskHistory[] => {
        return db.taskHistories
            .filter(h => h.taskId === task.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    };

    // 期限超過チェック
    const isOverdue = task.dueDate && task.status !== '完了' && new Date(task.dueDate) < new Date();

    return (
        <AppLayout title={task.title}>
            <style jsx>{`
                .task-detail-page {
                    max-width: 900px;
                }
                .task-detail-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 16px;
                    margin-bottom: 24px;
                    flex-wrap: wrap;
                }
                .task-detail-header-left {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .task-detail-back {
                    color: var(--text-muted);
                    text-decoration: none;
                    font-size: 14px;
                }
                .task-detail-back:hover {
                    color: var(--text-primary);
                }
                .task-detail-badges {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .task-detail-title {
                    font-size: 24px;
                    font-weight: 600;
                    margin: 0;
                }
                .task-detail-meta {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                    font-size: 14px;
                    color: var(--text-secondary);
                }
                .task-detail-meta-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .task-detail-actions {
                    display: flex;
                    gap: 8px;
                }
                .task-detail-section {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                .task-detail-section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }
                .task-detail-section-title {
                    font-size: 16px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .task-detail-description {
                    color: var(--text-secondary);
                    line-height: 1.6;
                    white-space: pre-wrap;
                }
                .manual-preview {
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    overflow: hidden;
                    background: var(--bg-tertiary);
                }
                .manual-preview iframe {
                    width: 100%;
                    height: 400px;
                    border: none;
                }
                .manual-link {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px;
                    background: var(--bg-tertiary);
                    border-radius: 8px;
                }
                .manual-link-info {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .manual-link-name {
                    font-weight: 500;
                }
                .manual-link-type {
                    font-size: 12px;
                    color: var(--text-muted);
                }
                .checklist-progress {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 16px;
                }
                .checklist-progress-bar {
                    flex: 1;
                    height: 8px;
                    background: var(--bg-tertiary);
                    border-radius: 4px;
                    overflow: hidden;
                }
                .checklist-progress-fill {
                    height: 100%;
                    transition: width 0.3s ease;
                }
                .checklist-progress-text {
                    font-size: 14px;
                    color: var(--text-secondary);
                    white-space: nowrap;
                }
                .status-buttons {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                    margin-bottom: 20px;
                }
                .memo-input-row {
                    display: flex;
                    gap: 8px;
                }
                .memo-input-row input {
                    flex: 1;
                }
                .history-list {
                    max-height: 300px;
                    overflow-y: auto;
                }
                .history-item {
                    padding: 10px 12px;
                    border-left: 2px solid var(--border-color);
                    margin-bottom: 8px;
                    background: var(--bg-tertiary);
                    border-radius: 0 6px 6px 0;
                }
                .history-item-time {
                    font-size: 12px;
                    color: var(--text-muted);
                }
                .history-item-content {
                    font-size: 14px;
                    margin-top: 4px;
                }
                .overdue-badge {
                    background: var(--danger);
                    color: white;
                }
                .complete-button-section {
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid var(--border-color);
                }
                .complete-button-warning {
                    font-size: 13px;
                    color: var(--warning);
                    margin-bottom: 12px;
                }
                .save-status {
                    font-size: 13px;
                    color: var(--text-muted);
                }
            `}</style>

            <div className="task-detail-page">
                {/* ヘッダー */}
                <div className="task-detail-header">
                    <div className="task-detail-header-left">
                        <Link href="/tasks" className="task-detail-back">
                            ← タスク一覧へ戻る
                        </Link>
                        <div className="task-detail-badges">
                            <span className={`badge badge-${task.status === '完了' ? 'done' : task.status === '進行中' ? 'active' : 'pending'}`}>
                                {task.status}
                            </span>
                            <span className={`badge ${task.priority === 'high' ? 'badge-danger' : task.priority === 'low' ? 'badge-secondary' : ''}`}>
                                {task.priority === 'high' ? '高' : task.priority === 'low' ? '低' : '中'}
                            </span>
                            {isOverdue && <span className="badge overdue-badge">期限超過</span>}
                        </div>
                        <h1 className="task-detail-title">{task.title}</h1>
                        <div className="task-detail-meta">
                            {task.dueDate && (
                                <span className="task-detail-meta-item">
                                    <span>期限:</span> {task.dueDate}
                                </span>
                            )}
                            {assignee && (
                                <span className="task-detail-meta-item">
                                    <span>担当:</span> {assignee.name}
                                </span>
                            )}
                            {business && (
                                <span className="task-detail-meta-item">
                                    <span>事業:</span> {business.name}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="task-detail-actions">
                        <Button variant="secondary" onClick={() => setEditModalOpen(true)}>編集</Button>
                        <Button variant="danger" onClick={deleteTask}>削除</Button>
                    </div>
                </div>

                {/* ステータス変更ボタン */}
                <div className="status-buttons">
                    <Button
                        size="sm"
                        variant={task.status === '未着手' ? 'primary' : 'ghost'}
                        onClick={() => changeStatus('未着手')}
                    >未着手</Button>
                    <Button
                        size="sm"
                        variant={task.status === '進行中' ? 'primary' : 'ghost'}
                        onClick={() => changeStatus('進行中')}
                    >進行中</Button>
                    <Button
                        size="sm"
                        variant={task.status === '完了' ? 'success' : 'ghost'}
                        onClick={() => changeStatus('完了')}
                        disabled={!allChecked}
                        title={!allChecked ? 'チェックリストを全て完了してください' : ''}
                    >完了</Button>
                </div>

                {/* 説明 */}
                {task.description && (
                    <div className="task-detail-section">
                        <div className="task-detail-section-title">説明</div>
                        <p className="task-detail-description">{task.description}</p>
                    </div>
                )}

                {/* マニュアル */}
                {attachedManual && (
                    <div className="task-detail-section">
                        <div className="task-detail-section-header">
                            <div className="task-detail-section-title">
                                <span>マニュアル</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Button size="sm" variant="ghost" onClick={() => setManualOpen(!manualOpen)}>
                                    {manualOpen ? 'マニュアルを閉じる' : 'マニュアルを開く'}
                                </Button>
                                {manualOpen && attachedManual.type === 'url' && attachedManual.content && (
                                    <a href={attachedManual.content} target="_blank" rel="noopener noreferrer">
                                        <Button size="sm" variant="ghost">新しいタブで開く</Button>
                                    </a>
                                )}
                                {manualOpen && attachedManual.type === 'pdf' && attachedManual.fileUrl && (
                                    <a href={attachedManual.fileUrl} target="_blank" rel="noopener noreferrer">
                                        <Button size="sm" variant="ghost">新しいタブで開く</Button>
                                    </a>
                                )}
                            </div>
                        </div>
                        {manualOpen && (
                            <>
                                {attachedManual.type === 'url' && attachedManual.content ? (
                                    <div className="manual-preview">
                                        <iframe src={attachedManual.content} title={attachedManual.name} />
                                    </div>
                                ) : attachedManual.type === 'pdf' && attachedManual.fileUrl ? (
                                    <div className="manual-preview">
                                        <iframe src={attachedManual.fileUrl} title={attachedManual.name} />
                                    </div>
                                ) : (
                                    <div className="manual-link">
                                        <div className="manual-link-info">
                                            <span className="manual-link-name">{attachedManual.name}</span>
                                            <span className="manual-link-type">{attachedManual.type === 'pdf' ? 'PDF' : 'URL'}</span>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* チェックリスト */}
                {checklistBlocks.length > 0 && (
                    <div className="task-detail-section">
                        <div className="task-detail-section-header">
                            <div className="task-detail-section-title">
                                <span>チェックリスト</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {isSaving ? (
                                    <span className="save-status">保存中...</span>
                                ) : lastSaved ? (
                                    <span className="save-status">保存済み {lastSaved.toLocaleTimeString('ja-JP')}</span>
                                ) : null}
                                {task.businessId && (
                                    <Button size="sm" variant="ghost" onClick={() => setSaveTemplateModalOpen(true)}>
                                        テンプレートとして保存
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* 進捗バー */}
                        <div className="checklist-progress">
                            <div className="checklist-progress-bar">
                                <div
                                    className="checklist-progress-fill"
                                    style={{
                                        width: `${progressPercent}%`,
                                        background: progressPercent === 100 ? 'var(--success)' : 'var(--accent-primary)'
                                    }}
                                />
                            </div>
                            <span className="checklist-progress-text">
                                {checkedCount}/{totalCount} ({progressPercent}%)
                            </span>
                        </div>

                        {/* BlockEditor */}
                        <BlockEditor
                            initialValue={checklistBlocks as Block[]}
                            onChange={handleChecklistChange}
                        />

                        {/* 完了ボタン */}
                        <div className="complete-button-section">
                            {!allChecked && (
                                <p className="complete-button-warning">
                                    全てのチェック項目を完了してから、タスクを完了にしてください
                                </p>
                            )}
                            <Button
                                variant="success"
                                onClick={() => changeStatus('完了')}
                                disabled={!allChecked || task.status === '完了'}
                            >
                                {task.status === '完了' ? '完了済み' : 'タスクを完了にする'}
                            </Button>
                        </div>
                    </div>
                )}

                {/* メモ追加 */}
                <div className="task-detail-section">
                    <div className="task-detail-section-title">メモを追加</div>
                    <div className="memo-input-row">
                        <input
                            type="text"
                            value={newMemo}
                            onChange={e => setNewMemo(e.target.value)}
                            placeholder="メモを入力..."
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    addMemoToTask();
                                }
                            }}
                        />
                        <Button onClick={addMemoToTask}>追加</Button>
                    </div>
                </div>

                {/* 履歴 */}
                <div className="task-detail-section">
                    <div className="task-detail-section-title">更新履歴</div>
                    <div className="history-list">
                        {getTaskHistory().map(h => {
                            const historyUser = db.users.find(u => u.id === h.userId);
                            return (
                                <div key={h.id} className="history-item">
                                    <div className="history-item-time">
                                        {new Date(h.createdAt).toLocaleString('ja-JP')} - {historyUser?.name || '?'}
                                    </div>
                                    <div className="history-item-content">{h.description}</div>
                                </div>
                            );
                        })}
                        {getTaskHistory().length === 0 && (
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>履歴がありません</p>
                        )}
                    </div>
                </div>
            </div>

            {/* 編集モーダル */}
            <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="タスク編集">
                <form onSubmit={saveTaskEdit}>
                    <div className="form-group">
                        <label>タイトル</label>
                        <input name="title" defaultValue={task.title} required />
                    </div>
                    <div className="form-group">
                        <label>説明</label>
                        <textarea name="description" defaultValue={task.description} rows={4} />
                    </div>
                    <div className="form-group">
                        <label>優先度</label>
                        <select name="priority" defaultValue={task.priority || 'medium'}>
                            <option value="high">高</option>
                            <option value="medium">中</option>
                            <option value="low">低</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>期限</label>
                        <input type="date" name="dueDate" defaultValue={task.dueDate} />
                    </div>
                    <div className="form-group">
                        <label>担当者</label>
                        <select name="assigneeId" defaultValue={task.assigneeId || ''}>
                            <option value="">未設定</option>
                            {db.users.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* テンプレート保存モーダル */}
            <Modal isOpen={saveTemplateModalOpen} onClose={() => setSaveTemplateModalOpen(false)} title="チェックリストをテンプレートとして保存">
                <form onSubmit={saveAsTemplate}>
                    <div className="form-group">
                        <label>タイトル</label>
                        <input
                            name="title"
                            defaultValue={task.attachedChecklistId
                                ? `${db.checklists.find(c => c.id === task.attachedChecklistId)?.title || 'チェックリスト'} - コピー`
                                : 'チェックリスト'
                            }
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>説明（任意）</label>
                        <textarea name="description" rows={3} />
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                        現在のチェックリストの内容が「{business?.name}」のテンプレートとして保存されます。
                    </p>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

export default function TaskDetailPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <TaskDetailContent />;
}

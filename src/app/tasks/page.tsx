'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { BusinessResourceSelector } from '@/components/task/BusinessResourceSelector';
import { Task, TaskHistory, ChecklistBlock, RecurringTaskTemplate, RecurrencePattern } from '@/types';
import { formatPatternLabel, patternLabels, dayOfWeekLabels } from '@/lib/recurringTaskGenerator';

function TasksContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { db, updateCollection } = useDatabase();
    const { user } = useAuth();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [filterStatus, setFilterStatus] = useState('');
    const [filterAssignee, setFilterAssignee] = useState<number | ''>('');
    const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

    // タブ切り替え（タスク一覧 / 繰り返しタスク）
    const [activeTab, setActiveTab] = useState<'tasks' | 'recurring'>('tasks');

    // URLパラメータからタブを設定
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'recurring') {
            setActiveTab('recurring');
        }
    }, [searchParams]);

    // 新規タスク作成用の状態
    const [selectedBusinessId, setSelectedBusinessId] = useState<number | undefined>(undefined);
    const [selectedManualId, setSelectedManualId] = useState<number | undefined>(undefined);
    const [selectedChecklistId, setSelectedChecklistId] = useState<number | undefined>(undefined);
    const [checklistBlocks, setChecklistBlocks] = useState<ChecklistBlock[] | undefined>(undefined);

    // 繰り返しタスク用の状態
    const [recurringModalOpen, setRecurringModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<RecurringTaskTemplate | null>(null);
    const [filterRecurringActive, setFilterRecurringActive] = useState<'all' | 'active' | 'inactive'>('all');
    const [filterRecurringBusiness, setFilterRecurringBusiness] = useState<number | 'all'>('all');
    const [pattern, setPattern] = useState<RecurrencePattern>('daily');
    const [dayOfWeek, setDayOfWeek] = useState(1);
    const [dayOfMonth, setDayOfMonth] = useState(1);
    const [recurringBusinessId, setRecurringBusinessId] = useState<number | undefined>(undefined);

    if (!db) return <div>Loading...</div>;

    const now = new Date();

    // 非表示中タスク（showAfterが未来）
    const hiddenTasks = db.tasks.filter(t => t.showAfter && new Date(t.showAfter) > now);

    // 表示中タスク
    let tasks = db.tasks.filter(t => {
        if (t.showAfter) {
            return new Date(t.showAfter) <= now;
        }
        return true;
    });

    // スタッフは自分のタスクのみ表示
    if (!user?.isAdmin) {
        tasks = tasks.filter(t => t.assigneeId === user?.id);
    }

    // フィルター適用
    if (filterStatus === 'hidden') {
        tasks = hiddenTasks;
    } else if (filterStatus) {
        tasks = tasks.filter(t => t.status === filterStatus);
    } else {
        // 「全て」選択時は完了を除外
        tasks = tasks.filter(t => t.status !== '完了');
    }

    // 担当者フィルター適用
    if (filterAssignee) {
        tasks = tasks.filter(t => t.assigneeId === filterAssignee);
    }

    const openModal = (task?: Task) => {
        setEditingTask(task || null);
        if (task) {
            setSelectedBusinessId(task.businessId);
            setSelectedManualId(task.attachedManualId);
            setSelectedChecklistId(task.attachedChecklistId);
            setChecklistBlocks(task.checklistBlocks);
        } else {
            setSelectedBusinessId(undefined);
            setSelectedManualId(undefined);
            setSelectedChecklistId(undefined);
            setChecklistBlocks(undefined);
        }
        setModalOpen(true);
    };

    // タスク詳細ページへ遷移
    const goToTaskDetail = (taskId: number) => {
        router.push(`/tasks/${taskId}`);
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

    // チェックリストの完了状態を確認
    const isChecklistComplete = (task: Task): boolean => {
        if (!task.checklistBlocks || task.checklistBlocks.length === 0) return true;
        const checkboxes = task.checklistBlocks.filter(b => b.type === 'checkbox');
        if (checkboxes.length === 0) return true;
        return checkboxes.every(b => b.checked);
    };

    // ワンクリックでステータス変更
    const changeStatus = (task: Task, newStatus: Task['status']) => {
        if (task.status === newStatus) return;

        // 完了にする場合、チェックリストが未完了ならブロック
        if (newStatus === '完了' && !isChecklistComplete(task)) {
            alert('チェックリストを全て完了してからタスクを完了にしてください');
            return;
        }

        const oldStatus = task.status;
        updateCollection('tasks', tasks =>
            tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t)
        );
        addHistory(task.id, 'status', `${oldStatus} → ${newStatus}`);
    };

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
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const businessId = formData.get('businessId') ? Number(formData.get('businessId')) : undefined;

        const taskData = {
            title: formData.get('title') as string,
            description: (formData.get('description') as string) || undefined,
            status: formData.get('status') as Task['status'],
            priority: formData.get('priority') as Task['priority'],
            dueDate: (formData.get('dueDate') as string) || undefined,
            showAfter: (formData.get('showAfter') as string) || undefined,
            businessId,
            assigneeId: formData.get('assigneeId') ? Number(formData.get('assigneeId')) : undefined,
            userId: user?.id || 1,
            // マニュアル・チェックリスト連携
            attachedManualId: selectedManualId,
            attachedChecklistId: selectedChecklistId,
            checklistBlocks: checklistBlocks,
        };

        if (editingTask) {
            updateCollection('tasks', tasks =>
                tasks.map(t => t.id === editingTask.id ? { ...t, ...taskData } : t)
            );
            addHistory(editingTask.id, 'updated', 'タスクを編集');
        } else {
            const newId = genId(db.tasks);
            const insertResults = await updateCollection('tasks', tasks => [
                ...tasks,
                { id: newId, ...taskData, createdAt: new Date().toISOString() }
            ]);
            // Supabaseから返されたIDを使用（なければローカルID）
            const actualTaskId = insertResults.length > 0 ? insertResults[0].supabaseId : newId;
            addHistory(actualTaskId, 'created', 'タスクを作成');
        }
        setModalOpen(false);
    };

    // 明日まで非表示
    const hideUntilTomorrow = (task: Task) => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        const datetime = tomorrow.toISOString().slice(0, 16);
        updateCollection('tasks', tasks =>
            tasks.map(t => t.id === task.id ? { ...t, showAfter: datetime } : t)
        );
        addHistory(task.id, 'reminder', '明日まで非表示に設定');
    };

    // 来週まで非表示
    const hideUntilNextWeek = (task: Task) => {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        nextWeek.setHours(9, 0, 0, 0);
        const datetime = nextWeek.toISOString().slice(0, 16);
        updateCollection('tasks', tasks =>
            tasks.map(t => t.id === task.id ? { ...t, showAfter: datetime } : t)
        );
        addHistory(task.id, 'reminder', '来週まで非表示に設定');
    };

    // タスクカードからメモを追加
    const addMemoToTask = (taskId: number, memo: string) => {
        addHistory(taskId, 'memo', memo);
    };

    // 非表示を解除して今すぐ表示
    const showNow = (task: Task) => {
        updateCollection('tasks', tasks =>
            tasks.map(t => t.id === task.id ? { ...t, showAfter: undefined } : t)
        );
        addHistory(task.id, 'reminder', '非表示を解除');
    };

    const deleteTask = async (id: number) => {
        const task = db.tasks.find(t => t.id === id);
        if (!task) return;

        if (confirm('このタスクを削除しますか？')) {
            // 先に履歴を追加してから削除（Supabaseの外部キー制約対応）
            await updateCollection('taskHistories', histories => [
                ...histories,
                {
                    id: genId(histories),
                    taskId: id,
                    action: 'deleted' as const,
                    description: `タスク「${task.title}」を削除`,
                    userId: user?.id || 1,
                    createdAt: new Date().toISOString()
                }
            ]);
            // 履歴保存を待ってからタスクを削除
            setTimeout(() => {
                updateCollection('tasks', tasks => tasks.filter(t => t.id !== id));
            }, 100);
        }
    };

    // 最新メモを取得
    const getLatestMemo = (taskId: number): TaskHistory | null => {
        const memos = db.taskHistories
            .filter(h => h.taskId === taskId && h.action === 'memo')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return memos.length > 0 ? memos[0] : null;
    };

    // 期限超過チェック
    const isOverdue = (task: Task) => {
        if (!task.dueDate || task.status === '完了') return false;
        return new Date(task.dueDate) < now;
    };

    // チェックリスト進捗を取得
    const getChecklistProgress = (task: Task): { checked: number; total: number } | null => {
        if (!task.checklistBlocks || task.checklistBlocks.length === 0) return null;
        const checkboxes = task.checklistBlocks.filter(b => b.type === 'checkbox');
        if (checkboxes.length === 0) return null;
        return {
            checked: checkboxes.filter(b => b.checked).length,
            total: checkboxes.length
        };
    };

    // ===== 繰り返しタスク関連 =====
    // テンプレート一覧（フィルター適用）
    let recurringTemplates = db.recurringTaskTemplates || [];
    if (filterRecurringActive === 'active') {
        recurringTemplates = recurringTemplates.filter(t => t.isActive);
    } else if (filterRecurringActive === 'inactive') {
        recurringTemplates = recurringTemplates.filter(t => !t.isActive);
    }
    if (filterRecurringBusiness !== 'all') {
        recurringTemplates = recurringTemplates.filter(t => t.businessId === filterRecurringBusiness);
    }

    // 新規作成モーダルを開く
    const openRecurringCreateModal = () => {
        setEditingTemplate(null);
        setPattern('daily');
        setDayOfWeek(1);
        setDayOfMonth(1);
        setRecurringBusinessId(undefined);
        setRecurringModalOpen(true);
    };

    // 編集モーダルを開く
    const openRecurringEditModal = (template: RecurringTaskTemplate) => {
        setEditingTemplate(template);
        setPattern(template.pattern);
        setDayOfWeek(template.dayOfWeek || 1);
        setDayOfMonth(template.dayOfMonth || 1);
        setRecurringBusinessId(template.businessId);
        setRecurringModalOpen(true);
    };

    // 保存
    const saveRecurringTemplate = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const templateData: Partial<RecurringTaskTemplate> = {
            title: formData.get('title') as string,
            description: (formData.get('description') as string) || undefined,
            businessId: recurringBusinessId,
            assigneeId: formData.get('assigneeId') ? Number(formData.get('assigneeId')) : undefined,
            priority: (formData.get('priority') as RecurringTaskTemplate['priority']) || 'medium',
            pattern,
            dayOfWeek: pattern === 'weekly' ? dayOfWeek : undefined,
            dayOfMonth: pattern === 'monthly' ? dayOfMonth : undefined,
            startDate: formData.get('startDate') as string,
            endDate: (formData.get('endDate') as string) || undefined,
            attachedChecklistId: formData.get('checklistId') ? Number(formData.get('checklistId')) : undefined,
            isActive: true,
            userId: user?.id || 1,
        };

        if (editingTemplate) {
            updateCollection('recurringTaskTemplates', templates =>
                templates.map(t => t.id === editingTemplate.id ? {
                    ...t,
                    ...templateData,
                    updatedAt: new Date().toISOString()
                } : t)
            );
        } else {
            const newId = genId(db.recurringTaskTemplates);
            const newTemplate: RecurringTaskTemplate = {
                ...templateData as Omit<RecurringTaskTemplate, 'id' | 'createdAt'>,
                id: newId,
                createdAt: new Date().toISOString(),
            } as RecurringTaskTemplate;
            updateCollection('recurringTaskTemplates', templates => [...templates, newTemplate]);
        }

        setRecurringModalOpen(false);
    };

    // 有効/無効切替
    const toggleRecurringActive = (template: RecurringTaskTemplate) => {
        updateCollection('recurringTaskTemplates', templates =>
            templates.map(t => t.id === template.id ? {
                ...t,
                isActive: !t.isActive,
                updatedAt: new Date().toISOString()
            } : t)
        );
    };

    // 削除
    const deleteRecurringTemplate = (template: RecurringTaskTemplate) => {
        if (confirm(`「${template.title}」を削除しますか？`)) {
            updateCollection('recurringTaskTemplates', templates =>
                templates.filter(t => t.id !== template.id)
            );
        }
    };

    // 事業選択用チェックリスト取得
    const getRecurringChecklists = () => {
        if (!recurringBusinessId) return [];
        return db.checklists.filter(c => c.businessId === recurringBusinessId && !c.isArchived);
    };

    return (
        <AppLayout title="タスク管理">
            <style jsx>{`
                .tabs-container {
                    display: flex;
                    gap: 0;
                    margin-bottom: 20px;
                    border-bottom: 2px solid var(--border-color);
                }
                .tab-button {
                    padding: 12px 24px;
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 15px;
                    font-weight: 500;
                    color: var(--text-secondary);
                    position: relative;
                    transition: color 0.2s;
                }
                .tab-button:hover {
                    color: var(--text-primary);
                }
                .tab-button.active {
                    color: var(--accent-primary);
                }
                .tab-button.active::after {
                    content: '';
                    position: absolute;
                    bottom: -2px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: var(--accent-primary);
                }
                .recurring-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 16px;
                }
                .recurring-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 16px;
                }
                .recurring-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 12px;
                }
                .recurring-title {
                    font-size: 16px;
                    font-weight: 600;
                    margin: 0;
                }
                .recurring-pattern {
                    display: inline-block;
                    background: var(--accent-primary);
                    color: white;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 13px;
                    margin-bottom: 12px;
                }
                .recurring-meta {
                    font-size: 14px;
                    color: var(--text-secondary);
                    margin-bottom: 12px;
                }
                .recurring-meta-item {
                    margin-right: 12px;
                }
                .recurring-actions {
                    display: flex;
                    gap: 8px;
                    padding-top: 12px;
                    border-top: 1px solid var(--border-color);
                }
                .form-section-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-secondary);
                    margin: 16px 0 8px;
                    padding-top: 16px;
                    border-top: 1px solid var(--border-color);
                }
                @media (max-width: 600px) {
                    .recurring-grid {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>

            {/* タブ切り替え */}
            <div className="tabs-container">
                <button
                    className={`tab-button ${activeTab === 'tasks' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tasks')}
                >
                    タスク一覧
                </button>
                <button
                    className={`tab-button ${activeTab === 'recurring' ? 'active' : ''}`}
                    onClick={() => setActiveTab('recurring')}
                >
                    繰り返しタスク
                </button>
            </div>

            {activeTab === 'tasks' && (
            <>
            <div className="page-header">
                <h3>タスク管理</h3>
                <div className="btn-group">
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="">全て</option>
                        <option value="未着手">未着手</option>
                        <option value="進行中">進行中</option>
                        <option value="完了">完了</option>
                        <option value="hidden">非表示中 ({hiddenTasks.length})</option>
                    </select>
                    {user?.isAdmin && (
                        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value ? Number(e.target.value) : '')}>
                            <option value="">全担当者</option>
                            {user && <option value={user.id}>{user.name} (自分)</option>}
                            {db.users.filter(u => u.id !== user?.id).map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    )}
                    <Button variant="secondary" onClick={() => setViewMode(viewMode === 'card' ? 'table' : 'card')}>
                        {viewMode === 'card' ? '📋' : '📇'}
                    </Button>
                    <Button onClick={() => openModal()}>+ 新規タスク</Button>
                </div>
            </div>

            {viewMode === 'card' ? (
                <div className="task-cards-grid">
                    {tasks.map(task => {
                        const progress = getChecklistProgress(task);
                        const checklistComplete = isChecklistComplete(task);
                        return (
                            <div
                                key={task.id}
                                className={`task-card priority-${task.priority} status-${task.status} ${isOverdue(task) ? 'overdue' : ''}`}
                                style={isOverdue(task) ? { borderColor: 'var(--danger)', borderWidth: '2px' } : {}}
                            >
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', justifyContent: 'flex-start' }}>
                                    <span className={`badge badge-${task.status === '完了' ? 'done' : task.status === '進行中' ? 'active' : 'pending'}`}>
                                        {task.status}
                                    </span>
                                    {isOverdue(task) && <span className="badge" style={{ background: 'var(--danger)', color: 'white' }}>期限超過</span>}
                                    {task.showAfter && new Date(task.showAfter) > now && (
                                        <span className="badge" style={{ background: 'var(--warning)', color: 'black', fontSize: '11px' }}>
                                            {new Date(task.showAfter).toLocaleDateString('ja-JP')}まで
                                        </span>
                                    )}
                                    {progress && (
                                        <span className="badge" style={{
                                            background: progress.checked === progress.total ? 'var(--success)' : 'var(--bg-tertiary)',
                                            color: progress.checked === progress.total ? 'white' : 'var(--text-secondary)',
                                            fontSize: '11px'
                                        }}>
                                            {progress.checked}/{progress.total}
                                        </span>
                                    )}
                                </div>
                                <div className="task-card-actions" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px', maxWidth: '100%' }}>
                                    {task.status !== '進行中' && (
                                        <Button size="sm" variant="primary" onClick={() => changeStatus(task, '進行中')}>進行中</Button>
                                    )}
                                    {task.status !== '完了' && (
                                        <Button
                                            size="sm"
                                            variant="success"
                                            onClick={() => changeStatus(task, '完了')}
                                            disabled={!checklistComplete}
                                            title={!checklistComplete ? 'チェックリストを完了してください' : ''}
                                        >完了</Button>
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
                                            🗑
                                        </button>
                                    )}
                                    {task.showAfter && new Date(task.showAfter) > now ? (
                                        <Button size="sm" variant="secondary" onClick={() => showNow(task)}>今すぐ表示</Button>
                                    ) : (
                                        <>
                                            <Button size="sm" variant="ghost" onClick={() => hideUntilTomorrow(task)}>明日</Button>
                                            <Button size="sm" variant="ghost" onClick={() => hideUntilNextWeek(task)}>来週</Button>
                                        </>
                                    )}
                                    <Button size="sm" variant="ghost" onClick={() => goToTaskDetail(task.id)}>詳細</Button>
                                </div>
                                <h4 className="task-card-title" onClick={() => goToTaskDetail(task.id)} style={{ cursor: 'pointer' }}>
                                    {task.title}
                                </h4>
                                <p className="task-card-desc">{task.description}</p>
                                <div className="task-card-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {task.dueDate && <span>{task.dueDate}</span>}
                                    {task.businessId && (
                                        <span>{db.businesses.find(b => b.id === task.businessId)?.name}</span>
                                    )}
                                    {task.assigneeId && (
                                        <span>{db.users.find(u => u.id === task.assigneeId)?.name}</span>
                                    )}
                                </div>
                                {/* チェックリスト進捗バー */}
                                {progress && (
                                    <div style={{ marginTop: '8px' }}>
                                        <div style={{
                                            height: '4px',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: '2px',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                width: `${(progress.checked / progress.total) * 100}%`,
                                                height: '100%',
                                                background: progress.checked === progress.total ? 'var(--success)' : 'var(--accent-primary)',
                                                transition: 'width 0.3s ease'
                                            }} />
                                        </div>
                                    </div>
                                )}
                                {/* 最新メモ表示 */}
                                {(() => {
                                    const latestMemo = getLatestMemo(task.id);
                                    if (!latestMemo) return null;
                                    const memoUser = db.users.find(u => u.id === latestMemo.userId);
                                    return (
                                        <div className="task-card-latest-memo">
                                            <span className="memo-author">{memoUser?.name || '?'}:</span>
                                            <span className="memo-text">{latestMemo.description}</span>
                                        </div>
                                    );
                                })()}
                                {/* メモ入力 */}
                                <div className="task-card-memo" style={{ marginTop: '8px' }}>
                                    <input
                                        type="text"
                                        placeholder="メモを追加... (Enter で送信)"
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                                e.preventDefault();
                                                if (e.currentTarget.value.trim()) {
                                                    addMemoToTask(task.id, e.currentTarget.value.trim());
                                                    e.currentTarget.value = '';
                                                }
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '6px 8px',
                                            fontSize: '12px',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '4px',
                                            background: 'var(--bg-tertiary)',
                                            color: 'var(--text-primary)'
                                        }}
                                    />
                                </div>
                                {/* 作成者表示 */}
                                <div className="task-card-creator">
                                    {db.users.find(u => u.id === task.userId)?.name || '?'}が追加
                                </div>
                            </div>
                        );
                    })}
                    {tasks.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">✅</div>
                            <div className="empty-state-text">タスクがありません</div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="task-table-grid">
                    {tasks.map(task => {
                        const checklistComplete = isChecklistComplete(task);
                        return (
                            <div key={task.id} className={`task-table-card ${isOverdue(task) ? 'overdue' : ''}`}>
                                <h4 className="task-table-card-title" onClick={() => goToTaskDetail(task.id)}>
                                    {task.title}
                                </h4>
                                <div className="task-table-card-status">
                                    <span className={`badge badge-${task.status === '完了' ? 'done' : task.status === '進行中' ? 'active' : 'pending'}`}>
                                        {task.status}
                                    </span>
                                    {isOverdue(task) && <span className="overdue-icon">!</span>}
                                </div>
                                <div className="task-table-card-date">
                                    {task.dueDate || '-'}
                                </div>
                                <div className="task-table-card-actions">
                                    {task.status !== '完了' && (
                                        <Button
                                            size="sm"
                                            variant="success"
                                            onClick={() => changeStatus(task, '完了')}
                                            disabled={!checklistComplete}
                                        >完了</Button>
                                    )}
                                    <Button size="sm" variant="secondary" onClick={() => goToTaskDetail(task.id)}>詳細</Button>
                                </div>
                            </div>
                        );
                    })}
                    {tasks.length === 0 && (
                        <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                            <div className="empty-state-icon">✅</div>
                            <div className="empty-state-text">タスクがありません</div>
                        </div>
                    )}
                </div>
            )}

            {/* 新規・編集モーダル */}
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingTask ? 'タスク編集' : '新規タスク'} size="lg">
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

                    {/* 事業選択時にマニュアル・チェックリスト選択を表示 */}
                    {selectedBusinessId && (
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
                    )}

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
            </>
            )}

            {/* 繰り返しタスクタブ */}
            {activeTab === 'recurring' && (
            <>
            <div className="page-header">
                <h3>繰り返しタスク</h3>
                <div className="btn-group">
                    <select
                        value={filterRecurringActive}
                        onChange={e => setFilterRecurringActive(e.target.value as 'all' | 'active' | 'inactive')}
                    >
                        <option value="all">全て</option>
                        <option value="active">有効のみ</option>
                        <option value="inactive">無効のみ</option>
                    </select>
                    <select
                        value={filterRecurringBusiness === 'all' ? 'all' : filterRecurringBusiness}
                        onChange={e => setFilterRecurringBusiness(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    >
                        <option value="all">全事業</option>
                        {db.businesses.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <Button onClick={openRecurringCreateModal}>+ 新規作成</Button>
                </div>
            </div>

            {recurringTemplates.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">🔁</div>
                    <div className="empty-state-text">繰り返しタスクがありません</div>
                    <Button onClick={openRecurringCreateModal} style={{ marginTop: 16 }}>最初の繰り返しタスクを作成</Button>
                </div>
            ) : (
                <div className="recurring-grid">
                    {recurringTemplates.map(template => {
                        const business = template.businessId ? db.businesses.find(b => b.id === template.businessId) : null;
                        const assignee = template.assigneeId ? db.users.find(u => u.id === template.assigneeId) : null;

                        return (
                            <div key={template.id} className="recurring-card">
                                <div className="recurring-card-header">
                                    <h3 className="recurring-title">{template.title}</h3>
                                    <span className={`badge ${template.isActive ? 'badge-active' : 'badge-secondary'}`}>
                                        {template.isActive ? '有効' : '無効'}
                                    </span>
                                </div>

                                <div className="recurring-pattern">
                                    {formatPatternLabel(template)}
                                </div>

                                <div className="recurring-meta">
                                    {business && <span className="recurring-meta-item">🏢 {business.name}</span>}
                                    {assignee && <span className="recurring-meta-item">👤 {assignee.name}</span>}
                                    {template.priority && (
                                        <span className="recurring-meta-item">
                                            優先度: {template.priority === 'high' ? '高' : template.priority === 'low' ? '低' : '中'}
                                        </span>
                                    )}
                                </div>

                                <div className="recurring-meta">
                                    <span className="recurring-meta-item">
                                        開始: {template.startDate}
                                    </span>
                                    {template.endDate && (
                                        <span className="recurring-meta-item">
                                            終了: {template.endDate}
                                        </span>
                                    )}
                                </div>

                                {template.lastGeneratedDate && (
                                    <div className="recurring-meta">
                                        最終生成: {template.lastGeneratedDate}
                                    </div>
                                )}

                                <div className="recurring-actions">
                                    <Button size="sm" variant="ghost" onClick={() => openRecurringEditModal(template)}>
                                        編集
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={template.isActive ? 'secondary' : 'primary'}
                                        onClick={() => toggleRecurringActive(template)}
                                    >
                                        {template.isActive ? '無効化' : '有効化'}
                                    </Button>
                                    <Button size="sm" variant="danger" onClick={() => deleteRecurringTemplate(template)}>
                                        削除
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 繰り返しタスク作成・編集モーダル */}
            <Modal
                isOpen={recurringModalOpen}
                onClose={() => setRecurringModalOpen(false)}
                title={editingTemplate ? '繰り返しタスクを編集' : '繰り返しタスクを作成'}
            >
                <form onSubmit={saveRecurringTemplate}>
                    <div className="form-group">
                        <label>タイトル</label>
                        <input
                            name="title"
                            defaultValue={editingTemplate?.title}
                            placeholder="タスクのタイトル"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>説明</label>
                        <textarea
                            name="description"
                            defaultValue={editingTemplate?.description}
                            placeholder="タスクの説明（任意）"
                            rows={3}
                        />
                    </div>

                    <div className="form-section-title">繰り返し設定</div>

                    <div className="form-group">
                        <label>パターン</label>
                        <select
                            value={pattern}
                            onChange={e => setPattern(e.target.value as RecurrencePattern)}
                        >
                            {Object.entries(patternLabels).map(([key, label]) => (
                                <option key={key} value={key}>{label}</option>
                            ))}
                        </select>
                    </div>

                    {pattern === 'weekly' && (
                        <div className="form-group">
                            <label>曜日</label>
                            <select
                                value={dayOfWeek}
                                onChange={e => setDayOfWeek(Number(e.target.value))}
                            >
                                {dayOfWeekLabels.map((label, idx) => (
                                    <option key={idx} value={idx}>{label}曜日</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {pattern === 'monthly' && (
                        <div className="form-group">
                            <label>日付</label>
                            <select
                                value={dayOfMonth}
                                onChange={e => setDayOfMonth(Number(e.target.value))}
                            >
                                {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                                    <option key={day} value={day}>{day}日</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="form-group">
                        <label>開始日</label>
                        <input
                            type="date"
                            name="startDate"
                            defaultValue={editingTemplate?.startDate || new Date().toISOString().split('T')[0]}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>終了日（任意）</label>
                        <input
                            type="date"
                            name="endDate"
                            defaultValue={editingTemplate?.endDate}
                        />
                    </div>

                    <div className="form-section-title">タスク設定</div>

                    <div className="form-group">
                        <label>事業</label>
                        <select
                            value={recurringBusinessId || ''}
                            onChange={e => setRecurringBusinessId(e.target.value ? Number(e.target.value) : undefined)}
                        >
                            <option value="">未設定</option>
                            {db.businesses.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>担当者</label>
                        <select name="assigneeId" defaultValue={editingTemplate?.assigneeId || ''}>
                            <option value="">未設定</option>
                            {db.users.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>優先度</label>
                        <select name="priority" defaultValue={editingTemplate?.priority || 'medium'}>
                            <option value="high">高</option>
                            <option value="medium">中</option>
                            <option value="low">低</option>
                        </select>
                    </div>

                    {recurringBusinessId && (
                        <div className="form-group">
                            <label>チェックリスト（任意）</label>
                            <select name="checklistId" defaultValue={editingTemplate?.attachedChecklistId || ''}>
                                <option value="">なし</option>
                                {getRecurringChecklists().map(c => (
                                    <option key={c.id} value={c.id}>{c.title}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div style={{ marginTop: 20 }}>
                        <Button type="submit" block>
                            {editingTemplate ? '更新' : '作成'}
                        </Button>
                    </div>
                </form>
            </Modal>
            </>
            )}
        </AppLayout>
    );
}

export default function TasksPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <TasksContent />;
}

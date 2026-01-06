'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { RecurringTaskTemplate, RecurrencePattern } from '@/types';
import { formatPatternLabel, patternLabels, dayOfWeekLabels } from '@/lib/recurringTaskGenerator';

function RecurringTasksContent() {
    const { db, updateCollection } = useDatabase();
    const { user } = useAuth();
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<RecurringTaskTemplate | null>(null);
    const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
    const [filterBusiness, setFilterBusiness] = useState<number | 'all'>('all');

    // フォーム状態
    const [pattern, setPattern] = useState<RecurrencePattern>('daily');
    const [dayOfWeek, setDayOfWeek] = useState(1); // 月曜日
    const [dayOfMonth, setDayOfMonth] = useState(1);
    const [selectedBusinessId, setSelectedBusinessId] = useState<number | undefined>(undefined);

    if (!db) return <div>Loading...</div>;

    // テンプレート一覧
    let templates = db.recurringTaskTemplates || [];

    // フィルター適用
    if (filterActive === 'active') {
        templates = templates.filter(t => t.isActive);
    } else if (filterActive === 'inactive') {
        templates = templates.filter(t => !t.isActive);
    }

    if (filterBusiness !== 'all') {
        templates = templates.filter(t => t.businessId === filterBusiness);
    }

    // 新規作成モーダルを開く
    const openCreateModal = () => {
        setEditingTemplate(null);
        setPattern('daily');
        setDayOfWeek(1);
        setDayOfMonth(1);
        setSelectedBusinessId(undefined);
        setModalOpen(true);
    };

    // 編集モーダルを開く
    const openEditModal = (template: RecurringTaskTemplate) => {
        setEditingTemplate(template);
        setPattern(template.pattern);
        setDayOfWeek(template.dayOfWeek || 1);
        setDayOfMonth(template.dayOfMonth || 1);
        setSelectedBusinessId(template.businessId);
        setModalOpen(true);
    };

    // 保存
    const saveTemplate = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const templateData: Partial<RecurringTaskTemplate> = {
            title: formData.get('title') as string,
            description: (formData.get('description') as string) || undefined,
            businessId: selectedBusinessId,
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
            // 更新
            updateCollection('recurringTaskTemplates', templates =>
                templates.map(t => t.id === editingTemplate.id ? {
                    ...t,
                    ...templateData,
                    updatedAt: new Date().toISOString()
                } : t)
            );
        } else {
            // 新規作成
            const newId = genId(db.recurringTaskTemplates);
            const newTemplate: RecurringTaskTemplate = {
                ...templateData as Omit<RecurringTaskTemplate, 'id' | 'createdAt'>,
                id: newId,
                createdAt: new Date().toISOString(),
            } as RecurringTaskTemplate;
            updateCollection('recurringTaskTemplates', templates => [...templates, newTemplate]);
        }

        setModalOpen(false);
    };

    // 有効/無効切替
    const toggleActive = (template: RecurringTaskTemplate) => {
        updateCollection('recurringTaskTemplates', templates =>
            templates.map(t => t.id === template.id ? {
                ...t,
                isActive: !t.isActive,
                updatedAt: new Date().toISOString()
            } : t)
        );
    };

    // 削除
    const deleteTemplate = (template: RecurringTaskTemplate) => {
        if (confirm(`「${template.title}」を削除しますか？`)) {
            updateCollection('recurringTaskTemplates', templates =>
                templates.filter(t => t.id !== template.id)
            );
        }
    };

    // 事業選択用チェックリスト取得
    const getChecklists = () => {
        if (!selectedBusinessId) return [];
        return db.checklists.filter(c => c.businessId === selectedBusinessId && !c.isArchived);
    };

    return (
        <AppLayout title="繰り返しタスク">
            <style jsx>{`
                .recurring-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    gap: 12px;
                }
                .recurring-filters {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                .template-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 16px;
                }
                .template-card {
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    padding: 16px;
                }
                .template-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 12px;
                }
                .template-title {
                    font-size: 16px;
                    font-weight: 600;
                    margin: 0;
                }
                .template-badges {
                    display: flex;
                    gap: 6px;
                }
                .template-meta {
                    font-size: 14px;
                    color: var(--text-secondary);
                    margin-bottom: 12px;
                }
                .template-meta-item {
                    margin-right: 12px;
                }
                .template-pattern {
                    display: inline-block;
                    background: var(--accent-primary);
                    color: white;
                    padding: 4px 10px;
                    border-radius: 12px;
                    font-size: 13px;
                    margin-bottom: 12px;
                }
                .template-actions {
                    display: flex;
                    gap: 8px;
                    padding-top: 12px;
                    border-top: 1px solid var(--border-color);
                }
                .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    color: var(--text-secondary);
                }
                .pattern-selector {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .pattern-option-row {
                    display: flex;
                    gap: 12px;
                    align-items: center;
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
                    .template-grid {
                        grid-template-columns: 1fr;
                    }
                    .recurring-header {
                        flex-direction: column;
                        align-items: stretch;
                    }
                }
            `}</style>

            {/* ヘッダー */}
            <div className="recurring-header">
                <div className="recurring-filters">
                    <select
                        value={filterActive}
                        onChange={e => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
                    >
                        <option value="all">全て</option>
                        <option value="active">有効のみ</option>
                        <option value="inactive">無効のみ</option>
                    </select>
                    <select
                        value={filterBusiness === 'all' ? 'all' : filterBusiness}
                        onChange={e => setFilterBusiness(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    >
                        <option value="all">全事業</option>
                        {db.businesses.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                </div>
                <Button onClick={openCreateModal}>+ 新規作成</Button>
            </div>

            {/* テンプレート一覧 */}
            {templates.length === 0 ? (
                <div className="empty-state">
                    <p>繰り返しタスクがありません</p>
                    <Button onClick={openCreateModal} style={{ marginTop: 16 }}>最初の繰り返しタスクを作成</Button>
                </div>
            ) : (
                <div className="template-grid">
                    {templates.map(template => {
                        const business = template.businessId ? db.businesses.find(b => b.id === template.businessId) : null;
                        const assignee = template.assigneeId ? db.users.find(u => u.id === template.assigneeId) : null;

                        return (
                            <div key={template.id} className="template-card">
                                <div className="template-card-header">
                                    <h3 className="template-title">{template.title}</h3>
                                    <div className="template-badges">
                                        <span className={`badge ${template.isActive ? 'badge-active' : 'badge-secondary'}`}>
                                            {template.isActive ? '有効' : '無効'}
                                        </span>
                                    </div>
                                </div>

                                <div className="template-pattern">
                                    {formatPatternLabel(template)}
                                </div>

                                <div className="template-meta">
                                    {business && <span className="template-meta-item">🏢 {business.name}</span>}
                                    {assignee && <span className="template-meta-item">👤 {assignee.name}</span>}
                                    {template.priority && (
                                        <span className="template-meta-item">
                                            優先度: {template.priority === 'high' ? '高' : template.priority === 'low' ? '低' : '中'}
                                        </span>
                                    )}
                                </div>

                                <div className="template-meta">
                                    <span className="template-meta-item">
                                        開始: {template.startDate}
                                    </span>
                                    {template.endDate && (
                                        <span className="template-meta-item">
                                            終了: {template.endDate}
                                        </span>
                                    )}
                                </div>

                                {template.lastGeneratedDate && (
                                    <div className="template-meta">
                                        最終生成: {template.lastGeneratedDate}
                                    </div>
                                )}

                                <div className="template-actions">
                                    <Button size="sm" variant="ghost" onClick={() => openEditModal(template)}>
                                        編集
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant={template.isActive ? 'secondary' : 'primary'}
                                        onClick={() => toggleActive(template)}
                                    >
                                        {template.isActive ? '無効化' : '有効化'}
                                    </Button>
                                    <Button size="sm" variant="danger" onClick={() => deleteTemplate(template)}>
                                        削除
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 作成・編集モーダル */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editingTemplate ? '繰り返しタスクを編集' : '繰り返しタスクを作成'}
            >
                <form onSubmit={saveTemplate}>
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
                            value={selectedBusinessId || ''}
                            onChange={e => setSelectedBusinessId(e.target.value ? Number(e.target.value) : undefined)}
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

                    {selectedBusinessId && (
                        <div className="form-group">
                            <label>チェックリスト（任意）</label>
                            <select name="checklistId" defaultValue={editingTemplate?.attachedChecklistId || ''}>
                                <option value="">なし</option>
                                {getChecklists().map(c => (
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
        </AppLayout>
    );
}

export default function RecurringTasksPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <RecurringTasksContent />;
}

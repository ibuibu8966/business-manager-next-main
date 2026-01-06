'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { BlockEditor, Block } from '@/components/editor/BlockEditor';
import { useDebouncedCallback } from 'use-debounce';

function ChecklistDetailContent() {
    const params = useParams();
    const router = useRouter();
    const { db, updateCollection } = useDatabase();
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const initialLoadDone = useRef(false);

    const businessId = Number(params.id);
    const checklistId = Number(params.checklistId);

    if (!db) return <div>Loading...</div>;

    const business = db.businesses.find(b => b.id === businessId);
    const checklist = db.checklists.find(c => c.id === checklistId && c.businessId === businessId);

    // デバウンスされた保存関数
    const debouncedSave = useDebouncedCallback((blocks: Block[]) => {
        setIsSaving(true);
        updateCollection('checklists', items =>
            items.map(c => c.id === checklistId ? {
                ...c,
                blocks: blocks,
                updatedAt: new Date().toISOString(),
            } : c)
        );
        setLastSaved(new Date());
        setTimeout(() => setIsSaving(false), 500);
    }, 1000);

    const handleEditorChange = useCallback((blocks: Block[]) => {
        // 初回ロード時は保存しない
        if (!initialLoadDone.current) {
            initialLoadDone.current = true;
            return;
        }
        debouncedSave(blocks);
    }, [debouncedSave]);

    if (!business || !checklist) {
        return (
            <AppLayout title="チェックリストが見つかりません">
                <div className="empty-state">
                    <div className="empty-state-icon">✅</div>
                    <div className="empty-state-text">チェックリストが見つかりません</div>
                    <Link href={`/businesses/${businessId}`}>
                        <Button>事業詳細へ戻る</Button>
                    </Link>
                </div>
            </AppLayout>
        );
    }

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        updateCollection('checklists', items =>
            items.map(c => c.id === checklistId ? {
                ...c,
                title: formData.get('title') as string,
                description: formData.get('description') as string || undefined,
                updatedAt: new Date().toISOString(),
            } : c)
        );
        setEditModalOpen(false);
    };

    const handleArchive = () => {
        const action = checklist.isArchived ? '復元' : 'アーカイブ';
        if (confirm(`このチェックリストを${action}しますか？`)) {
            updateCollection('checklists', items =>
                items.map(c => c.id === checklistId ? {
                    ...c,
                    isArchived: !c.isArchived,
                    updatedAt: new Date().toISOString(),
                } : c)
            );
        }
    };

    const handleDelete = () => {
        if (confirm('このチェックリストを削除しますか？この操作は取り消せません。')) {
            updateCollection('checklists', items => items.filter(c => c.id !== checklistId));
            router.push(`/businesses/${businessId}`);
        }
    };

    // 進捗を計算
    const checkboxBlocks = (checklist.blocks as Block[]).filter(b => b.type === 'checkbox');
    const checkedCount = checkboxBlocks.filter(b => b.checked).length;
    const totalCount = checkboxBlocks.length;
    const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

    return (
        <AppLayout title={checklist.title}>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href={`/businesses/${businessId}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                        ← 戻る
                    </Link>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>✅</span>
                        {checklist.title}
                        {checklist.isArchived && (
                            <span style={{ fontSize: '14px', color: 'var(--warning)', fontWeight: 'normal' }}>
                                （アーカイブ済み）
                            </span>
                        )}
                    </h3>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {isSaving ? (
                        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>保存中...</span>
                    ) : lastSaved ? (
                        <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                            保存済み {lastSaved.toLocaleTimeString('ja-JP')}
                        </span>
                    ) : null}
                    <Button onClick={() => setEditModalOpen(true)} variant="secondary">
                        編集
                    </Button>
                    <Button onClick={handleArchive} variant="ghost">
                        {checklist.isArchived ? '復元' : 'アーカイブ'}
                    </Button>
                    <Button onClick={handleDelete} variant="danger">
                        削除
                    </Button>
                </div>
            </div>

            {/* メタ情報 */}
            <div style={{ marginBottom: '24px' }}>
                {checklist.description && (
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        {checklist.description}
                    </p>
                )}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {totalCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '100px',
                                height: '8px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${progressPercent}%`,
                                    height: '100%',
                                    background: progressPercent === 100 ? 'var(--success)' : 'var(--accent-primary)',
                                    transition: 'width 0.3s ease'
                                }} />
                            </div>
                            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                                {checkedCount}/{totalCount} ({progressPercent}%)
                            </span>
                        </div>
                    )}
                    <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                        更新: {checklist.updatedAt
                            ? new Date(checklist.updatedAt).toLocaleString('ja-JP')
                            : new Date(checklist.createdAt).toLocaleString('ja-JP')
                        }
                    </span>
                </div>
            </div>

            {/* ブロックエディタ */}
            <div style={{
                background: 'var(--bg-card)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                padding: '24px',
                minHeight: '400px'
            }}>
                <BlockEditor
                    initialValue={checklist.blocks as Block[]}
                    onChange={handleEditorChange}
                    readOnly={checklist.isArchived}
                />
            </div>

            {/* 編集モーダル */}
            <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="チェックリスト編集">
                <form onSubmit={handleSave}>
                    <div className="form-group">
                        <label>タイトル</label>
                        <input name="title" defaultValue={checklist.title} required />
                    </div>
                    <div className="form-group">
                        <label>説明（任意）</label>
                        <textarea name="description" defaultValue={checklist.description} rows={3} />
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

export default function ChecklistDetailPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <ChecklistDetailContent />;
}

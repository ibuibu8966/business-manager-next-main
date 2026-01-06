'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Business, Manual, Checklist } from '@/types';

type TabType = 'manuals' | 'checklists';

function BusinessDetailContent() {
    const params = useParams();
    const router = useRouter();
    const { db, updateCollection } = useDatabase();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('manuals');
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [manualModalOpen, setManualModalOpen] = useState(false);
    const [checklistModalOpen, setChecklistModalOpen] = useState(false);
    const [showArchived, setShowArchived] = useState(false);

    const businessId = Number(params.id);

    if (!db) return <div>Loading...</div>;

    const business = db.businesses.find(b => b.id === businessId);

    if (!business) {
        return (
            <AppLayout title="事業が見つかりません">
                <div className="empty-state">
                    <div className="empty-state-icon">🏢</div>
                    <div className="empty-state-text">事業が見つかりません</div>
                    <Link href="/businesses">
                        <Button>事業一覧へ戻る</Button>
                    </Link>
                </div>
            </AppLayout>
        );
    }

    const manuals = db.manuals.filter(m =>
        m.businessId === businessId && (showArchived || !m.isArchived)
    );
    const checklists = db.checklists.filter(c =>
        c.businessId === businessId && (showArchived || !c.isArchived)
    );

    const saveBusiness = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        updateCollection('businesses', items =>
            items.map(b => b.id === businessId ? {
                ...b,
                name: formData.get('name') as string,
                description: formData.get('description') as string,
            } : b)
        );
        setEditModalOpen(false);
    };

    const createManual = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const type = formData.get('type') as 'pdf' | 'url';

        const newManual: Manual = {
            id: genId(db.manuals),
            businessId,
            name: formData.get('name') as string,
            type,
            content: type === 'url' ? formData.get('url') as string : undefined,
            description: formData.get('description') as string || undefined,
            createdAt: new Date().toISOString(),
        };

        updateCollection('manuals', items => [...items, newManual]);
        setManualModalOpen(false);
    };

    const createChecklist = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const newChecklist: Checklist = {
            id: genId(db.checklists),
            businessId,
            title: formData.get('title') as string,
            description: formData.get('description') as string || undefined,
            blocks: [{ id: '1', type: 'paragraph', children: [{ text: '' }] }],
            createdAt: new Date().toISOString(),
        };

        updateCollection('checklists', items => [...items, newChecklist]);
        setChecklistModalOpen(false);
        router.push(`/businesses/${businessId}/checklists/${newChecklist.id}`);
    };

    return (
        <AppLayout title={business.name}>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href="/businesses" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                        ← 戻る
                    </Link>
                    <h3>{business.name}</h3>
                </div>
                <Button onClick={() => setEditModalOpen(true)} variant="secondary">
                    編集
                </Button>
            </div>

            {business.description && (
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                    {business.description}
                </p>
            )}

            {/* タブ */}
            <div className="tabs" style={{ marginBottom: '24px' }}>
                <button
                    className={`tab ${activeTab === 'manuals' ? 'active' : ''}`}
                    onClick={() => setActiveTab('manuals')}
                >
                    マニュアル ({manuals.length})
                </button>
                <button
                    className={`tab ${activeTab === 'checklists' ? 'active' : ''}`}
                    onClick={() => setActiveTab('checklists')}
                >
                    チェックリスト ({checklists.length})
                </button>
            </div>

            {/* アーカイブ表示切替 */}
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={showArchived}
                        onChange={e => setShowArchived(e.target.checked)}
                    />
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        アーカイブ済みを表示
                    </span>
                </label>
                {activeTab === 'manuals' ? (
                    <Button onClick={() => setManualModalOpen(true)}>+ マニュアル追加</Button>
                ) : (
                    <Button onClick={() => setChecklistModalOpen(true)}>+ チェックリスト追加</Button>
                )}
            </div>

            {/* マニュアル一覧 */}
            {activeTab === 'manuals' && (
                <div className="accounts-grid">
                    {manuals.map(manual => (
                        <Link key={manual.id} href={`/businesses/${businessId}/manuals/${manual.id}`}>
                            <div className={`account-card ${manual.isArchived ? 'archived' : ''}`}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '24px' }}>
                                        {manual.type === 'pdf' ? '📄' : '🔗'}
                                    </span>
                                    <h4 style={{ margin: 0 }}>{manual.name}</h4>
                                </div>
                                {manual.description && (
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                                        {manual.description}
                                    </p>
                                )}
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                    {manual.type === 'pdf' ? 'PDF' : 'URL'} • {new Date(manual.createdAt).toLocaleDateString('ja-JP')}
                                    {manual.isArchived && <span style={{ marginLeft: '8px', color: 'var(--warning)' }}>アーカイブ済み</span>}
                                </div>
                            </div>
                        </Link>
                    ))}
                    {manuals.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">📚</div>
                            <div className="empty-state-text">マニュアルがありません</div>
                        </div>
                    )}
                </div>
            )}

            {/* チェックリスト一覧 */}
            {activeTab === 'checklists' && (
                <div className="accounts-grid">
                    {checklists.map(checklist => {
                        const checkboxBlocks = checklist.blocks.filter(b => b.type === 'checkbox');
                        const checkedCount = checkboxBlocks.filter(b => b.checked).length;
                        const totalCount = checkboxBlocks.length;

                        return (
                            <Link key={checklist.id} href={`/businesses/${businessId}/checklists/${checklist.id}`}>
                                <div className={`account-card ${checklist.isArchived ? 'archived' : ''}`}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <span style={{ fontSize: '24px' }}>✅</span>
                                        <h4 style={{ margin: 0 }}>{checklist.title}</h4>
                                    </div>
                                    {checklist.description && (
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>
                                            {checklist.description}
                                        </p>
                                    )}
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                        {totalCount > 0 && (
                                            <span style={{ marginRight: '12px' }}>
                                                {checkedCount}/{totalCount} 完了
                                            </span>
                                        )}
                                        {checklist.updatedAt
                                            ? `更新: ${new Date(checklist.updatedAt).toLocaleDateString('ja-JP')}`
                                            : new Date(checklist.createdAt).toLocaleDateString('ja-JP')
                                        }
                                        {checklist.isArchived && <span style={{ marginLeft: '8px', color: 'var(--warning)' }}>アーカイブ済み</span>}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                    {checklists.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">✅</div>
                            <div className="empty-state-text">チェックリストがありません</div>
                        </div>
                    )}
                </div>
            )}

            {/* 事業編集モーダル */}
            <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="事業編集">
                <form onSubmit={saveBusiness}>
                    <div className="form-group">
                        <label>事業名</label>
                        <input name="name" defaultValue={business.name} required />
                    </div>
                    <div className="form-group">
                        <label>説明</label>
                        <textarea name="description" defaultValue={business.description} rows={3} />
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* マニュアル追加モーダル */}
            <Modal isOpen={manualModalOpen} onClose={() => setManualModalOpen(false)} title="マニュアル追加">
                <form onSubmit={createManual}>
                    <div className="form-group">
                        <label>名前</label>
                        <input name="name" required placeholder="マニュアル名を入力" />
                    </div>
                    <div className="form-group">
                        <label>説明（任意）</label>
                        <textarea name="description" rows={2} placeholder="説明を入力" />
                    </div>
                    <div className="form-group">
                        <label>タイプ</label>
                        <select name="type" defaultValue="url">
                            <option value="url">URL</option>
                            <option value="pdf">PDF（後でアップロード）</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>URL</label>
                        <input name="url" type="url" placeholder="https://..." />
                    </div>
                    <Button type="submit" block>作成</Button>
                </form>
            </Modal>

            {/* チェックリスト追加モーダル */}
            <Modal isOpen={checklistModalOpen} onClose={() => setChecklistModalOpen(false)} title="チェックリスト追加">
                <form onSubmit={createChecklist}>
                    <div className="form-group">
                        <label>タイトル</label>
                        <input name="title" required placeholder="チェックリストのタイトル" />
                    </div>
                    <div className="form-group">
                        <label>説明（任意）</label>
                        <textarea name="description" rows={2} placeholder="説明を入力" />
                    </div>
                    <Button type="submit" block>作成して編集</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

export default function BusinessDetailPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <BusinessDetailContent />;
}

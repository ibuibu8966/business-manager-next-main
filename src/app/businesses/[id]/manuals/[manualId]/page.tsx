'use client';

import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

function ManualDetailContent() {
    const params = useParams();
    const router = useRouter();
    const { db, updateCollection } = useDatabase();
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [fullscreenPreview, setFullscreenPreview] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const businessId = Number(params.id);
    const manualId = Number(params.manualId);

    if (!db) return <div>Loading...</div>;

    const business = db.businesses.find(b => b.id === businessId);
    const manual = db.manuals.find(m => m.id === manualId && m.businessId === businessId);

    if (!business || !manual) {
        return (
            <AppLayout title="マニュアルが見つかりません">
                <div className="empty-state">
                    <div className="empty-state-icon">📚</div>
                    <div className="empty-state-text">マニュアルが見つかりません</div>
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

        updateCollection('manuals', items =>
            items.map(m => m.id === manualId ? {
                ...m,
                name: formData.get('name') as string,
                description: formData.get('description') as string || undefined,
                content: manual.type === 'url' ? formData.get('url') as string : m.content,
                updatedAt: new Date().toISOString(),
            } : m)
        );
        setEditModalOpen(false);
    };

    const handleArchive = () => {
        const action = manual.isArchived ? '復元' : 'アーカイブ';
        if (confirm(`このマニュアルを${action}しますか？`)) {
            updateCollection('manuals', items =>
                items.map(m => m.id === manualId ? {
                    ...m,
                    isArchived: !m.isArchived,
                    updatedAt: new Date().toISOString(),
                } : m)
            );
        }
    };

    const handleDelete = () => {
        if (confirm('このマニュアルを削除しますか？この操作は取り消せません。')) {
            updateCollection('manuals', items => items.filter(m => m.id !== manualId));
            router.push(`/businesses/${businessId}`);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 20MB制限チェック
        if (file.size > 20 * 1024 * 1024) {
            alert('ファイルサイズは20MB以下にしてください');
            return;
        }

        if (file.type !== 'application/pdf') {
            alert('PDFファイルのみアップロード可能です');
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('businessId', businessId.toString());
            formData.append('manualId', manualId.toString());

            const response = await fetch('/api/manuals/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();

            updateCollection('manuals', items =>
                items.map(m => m.id === manualId ? {
                    ...m,
                    fileUrl: data.fileUrl,
                    filePath: data.filePath,
                    fileName: file.name,
                    fileSize: file.size,
                    updatedAt: new Date().toISOString(),
                } : m)
            );

            alert('アップロードが完了しました');
        } catch (error) {
            console.error('Upload error:', error);
            alert('アップロードに失敗しました');
        } finally {
            setUploading(false);
        }
    };

    const openInNewTab = () => {
        const url = manual.type === 'pdf' ? manual.fileUrl : manual.content;
        if (url) {
            window.open(url, '_blank');
        }
    };

    const previewUrl = manual.type === 'pdf' ? manual.fileUrl : manual.content;

    return (
        <AppLayout title={manual.name}>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Link href={`/businesses/${businessId}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                        ← 戻る
                    </Link>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{manual.type === 'pdf' ? '📄' : '🔗'}</span>
                        {manual.name}
                        {manual.isArchived && (
                            <span style={{ fontSize: '14px', color: 'var(--warning)', fontWeight: 'normal' }}>
                                （アーカイブ済み）
                            </span>
                        )}
                    </h3>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button onClick={() => setEditModalOpen(true)} variant="secondary">
                        編集
                    </Button>
                    <Button onClick={handleArchive} variant="ghost">
                        {manual.isArchived ? '復元' : 'アーカイブ'}
                    </Button>
                    <Button onClick={handleDelete} variant="danger">
                        削除
                    </Button>
                </div>
            </div>

            {/* メタ情報 */}
            <div style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
                {manual.description && (
                    <p style={{ marginBottom: '12px' }}>{manual.description}</p>
                )}
                <div style={{ fontSize: '14px', color: 'var(--text-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span>タイプ: {manual.type === 'pdf' ? 'PDF' : 'URL'}</span>
                    {manual.fileName && <span>ファイル名: {manual.fileName}</span>}
                    {manual.fileSize && <span>サイズ: {(manual.fileSize / 1024 / 1024).toFixed(2)} MB</span>}
                    <span>作成日: {new Date(manual.createdAt).toLocaleDateString('ja-JP')}</span>
                    {manual.updatedAt && (
                        <span>更新日: {new Date(manual.updatedAt).toLocaleDateString('ja-JP')}</span>
                    )}
                </div>
            </div>

            {/* PDFアップロード */}
            {manual.type === 'pdf' && !manual.fileUrl && (
                <div style={{
                    padding: '32px',
                    border: '2px dashed var(--border-color)',
                    borderRadius: '12px',
                    textAlign: 'center',
                    marginBottom: '24px'
                }}>
                    <p style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                        PDFファイルをアップロードしてください（最大20MB）
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                    />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        {uploading ? 'アップロード中...' : 'PDFを選択'}
                    </Button>
                </div>
            )}

            {/* プレビューエリア */}
            {previewUrl && (
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0 }}>プレビュー</h4>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <Button onClick={() => setFullscreenPreview(true)} variant="secondary" size="sm">
                                最大化
                            </Button>
                            <Button onClick={openInNewTab} variant="secondary" size="sm">
                                {manual.type === 'pdf' ? '新規タブで開く' : 'サイトを開く'}
                            </Button>
                        </div>
                    </div>
                    <div style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        height: '600px'
                    }}>
                        <iframe
                            src={previewUrl}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title={manual.name}
                        />
                    </div>
                </div>
            )}

            {/* PDFアップロード済みの場合の差し替えボタン */}
            {manual.type === 'pdf' && manual.fileUrl && (
                <div style={{ marginTop: '16px' }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                    />
                    <Button onClick={() => fileInputRef.current?.click()} variant="ghost" size="sm" disabled={uploading}>
                        {uploading ? 'アップロード中...' : 'PDFを差し替え'}
                    </Button>
                </div>
            )}

            {/* 編集モーダル */}
            <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="マニュアル編集">
                <form onSubmit={handleSave}>
                    <div className="form-group">
                        <label>名前</label>
                        <input name="name" defaultValue={manual.name} required />
                    </div>
                    <div className="form-group">
                        <label>説明（任意）</label>
                        <textarea name="description" defaultValue={manual.description} rows={3} />
                    </div>
                    {manual.type === 'url' && (
                        <div className="form-group">
                            <label>URL</label>
                            <input name="url" type="url" defaultValue={manual.content} required />
                        </div>
                    )}
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* フルスクリーンプレビュー */}
            <Modal
                isOpen={fullscreenPreview}
                onClose={() => setFullscreenPreview(false)}
                title={manual.name}
                size="lg"
            >
                <div style={{ height: 'calc(90vh - 120px)' }}>
                    {previewUrl && (
                        <iframe
                            src={previewUrl}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title={manual.name}
                        />
                    )}
                </div>
            </Modal>
        </AppLayout>
    );
}

export default function ManualDetailPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <ManualDetailContent />;
}

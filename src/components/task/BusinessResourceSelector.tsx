'use client';

import { useDatabase } from '@/lib/db';
import { ChecklistBlock } from '@/types';

interface BusinessResourceSelectorProps {
    businessId: number;
    selectedManualId?: number;
    selectedChecklistId?: number;
    onManualSelect: (manualId: number | undefined) => void;
    onChecklistSelect: (checklistId: number | undefined, blocks?: ChecklistBlock[]) => void;
}

export function BusinessResourceSelector({
    businessId,
    selectedManualId,
    selectedChecklistId,
    onManualSelect,
    onChecklistSelect,
}: BusinessResourceSelectorProps) {
    const { db } = useDatabase();

    if (!db) return null;

    // 事業に紐づくマニュアルとチェックリストを取得
    const manuals = db.manuals.filter(m => m.businessId === businessId && !m.isArchived);
    const checklists = db.checklists.filter(c => c.businessId === businessId && !c.isArchived);

    // チェックリスト選択時にブロックをディープコピー
    const handleChecklistChange = (checklistId: number | undefined) => {
        if (checklistId) {
            const checklist = db.checklists.find(c => c.id === checklistId);
            if (checklist) {
                // ブロックをディープコピー
                const copiedBlocks = JSON.parse(JSON.stringify(checklist.blocks)) as ChecklistBlock[];
                onChecklistSelect(checklistId, copiedBlocks);
            }
        } else {
            onChecklistSelect(undefined, undefined);
        }
    };

    // チェックリストのチェックボックス数をカウント
    const getCheckboxCount = (blocks: ChecklistBlock[]): number => {
        return blocks.filter(b => b.type === 'checkbox').length;
    };

    return (
        <div className="business-resource-selector">
            <style jsx>{`
                .business-resource-selector {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    padding: 16px;
                    background: var(--bg-tertiary);
                    border-radius: 8px;
                    border: 1px solid var(--border-color);
                }
                .resource-section {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .resource-section-header {
                    font-size: 14px;
                    font-weight: 600;
                    color: var(--text-primary);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .resource-list {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .resource-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    background: var(--bg-card);
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .resource-item:hover {
                    border-color: var(--accent-primary);
                }
                .resource-item.selected {
                    border-color: var(--accent-primary);
                    background: rgba(99, 102, 241, 0.1);
                }
                .resource-item input[type="radio"] {
                    margin: 0;
                    cursor: pointer;
                }
                .resource-item-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .resource-item-name {
                    font-size: 14px;
                    color: var(--text-primary);
                }
                .resource-item-meta {
                    font-size: 12px;
                    color: var(--text-muted);
                }
                .empty-message {
                    font-size: 13px;
                    color: var(--text-muted);
                    padding: 8px 0;
                }
            `}</style>

            {/* マニュアル選択 */}
            <div className="resource-section">
                <div className="resource-section-header">
                    <span>マニュアルを添付（任意）</span>
                </div>
                <div className="resource-list">
                    <label className={`resource-item ${selectedManualId === undefined ? 'selected' : ''}`}>
                        <input
                            type="radio"
                            name="manual"
                            checked={selectedManualId === undefined}
                            onChange={() => onManualSelect(undefined)}
                        />
                        <span className="resource-item-name">なし</span>
                    </label>
                    {manuals.length > 0 ? (
                        manuals.map(manual => (
                            <label
                                key={manual.id}
                                className={`resource-item ${selectedManualId === manual.id ? 'selected' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="manual"
                                    checked={selectedManualId === manual.id}
                                    onChange={() => onManualSelect(manual.id)}
                                />
                                <div className="resource-item-content">
                                    <span className="resource-item-name">{manual.name}</span>
                                    <span className="resource-item-meta">
                                        {manual.type === 'pdf' ? 'PDF' : 'URL'}
                                        {manual.description && ` - ${manual.description}`}
                                    </span>
                                </div>
                            </label>
                        ))
                    ) : (
                        <div className="empty-message">この事業にはマニュアルがありません</div>
                    )}
                </div>
            </div>

            {/* チェックリスト選択 */}
            <div className="resource-section">
                <div className="resource-section-header">
                    <span>チェックリストを添付（任意）</span>
                </div>
                <div className="resource-list">
                    <label className={`resource-item ${selectedChecklistId === undefined ? 'selected' : ''}`}>
                        <input
                            type="radio"
                            name="checklist"
                            checked={selectedChecklistId === undefined}
                            onChange={() => handleChecklistChange(undefined)}
                        />
                        <span className="resource-item-name">なし</span>
                    </label>
                    {checklists.length > 0 ? (
                        checklists.map(checklist => (
                            <label
                                key={checklist.id}
                                className={`resource-item ${selectedChecklistId === checklist.id ? 'selected' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="checklist"
                                    checked={selectedChecklistId === checklist.id}
                                    onChange={() => handleChecklistChange(checklist.id)}
                                />
                                <div className="resource-item-content">
                                    <span className="resource-item-name">{checklist.title}</span>
                                    <span className="resource-item-meta">
                                        {getCheckboxCount(checklist.blocks as ChecklistBlock[])}項目
                                        {checklist.description && ` - ${checklist.description}`}
                                    </span>
                                </div>
                            </label>
                        ))
                    ) : (
                        <div className="empty-message">この事業にはチェックリストがありません</div>
                    )}
                </div>
            </div>
        </div>
    );
}

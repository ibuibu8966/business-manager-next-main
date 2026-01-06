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

    return (
        <div className="business-resource-selector">
            <style jsx>{`
                .business-resource-selector {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
            `}</style>

            {/* マニュアル選択 */}
            <div className="form-group">
                <label>マニュアルを添付（任意）</label>
                <select
                    value={selectedManualId || ''}
                    onChange={e => onManualSelect(e.target.value ? Number(e.target.value) : undefined)}
                >
                    <option value="">なし</option>
                    {manuals.map(manual => (
                        <option key={manual.id} value={manual.id}>{manual.name}</option>
                    ))}
                </select>
            </div>

            {/* チェックリスト選択 */}
            <div className="form-group">
                <label>チェックリストを添付（任意）</label>
                <select
                    value={selectedChecklistId || ''}
                    onChange={e => handleChecklistChange(e.target.value ? Number(e.target.value) : undefined)}
                >
                    <option value="">なし</option>
                    {checklists.map(checklist => (
                        <option key={checklist.id} value={checklist.id}>{checklist.title}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}

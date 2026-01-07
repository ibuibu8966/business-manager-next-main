/**
 * 貸借管理の操作関数
 * 編集・アーカイブ等の複雑なビジネスロジックを集約
 */

import { Lending, AccountTransaction, Account } from '@/types';
import { FieldChange } from '@/components/lending/TransactionEditModal';
import {
    calculateLendingBalanceChange,
    calculateTransactionBalanceChange,
    createTransferBalanceUpdater,
    createSingleAccountBalanceUpdater,
} from './balanceUpdates';

// UpdateCollectionFnは呼び出し側のupdateCollectionと互換性を持たせるため
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UpdateCollectionFn = <K extends string>(collection: K, updater: (items: any[]) => any[]) => Promise<any[]>;

type GenIdFn = (items: { id: number }[]) => number;

/**
 * 変更履歴の説明文を生成
 */
export function generateChangesDescription(changes: FieldChange[]): string {
    return changes.map(c =>
        `${c.displayName}を${c.oldValue || '(なし)'}→${c.newValue || '(なし)'}に変更`
    ).join('、');
}

/**
 * 貸借レコードの編集を保存
 */
export async function saveLendingEdit(
    db: { lendings: Lending[] },
    updateCollection: UpdateCollectionFn,
    genId: GenIdFn,
    userId: number | undefined,
    originalId: number,
    updates: Partial<Lending>,
    changes: FieldChange[]
): Promise<void> {
    if (changes.length === 0) return;

    const oldLending = db.lendings.find(l => l.id === originalId);
    if (!oldLending) return;

    const description = generateChangesDescription(changes);

    // 旧レコードの影響を取り消す（残高を戻す）
    if (!oldLending.returned) {
        const oldBalanceChange = calculateLendingBalanceChange(
            oldLending.type,
            oldLending.amount,
            true // reversing
        );
        await updateCollection('accounts', createSingleAccountBalanceUpdater(
            oldLending.accountId,
            oldBalanceChange
        ));
    }

    // 新しい値で残高を適用
    const newAccountId = updates.accountId || oldLending.accountId;
    const newType = updates.type || oldLending.type;
    const newAmount = updates.amount !== undefined ? updates.amount : oldLending.amount;

    if (!oldLending.returned) {
        const newBalanceChange = calculateLendingBalanceChange(newType, newAmount);
        await updateCollection('accounts', createSingleAccountBalanceUpdater(
            newAccountId,
            newBalanceChange
        ));
    }

    // レコードを更新
    await updateCollection('lendings', (items: Lending[]) =>
        items.map(l => l.id === originalId ? {
            ...l,
            ...updates,
            lastEditedByUserId: userId,
            lastEditedAt: new Date().toISOString()
        } : l)
    );

    // 履歴を記録
    await updateCollection('lendingHistories', (items: { id: number }[]) => [...items, {
        id: genId(items),
        lendingId: originalId,
        action: 'updated' as const,
        description,
        changes: JSON.stringify(changes),
        userId: userId || 1,
        createdAt: new Date().toISOString(),
    }]);
}

/**
 * 口座取引レコードの編集を保存
 */
export async function saveTransactionEdit(
    db: { accountTransactions: AccountTransaction[]; transactions?: { id: number }[] },
    updateCollection: UpdateCollectionFn,
    genId: GenIdFn,
    userId: number | undefined,
    originalId: number,
    updates: Partial<AccountTransaction>,
    changes: FieldChange[]
): Promise<void> {
    if (changes.length === 0) return;

    const oldTransaction = (db.accountTransactions || []).find(t => t.id === originalId);
    if (!oldTransaction) return;

    const description = generateChangesDescription(changes);

    // 旧レコードの影響を取り消す
    const oldAccountId = oldTransaction.accountId || oldTransaction.fromAccountId;
    if (oldAccountId) {
        if (oldTransaction.type === 'transfer') {
            await updateCollection('accounts', createTransferBalanceUpdater(
                oldTransaction.fromAccountId,
                oldTransaction.toAccountId,
                oldTransaction.amount,
                true // reversing
            ));
        } else {
            const balanceChange = calculateTransactionBalanceChange(
                oldTransaction.type,
                oldTransaction.amount,
                true // reversing
            );
            await updateCollection('accounts', createSingleAccountBalanceUpdater(
                oldAccountId,
                balanceChange
            ));
        }
    }

    // 新しい値で残高を適用
    const newType = updates.type || oldTransaction.type;
    const newAmount = updates.amount !== undefined ? updates.amount : oldTransaction.amount;

    if (newType === 'transfer') {
        const newFromId = updates.fromAccountId || oldTransaction.fromAccountId;
        const newToId = updates.toAccountId || oldTransaction.toAccountId;
        await updateCollection('accounts', createTransferBalanceUpdater(
            newFromId,
            newToId,
            newAmount
        ));
    } else {
        const newAccountId = updates.accountId || oldTransaction.accountId;
        const balanceChange = calculateTransactionBalanceChange(newType, newAmount);
        await updateCollection('accounts', createSingleAccountBalanceUpdater(
            newAccountId,
            balanceChange
        ));
    }

    // レコードを更新
    await updateCollection('accountTransactions', (items: AccountTransaction[]) =>
        items.map(t => t.id === originalId ? {
            ...t,
            ...updates,
            lastEditedByUserId: userId,
            lastEditedAt: new Date().toISOString()
        } : t)
    );

    // 履歴を記録
    await updateCollection('accountTransactionHistories', (items: { id: number }[]) => [...items, {
        id: genId(items),
        accountTransactionId: originalId,
        action: 'updated' as const,
        description,
        changes: JSON.stringify(changes),
        userId: userId || 1,
        createdAt: new Date().toISOString(),
    }]);

    // 管理会計連携: linkedTransactionIdがあればtransactionsも更新
    if (oldTransaction.linkedTransactionId && (oldTransaction.type === 'interest' || oldTransaction.type === 'investment_gain')) {
        const isLoss = newAmount < 0;
        const categoryName = oldTransaction.type === 'interest' ? '受取利息' : '運用損益';

        await updateCollection('transactions', (items: { id: number; type?: string; category?: string; amount?: number; date?: string; memo?: string }[]) =>
            items.map(t => t.id === oldTransaction.linkedTransactionId ? {
                ...t,
                type: isLoss ? 'expense' : 'income',
                category: categoryName,
                amount: Math.abs(newAmount),
                date: updates.date || oldTransaction.date,
                memo: updates.memo || oldTransaction.memo,
            } : t)
        );
    }
}

/**
 * 貸借レコードをアーカイブ
 * @param lending アーカイブ対象の貸借レコード
 * @param updateCollection DB更新関数
 * @param genId ID生成関数
 * @param userId 操作ユーザーID
 */
export async function archiveLending(
    lending: Lending,
    updateCollection: UpdateCollectionFn,
    genId: GenIdFn,
    userId: number | undefined
): Promise<void> {
    // 残高を戻す（未返済の場合のみ）
    if (!lending.returned) {
        const balanceChange = calculateLendingBalanceChange(
            lending.type,
            lending.amount,
            true // reversing
        );
        await updateCollection('accounts', createSingleAccountBalanceUpdater(
            lending.accountId,
            balanceChange
        ));
    }

    // アーカイブフラグを設定
    await updateCollection('lendings', (items: Lending[]) =>
        items.map(l => l.id === lending.id ? {
            ...l,
            isArchived: true,
            lastEditedByUserId: userId,
            lastEditedAt: new Date().toISOString()
        } : l)
    );

    // 履歴を記録
    await updateCollection('lendingHistories', (items: { id: number }[]) => [...items, {
        id: genId(items),
        lendingId: lending.id,
        action: 'archived' as const,
        description: 'アーカイブ',
        userId: userId || 1,
        createdAt: new Date().toISOString(),
    }]);
}

/**
 * 口座取引レコードをアーカイブ
 * @param transaction アーカイブ対象の取引レコード
 * @param updateCollection DB更新関数
 * @param genId ID生成関数
 * @param userId 操作ユーザーID
 */
export async function archiveAccountTransaction(
    transaction: AccountTransaction,
    updateCollection: UpdateCollectionFn,
    genId: GenIdFn,
    userId: number | undefined
): Promise<void> {
    // 残高を戻す
    const accountId = transaction.accountId || transaction.fromAccountId;
    if (accountId) {
        if (transaction.type === 'transfer') {
            await updateCollection('accounts', createTransferBalanceUpdater(
                transaction.fromAccountId,
                transaction.toAccountId,
                transaction.amount,
                true // reversing
            ));
        } else {
            const balanceChange = calculateTransactionBalanceChange(
                transaction.type,
                transaction.amount,
                true // reversing
            );
            await updateCollection('accounts', createSingleAccountBalanceUpdater(
                accountId,
                balanceChange
            ));
        }
    }

    // アーカイブフラグを設定
    await updateCollection('accountTransactions', (items: AccountTransaction[]) =>
        items.map(t => t.id === transaction.id ? {
            ...t,
            isArchived: true,
            lastEditedByUserId: userId,
            lastEditedAt: new Date().toISOString()
        } : t)
    );

    // 履歴を記録
    await updateCollection('accountTransactionHistories', (items: { id: number }[]) => [...items, {
        id: genId(items),
        accountTransactionId: transaction.id,
        action: 'archived' as const,
        description: 'アーカイブ',
        userId: userId || 1,
        createdAt: new Date().toISOString(),
    }]);

    // 管理会計連携: linkedTransactionIdがあればtransactionsも削除
    if (transaction.linkedTransactionId) {
        await updateCollection('transactions', (items: { id: number }[]) =>
            items.filter(t => t.id !== transaction.linkedTransactionId)
        );
    }
}

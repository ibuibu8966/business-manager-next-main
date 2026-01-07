/**
 * 履歴変換ユーティリティ
 * 貸借履歴と口座取引履歴を統合した履歴を作成
 */

import { Lending, AccountTransaction, PersonTransaction } from '@/types';

/**
 * 統合履歴アイテムの型定義
 */
export interface CombinedHistoryItem {
    id: string;
    date: string;
    type: string;
    displayType: string;
    amount: number;
    accountId?: number;
    toAccountId?: number;
    counterpartyType?: 'account' | 'person';
    counterpartyId?: number;
    memo?: string;
    returned?: boolean;
    source: 'lending' | 'transaction' | 'person-transaction';
    originalId: number;
    createdByUserId?: number;
    lastEditedByUserId?: number;
    lastEditedAt?: string;
}

/**
 * 取引タイプの表示名を取得
 */
function getTransactionDisplayType(type: AccountTransaction['type']): string {
    switch (type) {
        case 'transfer': return '振替';
        case 'interest': return '受取利息';
        case 'deposit': return '純入金';
        case 'withdrawal': return '純出金';
        case 'investment_gain': return '運用損益';
        default: return String(type);
    }
}

/**
 * 貸借履歴を統合履歴形式に変換
 */
function convertLendingToHistoryItem(l: Lending): CombinedHistoryItem {
    return {
        id: `lending-${l.id}`,
        date: l.date,
        type: l.type === 'return' ? 'return' : (l.amount > 0 ? 'lend' : 'borrow'),
        displayType: l.type === 'return' ? '返済' : (l.amount > 0 ? '貸し' : '借り'),
        amount: l.amount,
        accountId: l.accountId,
        counterpartyType: l.counterpartyType,
        counterpartyId: l.counterpartyId || l.personId,
        memo: l.memo,
        returned: l.returned,
        source: 'lending',
        originalId: l.id,
        createdByUserId: l.createdByUserId,
        lastEditedByUserId: l.lastEditedByUserId,
        lastEditedAt: l.lastEditedAt,
    };
}

/**
 * 口座取引を統合履歴形式に変換
 */
function convertTransactionToHistoryItem(t: AccountTransaction): CombinedHistoryItem {
    return {
        id: `transaction-${t.id}`,
        date: t.date,
        type: t.type,
        displayType: getTransactionDisplayType(t.type),
        amount: t.amount,
        accountId: t.type === 'transfer' ? t.fromAccountId : t.accountId,
        toAccountId: t.toAccountId,
        memo: t.memo,
        source: 'transaction',
        originalId: t.id,
        createdByUserId: t.createdByUserId,
        lastEditedByUserId: t.lastEditedByUserId,
        lastEditedAt: t.lastEditedAt,
    };
}

/**
 * 外部相手取引（純入出金）を統合履歴形式に変換
 */
function convertPersonTransactionToHistoryItem(t: PersonTransaction): CombinedHistoryItem {
    return {
        id: `person-transaction-${t.id}`,
        date: t.date,
        type: t.type,
        displayType: t.type === 'deposit' ? '純入金' : '純出金',
        amount: t.type === 'deposit' ? t.amount : -t.amount,
        counterpartyType: 'person',
        counterpartyId: t.personId,
        memo: t.memo,
        source: 'person-transaction',
        originalId: t.id,
    };
}

/**
 * 貸借履歴と口座取引履歴を統合した履歴を作成
 * @param lendings 貸借履歴（フィルタ済み）
 * @param transactions 口座取引履歴
 * @param personTransactions 外部相手取引（純入出金）
 * @param excludeArchived アーカイブ済みを除外するかどうか（デフォルト: true）
 * @returns 日付降順でソートされた統合履歴
 */
export function createCombinedHistory(
    lendings: Lending[],
    transactions: AccountTransaction[],
    personTransactions: PersonTransaction[] = [],
    excludeArchived = true
): CombinedHistoryItem[] {
    // 貸借履歴を変換
    const lendingItems = lendings
        .filter(l => !excludeArchived || !l.isArchived)
        .map(convertLendingToHistoryItem);

    // 口座取引履歴を変換
    const transactionItems = transactions
        .filter(t => !excludeArchived || !t.isArchived)
        .map(convertTransactionToHistoryItem);

    // 外部相手取引（純入出金）を変換
    const personTransactionItems = personTransactions
        .map(convertPersonTransactionToHistoryItem);

    // 統合してソート
    return [...lendingItems, ...transactionItems, ...personTransactionItems]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * 残高更新ユーティリティ
 * 各種取引における残高変動の計算ロジック
 */

import { Lending, AccountTransaction, Account } from '@/types';

/**
 * 貸借取引による残高変動を計算
 * @param type 取引タイプ（lend/borrow/return）
 * @param amount 金額
 * @param isReversing 取り消し処理かどうか（削除・編集時の巻き戻し）
 * @returns 残高変動額
 */
export function calculateLendingBalanceChange(
    type: 'lend' | 'borrow' | 'return',
    amount: number,
    isReversing = false
): number {
    // 新規作成時: borrow = +amount（借入でお金が入る）, lend = -amount（貸出でお金が出る）
    // 取り消し時: 逆の符号
    let change: number;
    if (type === 'borrow') {
        change = Math.abs(amount);
    } else if (type === 'lend') {
        change = -Math.abs(amount);
    } else {
        // return の場合は amount がすでに逆符号
        change = amount;
    }
    return isReversing ? -change : change;
}

/**
 * 貸借返済時の残高変動を計算
 * @param lending 元の貸借レコード
 * @returns 残高変動額
 */
export function calculateReturnBalanceChange(lending: Lending): number {
    // 貸出の返済: 残高 + amount（お金が戻ってくる）
    // 借入の返済: 残高 - |amount|（お金を返す）
    return lending.type === 'lend'
        ? Math.abs(lending.amount)
        : -Math.abs(lending.amount);
}

/**
 * 口座取引による残高変動を計算
 * @param type 取引タイプ
 * @param amount 金額
 * @param isReversing 取り消し処理かどうか
 * @returns 残高変動額
 */
export function calculateTransactionBalanceChange(
    type: AccountTransaction['type'],
    amount: number,
    isReversing = false
): number {
    let change: number;

    switch (type) {
        case 'interest':
        case 'investment_gain':
        case 'deposit':
            // 入金系: 残高が増える
            change = amount;
            break;
        case 'withdrawal':
            // 出金系: 残高が減る
            change = -amount;
            break;
        case 'transfer':
            // 振替は別処理
            change = 0;
            break;
        default:
            change = 0;
    }

    return isReversing ? -change : change;
}

/**
 * 振替取引による残高更新を生成
 * @param fromAccountId 振替元口座ID
 * @param toAccountId 振替先口座ID
 * @param amount 金額
 * @param isReversing 取り消し処理かどうか
 * @returns アカウント更新関数
 */
export function createTransferBalanceUpdater(
    fromAccountId: number | undefined,
    toAccountId: number | undefined,
    amount: number,
    isReversing = false
): (accounts: Account[]) => Account[] {
    const multiplier = isReversing ? -1 : 1;

    return (accounts: Account[]) =>
        accounts.map(a => {
            if (a.id === fromAccountId) {
                return { ...a, balance: (a.balance || 0) - amount * multiplier };
            }
            if (a.id === toAccountId) {
                return { ...a, balance: (a.balance || 0) + amount * multiplier };
            }
            return a;
        });
}

/**
 * 単一口座の残高更新を生成
 * @param accountId 口座ID
 * @param balanceChange 残高変動額
 * @returns アカウント更新関数
 */
export function createSingleAccountBalanceUpdater(
    accountId: number | undefined,
    balanceChange: number
): (accounts: Account[]) => Account[] {
    if (!accountId || balanceChange === 0) {
        return (accounts) => accounts;
    }

    return (accounts: Account[]) =>
        accounts.map(a =>
            a.id === accountId
                ? { ...a, balance: (a.balance || 0) + balanceChange }
                : a
        );
}

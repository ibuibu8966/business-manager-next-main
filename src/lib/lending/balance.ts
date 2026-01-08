/**
 * 残高計算ユーティリティ
 * 貸借管理における各種残高計算を行う純粋関数群
 */

import { Lending, PersonTransaction } from '@/types';

/**
 * 外部相手の貸借残高を計算（未返済分のみ）
 * @param lendings 全貸借データ
 * @param personId 対象の外部相手ID
 * @returns 正の値 = 貸し（相手が借りている）、負の値 = 借り（あなたが借りている）
 */
export function getPersonBalance(lendings: Lending[], personId: number): number {
    return lendings
        .filter(l =>
            !l.isArchived &&
            ((l.counterpartyType === 'person' && l.counterpartyId === personId) ||
             (!l.counterpartyType && l.personId === personId)) &&
            !l.returned
        )
        .reduce((sum, l) => sum + l.amount, 0);
}

/**
 * 外部相手の口座残高を計算（純入出金 + 貸借効果）
 * @param lendings 全貸借データ
 * @param personTransactions 全外部相手取引データ
 * @param personId 対象の外部相手ID
 * @returns 口座残高（正 = 相手に預けている、負 = 相手から借りている）
 */
export function getPersonAccountBalance(
    lendings: Lending[],
    personTransactions: PersonTransaction[],
    personId: number
): number {
    // 純入出金 - アーカイブ済みは除外
    const netFlowTotal = personTransactions
        .filter(t => !t.isArchived && t.personId === personId)
        .reduce((sum, t) => sum + (t.type === 'deposit' ? t.amount : -t.amount), 0);

    // 貸借（全履歴、returnレコードで相殺）- アーカイブ済みは除外
    const relatedLendings = lendings.filter(l =>
        !l.isArchived && (
            l.personId === personId ||
            (l.counterpartyType === 'person' && l.counterpartyId === personId)
        )
    );

    const lendingEffect = relatedLendings.reduce((sum, l) => {
        // lend = あなたが貸した = 相手が借りた = 相手の口座に+
        // borrow = あなたが借りた = 相手が貸した = 相手の口座から-
        // return = 元取引の逆符号（l.amount が既に逆符号で記録されている）
        if (l.type === 'lend') return sum + Math.abs(l.amount);
        if (l.type === 'borrow') return sum - Math.abs(l.amount);
        if (l.type === 'return') return sum + l.amount; // 逆符号なのでそのまま加算
        return sum;
    }, 0);

    return netFlowTotal + lendingEffect;
}

/**
 * 口座の貸借残高を計算（未返済のみ）
 * @param lendings 全貸借データ
 * @param accountId 対象の口座ID
 * @returns 正の値 = 貸出超過（資産）、負の値 = 借入超過（負債）
 */
export function getAccountBalance(lendings: Lending[], accountId: number): number {
    const relatedLendings = lendings.filter(l =>
        !l.isArchived &&
        (l.accountId === accountId ||
         (l.counterpartyType === 'account' && l.counterpartyId === accountId)) &&
        !l.returned
    );

    let balance = 0;
    relatedLendings.forEach(l => {
        if (l.accountId === accountId) {
            // この口座が主体の取引
            // lend（貸出）= 相手に貸している = 資産（+）
            // borrow（借入）= 相手から借りている = 負債（-）
            balance += l.type === 'lend' ? Math.abs(l.amount) : -Math.abs(l.amount);
        }
        if (l.counterpartyType === 'account' && l.counterpartyId === accountId) {
            // この口座が相手方の取引（口座間取引の場合）
            // 相手がlend = この口座はborrow（負債）
            // 相手がborrow = この口座はlend（資産）
            balance += l.type === 'lend' ? -Math.abs(l.amount) : Math.abs(l.amount);
        }
    });
    return balance;
}

/**
 * 複数の外部相手の貸借合計を計算
 * @param lendings 全貸借データ
 * @param persons 外部相手一覧
 * @returns { totalLent: 貸出合計, totalBorrowed: 借入合計 }
 */
export function calculatePersonTotals(
    lendings: Lending[],
    persons: { id: number }[]
): { totalLent: number; totalBorrowed: number } {
    let totalLent = 0;
    let totalBorrowed = 0;

    persons.forEach(p => {
        const balance = getPersonBalance(lendings, p.id);
        if (balance > 0) {
            totalLent += balance;
        } else {
            totalBorrowed += Math.abs(balance);
        }
    });

    return { totalLent, totalBorrowed };
}

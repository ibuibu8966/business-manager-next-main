// 月次貸借レポート データ集計ロジック

import { createClient } from '@supabase/supabase-js';
import { Lending, Account, Person, AccountTransaction } from '@/types';
import { toCamelCase } from '@/lib/supabase';

export interface MonthlyReportData {
    period: {
        year: number;
        month: number;
        startDate: string;
        endDate: string;
    };
    summary: {
        totalLent: number;      // 貸出合計
        totalBorrowed: number;  // 借入合計
        totalReturned: number;  // 返済合計
        netBalance: number;     // 差引残高
    };
    accountBalances: Array<{
        id: number;
        name: string;
        manualBalance?: number;
        lendingBalance: number;
    }>;
    personBalances: Array<{
        id: number;
        name: string;
        balance: number;
        status: '貸し' | '借り' | '精算済';
    }>;
    transactions: Array<{
        id: number;
        date: string;
        type: 'lend' | 'borrow' | 'return' | 'transfer' | 'interest' | 'investment_gain';
        displayType: string;
        amount: number;
        accountName: string;
        counterpartyName: string;
        memo?: string;
    }>;
    generatedAt: string;
}

/**
 * サーバーサイド用Supabaseクライアントを作成
 */
function createServerSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        throw new Error('Supabase credentials not configured');
    }

    return createClient(url, serviceKey);
}

/**
 * 月次レポートデータを生成
 */
export async function generateMonthlyReportData(
    year: number,
    month: number
): Promise<MonthlyReportData> {
    const supabase = createServerSupabase();

    // 期間計算
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // データ取得
    const [
        { data: lendingsData },
        { data: accountsData },
        { data: personsData },
        { data: accountTransactionsData },
    ] = await Promise.all([
        supabase.from('lendings').select('*').gte('date', startDate).lte('date', endDate).order('date', { ascending: false }),
        supabase.from('accounts').select('*').eq('is_archived', false),
        supabase.from('persons').select('*').eq('is_archived', false),
        supabase.from('account_transactions').select('*').gte('date', startDate).lte('date', endDate).order('date', { ascending: false }),
    ]);

    // 全期間の貸借データも取得（残高計算用）
    const { data: allLendingsData } = await supabase.from('lendings').select('*');

    const lendings: Lending[] = (lendingsData || []).map(row => toCamelCase<Lending>(row));
    const allLendings: Lending[] = (allLendingsData || []).map(row => toCamelCase<Lending>(row));
    const accounts: Account[] = (accountsData || []).map(row => toCamelCase<Account>(row));
    const persons: Person[] = (personsData || []).map(row => toCamelCase<Person>(row));
    const accountTransactions: AccountTransaction[] = (accountTransactionsData || []).map(row => toCamelCase<AccountTransaction>(row));

    // 残高計算関数
    const getPersonBalance = (personId: number): number => {
        return allLendings
            .filter(l =>
                (l.counterpartyType === 'person' && l.counterpartyId === personId) ||
                (!l.counterpartyType && l.personId === personId)
            )
            .reduce((sum, l) => sum + l.amount, 0);
    };

    const getAccountLendingBalance = (accountId: number): number => {
        let balance = 0;
        allLendings.forEach(l => {
            if (l.accountId === accountId) balance -= l.amount;
            if (l.counterpartyType === 'account' && l.counterpartyId === accountId) balance += l.amount;
        });
        return balance;
    };

    // サマリー計算（当月分）
    const summary = {
        totalLent: lendings.filter(l => l.type === 'lend').reduce((sum, l) => sum + l.amount, 0),
        totalBorrowed: lendings.filter(l => l.type === 'borrow').reduce((sum, l) => sum + Math.abs(l.amount), 0),
        totalReturned: lendings.filter(l => l.type === 'return').reduce((sum, l) => sum + Math.abs(l.amount), 0),
        netBalance: 0,
    };
    summary.netBalance = summary.totalLent - summary.totalBorrowed;

    // 口座別残高
    const accountBalances = accounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        manualBalance: acc.balance,
        lendingBalance: getAccountLendingBalance(acc.id),
    }));

    // 相手先別残高
    const personBalances = persons.map(p => {
        const balance = getPersonBalance(p.id);
        return {
            id: p.id,
            name: p.name,
            balance: Math.abs(balance),
            status: (balance > 0 ? '貸し' : balance < 0 ? '借り' : '精算済') as '貸し' | '借り' | '精算済',
        };
    });

    // 取引履歴統合
    const transactions: MonthlyReportData['transactions'] = [];

    // 貸借履歴
    lendings.forEach(l => {
        const account = accounts.find(a => a.id === l.accountId);
        let counterpartyName = '-';
        if (l.counterpartyType === 'account') {
            const acc = accounts.find(a => a.id === l.counterpartyId);
            counterpartyName = acc?.name || '-';
        } else {
            const person = persons.find(p => p.id === (l.counterpartyId || l.personId));
            counterpartyName = person?.name || '-';
        }

        const displayTypeMap = {
            lend: '貸し',
            borrow: '借り',
            return: '返済',
        };

        transactions.push({
            id: l.id,
            date: l.date,
            type: l.type,
            displayType: displayTypeMap[l.type],
            amount: Math.abs(l.amount),
            accountName: account?.name || '-',
            counterpartyName,
            memo: l.memo,
        });
    });

    // 口座取引履歴
    accountTransactions.forEach(t => {
        const displayTypeMap = {
            transfer: '振替',
            interest: '受取利息',
            investment_gain: t.amount < 0 ? '運用損' : '運用益',
        };

        let accountName = '-';
        let counterpartyName = '-';

        if (t.type === 'transfer') {
            const fromAcc = accounts.find(a => a.id === t.fromAccountId);
            const toAcc = accounts.find(a => a.id === t.toAccountId);
            accountName = fromAcc?.name || '-';
            counterpartyName = `→ ${toAcc?.name || '-'}`;
        } else {
            const acc = accounts.find(a => a.id === t.accountId);
            accountName = acc?.name || '-';
        }

        transactions.push({
            id: t.id + 100000, // IDの重複を避ける
            date: t.date,
            type: t.type,
            displayType: displayTypeMap[t.type],
            amount: Math.abs(t.amount),
            accountName,
            counterpartyName,
            memo: t.memo,
        });
    });

    // 日付でソート
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
        period: {
            year,
            month,
            startDate,
            endDate,
        },
        summary,
        accountBalances,
        personBalances,
        transactions,
        generatedAt: new Date().toISOString(),
    };
}

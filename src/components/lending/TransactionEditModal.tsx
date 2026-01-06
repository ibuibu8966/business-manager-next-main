'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Lending, AccountTransaction, Account, Person } from '@/types';

// フィールドラベルの日本語マッピング
const fieldLabels: Record<string, string> = {
    amount: '金額',
    date: '日付',
    memo: 'メモ',
    accountId: '口座',
    counterpartyId: '相手',
    counterpartyType: '相手タイプ',
    type: '種類',
    fromAccountId: '振替元',
    toAccountId: '振替先',
};

// 変更内容を検出して説明文を生成
export interface FieldChange {
    field: string;
    oldValue: string | number | undefined;
    newValue: string | number | undefined;
    displayName: string;
}

export function generateChangeDescription(
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
    accounts: Account[],
    persons: Person[]
): { description: string; changes: FieldChange[] } {
    const changes: FieldChange[] = [];
    const fieldsToCheck = ['amount', 'date', 'memo', 'accountId', 'counterpartyId', 'counterpartyType', 'type', 'fromAccountId', 'toAccountId'];

    for (const key of fieldsToCheck) {
        const oldVal = oldValues[key];
        const newVal = newValues[key];

        if (oldVal !== newVal && (oldVal !== undefined || newVal !== undefined)) {
            // 表示用の値を整形
            let oldDisplay: string | number | undefined = oldVal as string | number | undefined;
            let newDisplay: string | number | undefined = newVal as string | number | undefined;

            // 口座IDを名前に変換
            if (key === 'accountId' || key === 'fromAccountId' || key === 'toAccountId') {
                const oldAccount = accounts.find(a => a.id === oldVal);
                const newAccount = accounts.find(a => a.id === newVal);
                oldDisplay = oldAccount?.name || String(oldVal || '');
                newDisplay = newAccount?.name || String(newVal || '');
            }

            // 相手IDを名前に変換
            if (key === 'counterpartyId') {
                const counterpartyType = (newValues.counterpartyType || oldValues.counterpartyType) as string;
                if (counterpartyType === 'account') {
                    const oldAcc = accounts.find(a => a.id === oldVal);
                    const newAcc = accounts.find(a => a.id === newVal);
                    oldDisplay = oldAcc?.name || String(oldVal || '');
                    newDisplay = newAcc?.name || String(newVal || '');
                } else {
                    const oldPerson = persons.find(p => p.id === oldVal);
                    const newPerson = persons.find(p => p.id === newVal);
                    oldDisplay = oldPerson?.name || String(oldVal || '');
                    newDisplay = newPerson?.name || String(newVal || '');
                }
            }

            // 種類を日本語に変換
            if (key === 'type') {
                const typeLabels: Record<string, string> = {
                    lend: '貸し',
                    borrow: '借り',
                    return: '返済',
                    transfer: '振替',
                    interest: '利息',
                    investment_gain: '運用損益',
                    deposit: '純入金',
                    withdrawal: '純出金',
                };
                oldDisplay = typeLabels[oldVal as string] || String(oldVal || '');
                newDisplay = typeLabels[newVal as string] || String(newVal || '');
            }

            // 金額をフォーマット
            if (key === 'amount') {
                oldDisplay = oldVal !== undefined ? `¥${Math.abs(Number(oldVal)).toLocaleString()}` : '';
                newDisplay = newVal !== undefined ? `¥${Math.abs(Number(newVal)).toLocaleString()}` : '';
            }

            changes.push({
                field: key,
                oldValue: oldDisplay,
                newValue: newDisplay,
                displayName: fieldLabels[key] || key,
            });
        }
    }

    // 説明文を生成
    const descriptions = changes.map(c =>
        `${c.displayName}を${c.oldValue || '(なし)'}→${c.newValue || '(なし)'}に変更`
    );

    return {
        description: descriptions.join('、') || '変更なし',
        changes,
    };
}

// 統合された取引型（表示用）
export interface CombinedTransaction {
    id: string;
    source: 'lending' | 'transaction';
    originalId: number;
    type: string;
    amount: number;
    date: string;
    memo?: string;
    accountId?: number;
    counterpartyType?: 'account' | 'person';
    counterpartyId?: number;
    fromAccountId?: number;
    toAccountId?: number;
    returned?: boolean;
}

interface TransactionEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: CombinedTransaction | null;
    accounts: Account[];
    persons: Person[];
    onSave: (
        source: 'lending' | 'transaction',
        originalId: number,
        updates: Partial<Lending> | Partial<AccountTransaction>,
        changes: FieldChange[]
    ) => void;
}

export function TransactionEditModal({
    isOpen,
    onClose,
    transaction,
    accounts,
    persons,
    onSave,
}: TransactionEditModalProps) {
    const [formData, setFormData] = useState({
        type: '',
        amount: 0,
        date: '',
        memo: '',
        accountId: 0,
        counterpartyType: 'person' as 'account' | 'person',
        counterpartyId: 0,
        fromAccountId: 0,
        toAccountId: 0,
    });

    // トランザクションが変更されたらフォームを初期化
    useEffect(() => {
        if (transaction) {
            setFormData({
                type: transaction.type,
                amount: Math.abs(transaction.amount),
                date: transaction.date,
                memo: transaction.memo || '',
                accountId: transaction.accountId || 0,
                counterpartyType: transaction.counterpartyType || 'person',
                counterpartyId: transaction.counterpartyId || 0,
                fromAccountId: transaction.fromAccountId || 0,
                toAccountId: transaction.toAccountId || 0,
            });
        }
    }, [transaction]);

    if (!transaction) return null;

    const activeAccounts = accounts.filter(a => !a.isArchived);
    const activePersons = persons.filter(p => !p.isArchived);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // 元の値を取得
        const originalValues = {
            type: transaction.type,
            amount: Math.abs(transaction.amount),
            date: transaction.date,
            memo: transaction.memo || '',
            accountId: transaction.accountId,
            counterpartyType: transaction.counterpartyType,
            counterpartyId: transaction.counterpartyId,
            fromAccountId: transaction.fromAccountId,
            toAccountId: transaction.toAccountId,
        };

        // 変更内容を検出
        const { changes } = generateChangeDescription(originalValues, formData, accounts, persons);

        if (changes.length === 0) {
            onClose();
            return;
        }

        // 更新データを構築
        if (transaction.source === 'lending') {
            const updates: Partial<Lending> = {
                type: formData.type as 'lend' | 'borrow' | 'return',
                amount: formData.type === 'borrow' ? -Math.abs(formData.amount) : Math.abs(formData.amount),
                date: formData.date,
                memo: formData.memo || undefined,
                accountId: formData.accountId,
                counterpartyType: formData.counterpartyType,
                counterpartyId: formData.counterpartyId,
            };
            onSave('lending', transaction.originalId, updates, changes);
        } else {
            const updates: Partial<AccountTransaction> = {
                type: formData.type as AccountTransaction['type'],
                amount: formData.amount,
                date: formData.date,
                memo: formData.memo || undefined,
            };

            if (formData.type === 'transfer') {
                updates.fromAccountId = formData.fromAccountId;
                updates.toAccountId = formData.toAccountId;
            } else {
                updates.accountId = formData.accountId;
            }

            onSave('transaction', transaction.originalId, updates, changes);
        }

        onClose();
    };

    // 貸借取引の編集フォーム
    const renderLendingForm = () => (
        <>
            <div className="form-group">
                <label>対象口座</label>
                <select
                    value={formData.accountId}
                    onChange={e => setFormData({ ...formData, accountId: Number(e.target.value) })}
                    required
                >
                    {activeAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label>相手タイプ</label>
                <select
                    value={formData.counterpartyType}
                    onChange={e => setFormData({
                        ...formData,
                        counterpartyType: e.target.value as 'account' | 'person',
                        counterpartyId: 0,
                    })}
                >
                    <option value="person">外部相手</option>
                    <option value="account">社内口座</option>
                </select>
            </div>

            <div className="form-group">
                <label>相手</label>
                <select
                    value={formData.counterpartyId}
                    onChange={e => setFormData({ ...formData, counterpartyId: Number(e.target.value) })}
                    required
                >
                    <option value="">選択してください</option>
                    {formData.counterpartyType === 'account'
                        ? activeAccounts.filter(a => a.id !== formData.accountId).map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))
                        : activePersons.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))
                    }
                </select>
            </div>

            <div className="form-group">
                <label>種類</label>
                <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    required
                >
                    <option value="lend">貸し（相手に渡す）</option>
                    <option value="borrow">借り（相手から受け取る）</option>
                </select>
            </div>
        </>
    );

    // 口座取引（振替）の編集フォーム
    const renderTransferForm = () => (
        <>
            <div className="form-group">
                <label>振替元口座</label>
                <select
                    value={formData.fromAccountId}
                    onChange={e => setFormData({ ...formData, fromAccountId: Number(e.target.value) })}
                    required
                >
                    {activeAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label>振替先口座</label>
                <select
                    value={formData.toAccountId}
                    onChange={e => setFormData({ ...formData, toAccountId: Number(e.target.value) })}
                    required
                >
                    {activeAccounts.filter(a => a.id !== formData.fromAccountId).map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>
        </>
    );

    // 口座取引（利息・運用益・純入出金）の編集フォーム
    const renderAccountTransactionForm = () => (
        <>
            <div className="form-group">
                <label>対象口座</label>
                <select
                    value={formData.accountId}
                    onChange={e => setFormData({ ...formData, accountId: Number(e.target.value) })}
                    required
                >
                    {activeAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label>種類</label>
                <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    required
                >
                    <option value="interest">受取利息</option>
                    <option value="investment_gain">運用損益</option>
                    <option value="deposit">純入金</option>
                    <option value="withdrawal">純出金</option>
                </select>
            </div>
        </>
    );

    const getTitle = () => {
        if (transaction.source === 'lending') {
            return '貸借履歴を編集';
        }
        if (transaction.type === 'transfer') {
            return '振替を編集';
        }
        return '口座取引を編集';
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={getTitle()}>
            <form onSubmit={handleSubmit}>
                {transaction.source === 'lending' && renderLendingForm()}
                {transaction.source === 'transaction' && transaction.type === 'transfer' && renderTransferForm()}
                {transaction.source === 'transaction' && transaction.type !== 'transfer' && renderAccountTransactionForm()}

                <div className="form-group">
                    <label>金額</label>
                    <input
                        type="number"
                        value={formData.amount}
                        onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                        min="1"
                        required
                    />
                    {(formData.type === 'investment_gain') && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            ※ 運用損の場合はマイナス値を入力
                        </p>
                    )}
                </div>

                <div className="form-group">
                    <label>日付</label>
                    <input
                        type="date"
                        value={formData.date}
                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                        required
                    />
                </div>

                <div className="form-group">
                    <label>メモ</label>
                    <textarea
                        value={formData.memo}
                        onChange={e => setFormData({ ...formData, memo: e.target.value })}
                    />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button type="button" variant="secondary" onClick={onClose} style={{ flex: 1 }}>
                        キャンセル
                    </Button>
                    <Button type="submit" style={{ flex: 1 }}>
                        保存
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

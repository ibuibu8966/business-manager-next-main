import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { MonthlyReportData } from '../reports/lending-monthly';
import { fontFamily } from './fonts';

const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontSize: 10,
        fontFamily,
    },
    header: {
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 20,
        paddingBottom: 10,
        borderBottomWidth: 2,
        borderBottomColor: '#333',
    },
    subHeader: {
        fontSize: 9,
        textAlign: 'center',
        color: '#666',
        marginBottom: 20,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 10,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
    },
    summaryContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 15,
    },
    summaryCard: {
        width: '23%',
        padding: 10,
        backgroundColor: '#f5f5f5',
        borderRadius: 4,
    },
    summaryLabel: {
        fontSize: 8,
        color: '#666',
        marginBottom: 4,
    },
    summaryValue: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    table: {
        width: '100%',
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#f0f0f0',
        paddingVertical: 6,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 5,
        paddingHorizontal: 4,
        borderBottomWidth: 0.5,
        borderBottomColor: '#eee',
    },
    tableCell: {
        fontSize: 9,
    },
    // 口座テーブル用
    accountCol1: { width: '40%' },
    accountCol2: { width: '30%', textAlign: 'right' },
    accountCol3: { width: '30%', textAlign: 'right' },
    // 相手先テーブル用
    personCol1: { width: '40%' },
    personCol2: { width: '30%', textAlign: 'right' },
    personCol3: { width: '30%', textAlign: 'center' },
    // 取引履歴テーブル用
    txCol1: { width: '15%' },
    txCol2: { width: '15%' },
    txCol3: { width: '20%' },
    txCol4: { width: '20%' },
    txCol5: { width: '15%', textAlign: 'right' },
    txCol6: { width: '15%' },
    positive: {
        color: '#16a34a',
    },
    negative: {
        color: '#dc2626',
    },
    footer: {
        position: 'absolute',
        bottom: 20,
        left: 30,
        right: 30,
        fontSize: 8,
        color: '#999',
        textAlign: 'center',
        borderTopWidth: 0.5,
        borderTopColor: '#ddd',
        paddingTop: 10,
    },
});

interface Props {
    data: MonthlyReportData;
}

export function LendingMonthlyReportPDF({ data }: Props) {
    const formatCurrency = (amount: number) => `¥${amount.toLocaleString()}`;

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* ヘッダー */}
                <Text style={styles.header}>
                    貸借月次レポート {data.period.year}年{data.period.month}月
                </Text>
                <Text style={styles.subHeader}>
                    期間: {data.period.startDate} 〜 {data.period.endDate}
                </Text>

                {/* サマリー */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>サマリー</Text>
                    <View style={styles.summaryContainer}>
                        <View style={styles.summaryCard}>
                            <Text style={styles.summaryLabel}>貸出合計</Text>
                            <Text style={[styles.summaryValue, styles.positive]}>
                                {formatCurrency(data.summary.totalLent)}
                            </Text>
                        </View>
                        <View style={styles.summaryCard}>
                            <Text style={styles.summaryLabel}>借入合計</Text>
                            <Text style={[styles.summaryValue, styles.negative]}>
                                {formatCurrency(data.summary.totalBorrowed)}
                            </Text>
                        </View>
                        <View style={styles.summaryCard}>
                            <Text style={styles.summaryLabel}>返済合計</Text>
                            <Text style={styles.summaryValue}>
                                {formatCurrency(data.summary.totalReturned)}
                            </Text>
                        </View>
                        <View style={styles.summaryCard}>
                            <Text style={styles.summaryLabel}>差引残高</Text>
                            <Text style={[styles.summaryValue, data.summary.netBalance >= 0 ? styles.positive : styles.negative]}>
                                {formatCurrency(data.summary.netBalance)}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* 口座別残高 */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>口座別残高</Text>
                    <View style={styles.table}>
                        <View style={styles.tableHeader}>
                            <Text style={[styles.tableCell, styles.accountCol1]}>口座名</Text>
                            <Text style={[styles.tableCell, styles.accountCol2]}>手動残高</Text>
                            <Text style={[styles.tableCell, styles.accountCol3]}>貸借残高</Text>
                        </View>
                        {data.accountBalances.map(acc => (
                            <View key={acc.id} style={styles.tableRow}>
                                <Text style={[styles.tableCell, styles.accountCol1]}>{acc.name}</Text>
                                <Text style={[styles.tableCell, styles.accountCol2]}>
                                    {acc.manualBalance !== undefined ? formatCurrency(acc.manualBalance) : '-'}
                                </Text>
                                <Text style={[styles.tableCell, styles.accountCol3, acc.lendingBalance >= 0 ? styles.positive : styles.negative]}>
                                    {formatCurrency(acc.lendingBalance)}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* 相手先別残高 */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>相手先別残高</Text>
                    <View style={styles.table}>
                        <View style={styles.tableHeader}>
                            <Text style={[styles.tableCell, styles.personCol1]}>相手先</Text>
                            <Text style={[styles.tableCell, styles.personCol2]}>金額</Text>
                            <Text style={[styles.tableCell, styles.personCol3]}>状態</Text>
                        </View>
                        {data.personBalances.map(person => (
                            <View key={person.id} style={styles.tableRow}>
                                <Text style={[styles.tableCell, styles.personCol1]}>{person.name}</Text>
                                <Text style={[styles.tableCell, styles.personCol2]}>
                                    {formatCurrency(person.balance)}
                                </Text>
                                <Text style={[styles.tableCell, styles.personCol3]}>{person.status}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* 取引履歴 */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>取引履歴（当月）</Text>
                    <View style={styles.table}>
                        <View style={styles.tableHeader}>
                            <Text style={[styles.tableCell, styles.txCol1]}>日付</Text>
                            <Text style={[styles.tableCell, styles.txCol2]}>種類</Text>
                            <Text style={[styles.tableCell, styles.txCol3]}>口座</Text>
                            <Text style={[styles.tableCell, styles.txCol4]}>相手</Text>
                            <Text style={[styles.tableCell, styles.txCol5]}>金額</Text>
                            <Text style={[styles.tableCell, styles.txCol6]}>メモ</Text>
                        </View>
                        {data.transactions.slice(0, 30).map(tx => (
                            <View key={tx.id} style={styles.tableRow}>
                                <Text style={[styles.tableCell, styles.txCol1]}>{tx.date}</Text>
                                <Text style={[styles.tableCell, styles.txCol2]}>{tx.displayType}</Text>
                                <Text style={[styles.tableCell, styles.txCol3]}>{tx.accountName}</Text>
                                <Text style={[styles.tableCell, styles.txCol4]}>{tx.counterpartyName}</Text>
                                <Text style={[styles.tableCell, styles.txCol5]}>{formatCurrency(tx.amount)}</Text>
                                <Text style={[styles.tableCell, styles.txCol6]}>{tx.memo || '-'}</Text>
                            </View>
                        ))}
                        {data.transactions.length > 30 && (
                            <View style={styles.tableRow}>
                                <Text style={styles.tableCell}>... 他 {data.transactions.length - 30} 件</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* フッター */}
                <Text style={styles.footer}>
                    生成日時: {new Date(data.generatedAt).toLocaleString('ja-JP')} | 業務管理システム
                </Text>
            </Page>
        </Document>
    );
}

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export function ReportSendButton() {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{ url?: string; error?: string; lineSent?: boolean } | null>(null);

    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const handleGenerate = async (sendToLine: boolean) => {
        setIsLoading(true);
        setResult(null);

        try {
            const response = await fetch('/api/reports/generate-and-send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year, month, sendToLine }),
            });

            const data = await response.json();

            if (data.success) {
                setResult({ url: data.url, lineSent: data.lineSent });
            } else {
                setResult({ error: data.error || 'エラーが発生しました' });
            }
        } catch (error) {
            setResult({ error: 'ネットワークエラーが発生しました' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = () => {
        window.open(`/api/reports/lending-monthly?year=${year}&month=${month}`, '_blank');
    };

    const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

    return (
        <>
            <Button variant="ghost" onClick={() => setIsOpen(true)}>
                📊 レポート
            </Button>

            <Modal isOpen={isOpen} onClose={() => { setIsOpen(false); setResult(null); }} title="月次レポート生成">
                <div className="form-group">
                    <label>対象期間</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                            value={year}
                            onChange={e => setYear(Number(e.target.value))}
                            style={{ flex: 1 }}
                        >
                            {years.map(y => (
                                <option key={y} value={y}>{y}年</option>
                            ))}
                        </select>
                        <select
                            value={month}
                            onChange={e => setMonth(Number(e.target.value))}
                            style={{ flex: 1 }}
                        >
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>{m}月</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                    <Button
                        onClick={handleDownload}
                        variant="secondary"
                        disabled={isLoading}
                    >
                        PDFをダウンロード
                    </Button>

                    <Button
                        onClick={() => handleGenerate(false)}
                        variant="secondary"
                        disabled={isLoading}
                    >
                        {isLoading ? '生成中...' : 'PDFを生成（保存のみ）'}
                    </Button>

                    <Button
                        onClick={() => handleGenerate(true)}
                        disabled={isLoading}
                    >
                        {isLoading ? '送信中...' : 'PDF生成 & LINE送信'}
                    </Button>
                </div>

                {result && (
                    <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', backgroundColor: result.error ? 'var(--danger-bg)' : 'var(--success-bg)' }}>
                        {result.error ? (
                            <p style={{ color: 'var(--danger)', margin: 0 }}>{result.error}</p>
                        ) : (
                            <>
                                <p style={{ color: 'var(--success)', margin: 0, marginBottom: '8px' }}>
                                    レポートが生成されました
                                    {result.lineSent && ' & LINEに送信しました'}
                                </p>
                                {result.url && (
                                    <a
                                        href={result.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: 'var(--primary)', textDecoration: 'underline' }}
                                    >
                                        PDFをダウンロード
                                    </a>
                                )}
                            </>
                        )}
                    </div>
                )}

                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '16px' }}>
                    ※ LINE送信には環境変数の設定が必要です
                </p>
            </Modal>
        </>
    );
}

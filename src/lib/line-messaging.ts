// LINE Messaging API ユーティリティ

const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message/push';

interface LineTextMessage {
    type: 'text';
    text: string;
}

interface LinePushOptions {
    to: string;
    messages: LineTextMessage[];
}

/**
 * LINE Messaging APIでメッセージを送信
 */
export async function sendLineMessage(options: LinePushOptions): Promise<{ success: boolean; error?: string }> {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!token) {
        return { success: false, error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' };
    }

    try {
        const response = await fetch(LINE_MESSAGING_API, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(options),
        });

        if (!response.ok) {
            const error = await response.text();
            return { success: false, error: `LINE API error: ${error}` };
        }

        return { success: true };
    } catch (error) {
        console.error('LINE Messaging error:', error);
        return { success: false, error: 'Failed to send LINE message' };
    }
}

/**
 * PDFダウンロードリンクをLINEで送信
 */
export async function sendPdfLinkToLine(
    pdfUrl: string,
    year: number,
    month: number
): Promise<{ success: boolean; error?: string }> {
    const userId = process.env.LINE_USER_ID;

    if (!userId) {
        return { success: false, error: 'LINE_USER_ID not configured' };
    }

    const message = `📊 ${year}年${month}月 貸借月次レポート

レポートが生成されました。
以下のリンクからダウンロードできます。

${pdfUrl}`;

    return sendLineMessage({
        to: userId,
        messages: [{ type: 'text', text: message }],
    });
}

/**
 * 月次レポート自動送信用メッセージ
 */
export function createMonthlyReportMessage(year: number, month: number, pdfUrl: string): string {
    return `📊 【自動送信】${year}年${month}月 貸借月次レポート

毎月の定期レポートをお届けします。

ダウンロード: ${pdfUrl}

---
業務管理システム`;
}

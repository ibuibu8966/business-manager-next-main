import { NextRequest, NextResponse } from 'next/server';

// LINE Webhookイベントを受信してグループIDを確認する
// グループID取得後は削除してOK

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        console.log('=== LINE Webhook Event ===');
        console.log(JSON.stringify(body, null, 2));

        // イベントを処理
        for (const event of body.events || []) {
            // グループに参加した時、またはグループでメッセージを受信した時
            if (event.source?.type === 'group') {
                const groupId = event.source.groupId;
                console.log('========================================');
                console.log('GROUP ID FOUND:', groupId);
                console.log('========================================');

                // グループIDをLINEに返信（確認用）
                const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
                if (token && event.replyToken) {
                    await fetch('https://api.line.me/v2/bot/message/reply', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            replyToken: event.replyToken,
                            messages: [{
                                type: 'text',
                                text: `グループID: ${groupId}\n\nこのIDを環境変数 LINE_USER_ID に設定してください。`,
                            }],
                        }),
                    });
                }
            }

            // ユーザーIDの場合
            if (event.source?.type === 'user') {
                const userId = event.source.userId;
                console.log('========================================');
                console.log('USER ID FOUND:', userId);
                console.log('========================================');
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}

// LINE Webhook検証用（GET）
export async function GET() {
    return NextResponse.json({ status: 'ok' });
}

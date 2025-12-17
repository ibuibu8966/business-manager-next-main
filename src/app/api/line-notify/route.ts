import { NextRequest, NextResponse } from 'next/server';

const LINE_NOTIFY_API = 'https://notify-api.line.me/api/notify';

export async function POST(request: NextRequest) {
    try {
        const { message, token } = await request.json();

        // トークンは環境変数 or リクエストから取得
        const lineToken = token || process.env.LINE_NOTIFY_TOKEN;

        if (!lineToken) {
            return NextResponse.json(
                { error: 'LINE Notify token not configured' },
                { status: 400 }
            );
        }

        if (!message) {
            return NextResponse.json(
                { error: 'Message is required' },
                { status: 400 }
            );
        }

        const response = await fetch(LINE_NOTIFY_API, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${lineToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ message }),
        });

        if (!response.ok) {
            const error = await response.text();
            return NextResponse.json(
                { error: `LINE API error: ${error}` },
                { status: response.status }
            );
        }

        const result = await response.json();
        return NextResponse.json({ success: true, result });

    } catch (error) {
        console.error('LINE Notify error:', error);
        return NextResponse.json(
            { error: 'Failed to send notification' },
            { status: 500 }
        );
    }
}

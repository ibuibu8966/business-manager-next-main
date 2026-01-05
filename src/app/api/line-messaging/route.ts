import { NextRequest, NextResponse } from 'next/server';

const LINE_MESSAGING_API = 'https://api.line.me/v2/bot/message/push';

export async function POST(request: NextRequest) {
    try {
        const { to, messages } = await request.json();
        const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

        if (!token) {
            return NextResponse.json(
                { error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' },
                { status: 500 }
            );
        }

        if (!to) {
            return NextResponse.json(
                { error: 'Recipient (to) is required' },
                { status: 400 }
            );
        }

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: 'Messages array is required' },
                { status: 400 }
            );
        }

        const response = await fetch(LINE_MESSAGING_API, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ to, messages }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('LINE API error:', errorText);
            return NextResponse.json(
                { error: `LINE API error: ${errorText}` },
                { status: response.status }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('LINE Messaging error:', error);
        return NextResponse.json(
            { error: 'Failed to send LINE message' },
            { status: 500 }
        );
    }
}

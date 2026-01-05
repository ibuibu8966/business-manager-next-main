import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    // Vercel Cronからの呼び出しを検証
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    // 前月の年月を計算
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1;

    try {
        // 統合APIを内部呼び出し
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        const response = await fetch(`${appUrl}/api/reports/generate-and-send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                year,
                month,
                sendToLine: true,
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('Cron job error:', result);
            return NextResponse.json(
                { error: 'Failed to generate and send report', details: result },
                { status: 500 }
            );
        }

        console.log(`Monthly report sent successfully for ${year}/${month}`);

        return NextResponse.json({
            success: true,
            message: `Monthly report for ${year}/${month} generated and sent`,
            result,
        });
    } catch (error) {
        console.error('Cron job error:', error);
        return NextResponse.json(
            { error: 'Cron job failed', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

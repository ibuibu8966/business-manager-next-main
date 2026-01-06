import { NextRequest, NextResponse } from 'next/server';
import { generateRecurringTasks } from '@/lib/recurringTaskGenerator';

export async function GET(request: NextRequest) {
    // Vercel Cronからの呼び出しを検証
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // テスト用：クエリパラメータで日付を指定可能
    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get('date');
    let targetDate: Date | undefined;

    if (dateParam) {
        targetDate = new Date(dateParam);
        if (isNaN(targetDate.getTime())) {
            return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
        }
    }

    try {
        const result = await generateRecurringTasks(targetDate);

        return NextResponse.json({
            success: true,
            message: `Generated ${result.createdCount} tasks, skipped ${result.skippedCount}`,
            date: targetDate ? dateParam : new Date().toISOString().split('T')[0],
            ...result
        });
    } catch (error) {
        console.error('Recurring tasks cron error:', error);
        return NextResponse.json(
            {
                error: 'Cron job failed',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

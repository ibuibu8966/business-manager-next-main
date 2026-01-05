import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@supabase/supabase-js';
import { LendingMonthlyReportPDF } from '@/lib/pdf/lending-report';
import { generateMonthlyReportData } from '@/lib/reports/lending-monthly';
import { createMonthlyReportMessage, sendLineMessage } from '@/lib/line-messaging';
import '@/lib/pdf/fonts';

export async function POST(request: NextRequest) {
    try {
        const { year, month, sendToLine } = await request.json();

        // バリデーション
        if (!year || !month) {
            return NextResponse.json(
                { error: 'year and month are required' },
                { status: 400 }
            );
        }

        // 1. レポートデータ生成
        const data = await generateMonthlyReportData(year, month);

        // 2. PDF生成
        const pdfBuffer = await renderToBuffer(
            <LendingMonthlyReportPDF data={data} />
        );

        // 3. Supabase Storageにアップロード
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json(
                { error: 'Supabase credentials not configured' },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const fileName = `lending-report-${year}-${String(month).padStart(2, '0')}-${Date.now()}.pdf`;
        const filePath = `reports/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('reports')
            .upload(filePath, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true,
            });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return NextResponse.json(
                { error: `Failed to upload PDF: ${uploadError.message}` },
                { status: 500 }
            );
        }

        // 公開URLを取得
        const { data: urlData } = supabase.storage
            .from('reports')
            .getPublicUrl(filePath);

        const pdfUrl = urlData.publicUrl;

        // 4. LINE送信（オプション）
        let lineSent = false;
        if (sendToLine) {
            const userId = process.env.LINE_USER_ID;
            const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

            if (userId && token) {
                const message = createMonthlyReportMessage(year, month, pdfUrl);
                const result = await sendLineMessage({
                    to: userId,
                    messages: [{ type: 'text', text: message }],
                });
                lineSent = result.success;
            }
        }

        return NextResponse.json({
            success: true,
            url: pdfUrl,
            lineSent,
            period: { year, month },
        });
    } catch (error) {
        console.error('Report generation error:', error);
        return NextResponse.json(
            { error: 'Failed to generate report', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

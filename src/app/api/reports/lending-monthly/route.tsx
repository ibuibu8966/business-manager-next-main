import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { LendingMonthlyReportPDF } from '@/lib/pdf/lending-report';
import { generateMonthlyReportData } from '@/lib/reports/lending-monthly';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    const now = new Date();
    const year = yearParam ? parseInt(yearParam) : now.getFullYear();
    const month = monthParam ? parseInt(monthParam) : now.getMonth() + 1;

    // バリデーション
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return NextResponse.json(
            { error: 'Invalid year or month parameter' },
            { status: 400 }
        );
    }

    try {
        // レポートデータ生成
        const data = await generateMonthlyReportData(year, month);

        // PDF生成
        const pdfBuffer = await renderToBuffer(
            <LendingMonthlyReportPDF data={data} />
        );

        // PDFレスポンス（BufferをUint8Arrayに変換）
        return new NextResponse(new Uint8Array(pdfBuffer), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="lending-report-${year}-${String(month).padStart(2, '0')}.pdf"`,
            },
        });
    } catch (error) {
        console.error('PDF generation error:', error);
        return NextResponse.json(
            { error: 'Failed to generate PDF', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function POST(request: NextRequest) {
    try {
        // Supabaseが設定されているかチェック
        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json(
                { error: 'Supabase is not configured' },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const businessId = formData.get('businessId') as string;
        const manualId = formData.get('manualId') as string;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // 20MB制限
        if (file.size > 20 * 1024 * 1024) {
            return NextResponse.json(
                { error: 'File size exceeds 20MB limit' },
                { status: 400 }
            );
        }

        // PDFのみ許可
        if (file.type !== 'application/pdf') {
            return NextResponse.json(
                { error: 'Only PDF files are allowed' },
                { status: 400 }
            );
        }

        // ファイルパス生成
        const timestamp = Date.now();
        const filePath = `manuals/${businessId}/${manualId}-${timestamp}.pdf`;

        // ArrayBufferに変換
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Supabase Storageにアップロード
        const { error: uploadError } = await supabase.storage
            .from('manuals')
            .upload(filePath, buffer, {
                contentType: 'application/pdf',
                upsert: true,
            });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return NextResponse.json(
                { error: 'Failed to upload file' },
                { status: 500 }
            );
        }

        // 公開URLを取得
        const { data: urlData } = supabase.storage
            .from('manuals')
            .getPublicUrl(filePath);

        return NextResponse.json({
            success: true,
            fileUrl: urlData.publicUrl,
            filePath: filePath,
            fileName: file.name,
            fileSize: file.size,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

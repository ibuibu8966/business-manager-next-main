'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RecurringTasksPage() {
    const router = useRouter();

    useEffect(() => {
        // /tasks ページの繰り返しタスクタブにリダイレクト
        router.replace('/tasks?tab=recurring');
    }, [router]);

    return (
        <div style={{ padding: 40, textAlign: 'center' }}>
            リダイレクト中...
        </div>
    );
}

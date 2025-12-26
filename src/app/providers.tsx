'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { DatabaseProvider } from '@/lib/db';

export function Providers({ children }: { children: ReactNode }) {
    return (
        <AuthProvider>
            <DatabaseProvider>
                {children}
            </DatabaseProvider>
        </AuthProvider>
    );
}

'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@/types';
import { supabase } from './supabase';

interface AuthContextType {
    user: User | null;
    login: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
    logout: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!supabase) {
            console.warn('Supabase is not configured. Auth will not work.');
            setIsLoading(false);
            return;
        }

        // ユーザー同期関数
        const syncUser = async (sessionUser: any) => {
            if (!sessionUser) {
                setUser(null);
                setIsLoading(false);
                return;
            }

            try {
                // usersテーブルからauth_idで検索
                const { data: existingUsers, error: fetchError } = await supabase!
                    .from('users')
                    .select('*')
                    .eq('auth_id', sessionUser.id)
                    .maybeSingle();

                if (fetchError) throw fetchError;

                if (existingUsers) {
                    // 既存ユーザーとしてログイン
                    setUser({
                        id: existingUsers.id, // Integer ID
                        email: sessionUser.email || '',
                        name: existingUsers.name,
                        isAdmin: existingUsers.isAdmin || true, // 一旦全員管理者権限
                    });
                } else {
                    // 新規ユーザー作成（usersテーブルに追加）
                    const newUserData = {
                        auth_id: sessionUser.id,
                        email: sessionUser.email || '',
                        name: sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0] || 'User',
                        is_admin: true, // デフォルトで管理者
                        password: '', // ダミー（使わないので）
                    };

                    const { data: newUser, error: insertError } = await supabase!
                        .from('users')
                        .insert(newUserData) // toSnakeCase不要（手動で書いたので）
                        .select()
                        .single();

                    if (insertError) throw insertError;

                    setUser({
                        id: newUser.id,
                        email: newUser.email,
                        name: newUser.name,
                        isAdmin: true,
                    });
                }
            } catch (e) {
                console.error('Failed to sync user:', e);
                // 同期失敗時でも最低限のAuth情報でログインさせるか、エラーにするか
                // ここではエラーとしてログアウト状態にする
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            syncUser(session?.user);
        });

        // Listen for changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            syncUser(session?.user);
        });

        return () => subscription.unsubscribe();
    }, []);

    const login = async (email: string, password: string) => {
        if (!supabase) return { error: new Error('Supabase client not initialized') };

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { error };
    };

    const signUp = async (email: string, password: string, name: string) => {
        if (!supabase) return { error: new Error('Supabase client not initialized') };

        const { error, data } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                },
            },
        });


        return { error };
    };

    const logout = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, signUp, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}

'use client';

import { useState, useEffect, useCallback, createContext, useContext, ReactNode, createElement } from 'react';
import { Database, Category } from '@/types';
import { supabase, isSupabaseConfigured, tableNames, toSnakeCase, toCamelCase } from './supabase';

const DEFAULT_CATEGORIES: Category[] = [
    { id: 1, type: 'income', name: '売上' },
    { id: 2, type: 'income', name: 'その他収入' },
    { id: 3, type: 'expense', name: '外注費' },
    { id: 4, type: 'expense', name: '広告費' },
    { id: 5, type: 'expense', name: '交通費' },
    { id: 6, type: 'expense', name: '消耗品' },
    { id: 7, type: 'expense', name: '家賃' },
    { id: 8, type: 'expense', name: 'サブスク' },
    { id: 9, type: 'expense', name: '人件費' },
    { id: 10, type: 'expense', name: 'その他経費' },
];

const DEFAULT_DB: Database = {
    users: [{ id: 1, name: '管理者', email: 'admin@example.com', isAdmin: true }],
    businesses: [],
    tasks: [],
    customers: [],
    tickets: [],
    histories: [],
    accounts: [],
    persons: [],
    lendings: [],
    transactions: [],
    fixedCosts: [],
    categories: DEFAULT_CATEGORIES,
    contracts: [],
    manuals: [],
    taskHistories: [],
    notifications: [],
};

// LocalStorageからロード
function loadFromLocalStorage(): Database {
    const loadedDb: Database = { ...DEFAULT_DB };
    const keys = Object.keys(DEFAULT_DB) as (keyof Database)[];

    keys.forEach(key => {
        const stored = localStorage.getItem(`bm_${key}`);
        if (stored) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (loadedDb as any)[key] = JSON.parse(stored);
            } catch {
                console.error(`Failed to parse ${key}`);
            }
        }
    });

    return loadedDb;
}

// LocalStorageに保存
function saveToLocalStorage(db: Database) {
    const keys = Object.keys(db) as (keyof Database)[];
    keys.forEach(key => {
        localStorage.setItem(`bm_${key}`, JSON.stringify(db[key]));
    });
}

// Supabaseからロード
async function loadFromSupabase(): Promise<Database> {
    if (!supabase) return { ...DEFAULT_DB };

    const loadedDb: Database = { ...DEFAULT_DB };
    const keys = Object.keys(tableNames) as (keyof typeof tableNames)[];

    for (const key of keys) {
        const tableName = tableNames[key];
        const { data, error } = await supabase.from(tableName).select('*');

        if (!error && data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (loadedDb as any)[key] = data.map(row => toCamelCase(row));
        }
    }

    return loadedDb;
}

// DatabaseContext の型定義
interface DatabaseContextType {
    db: Database | null;
    isLoading: boolean;
    saveDb: (newDb: Database) => void;
    updateCollection: <K extends keyof Database>(key: K, updater: (items: Database[K]) => Database[K]) => Promise<void>;
    useSupabase: boolean;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseProvider({ children }: { children: ReactNode }) {
    const [db, setDb] = useState<Database | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [useSupabaseState, setUseSupabaseState] = useState(false);

    useEffect(() => {
        async function load() {
            console.log('Supabase configured:', isSupabaseConfigured);

            if (isSupabaseConfigured) {
                try {
                    console.log('Loading from Supabase...');
                    // 接続テスト
                    const { error } = await supabase!.from('businesses').select('count', { count: 'exact', head: true });
                    if (error) throw error;

                    const supabaseDb = await loadFromSupabase();
                    console.log('Supabase data loaded:', supabaseDb);
                    setDb(supabaseDb);
                    setUseSupabaseState(true);
                } catch (e) {
                    console.error('Supabase load/connection failed, falling back to LocalStorage', e);
                    setDb(loadFromLocalStorage());
                    setUseSupabaseState(false);
                }
            } else {
                console.log('Using LocalStorage (Supabase not configured)');
                setDb(loadFromLocalStorage());
            }
            setIsLoading(false);
        }
        load();
    }, []);

    const saveDb = useCallback((newDb: Database) => {
        if (useSupabaseState) {
            // Supabaseモードでも一旦ローカル状態を更新
            setDb(newDb);
            // 注: 個別の更新はupdateCollectionで行う
        } else {
            saveToLocalStorage(newDb);
            setDb(newDb);
        }
    }, [useSupabaseState]);

    const updateCollection = useCallback(async <K extends keyof Database>(
        key: K,
        updater: (items: Database[K]) => Database[K]
    ) => {
        if (!db) return;

        const oldItems = db[key];
        const newItems = updater(oldItems);
        const newDb = { ...db, [key]: newItems };

        if (useSupabaseState && supabase) {
            const tableName = tableNames[key as keyof typeof tableNames];

            // 追加されたアイテムを検出
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const oldIds = new Set((oldItems as any[]).map(item => item.id));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const addedItems = (newItems as any[]).filter(item => !oldIds.has(item.id));

            // 削除されたアイテムを検出
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const newIds = new Set((newItems as any[]).map(item => item.id));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const deletedItems = (oldItems as any[]).filter(item => !newIds.has(item.id));

            // 更新されたアイテムを検出
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updatedItems = (newItems as any[]).filter(item => {
                if (!oldIds.has(item.id)) return false;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const oldItem = (oldItems as any[]).find(o => o.id === item.id);
                return JSON.stringify(item) !== JSON.stringify(oldItem);
            });

            try {
                // 追加
                for (const item of addedItems) {
                    const { id, ...rest } = item;
                    const { data, error } = await supabase.from(tableName).insert(toSnakeCase(rest)).select();
                    if (error) {
                        console.error(`Supabase INSERT failed for ${tableName}:`, error);
                    } else {
                        console.log(`Supabase INSERT success for ${tableName}:`, data);
                    }
                }

                // 削除
                for (const item of deletedItems) {
                    const { error } = await supabase.from(tableName).delete().eq('id', item.id);
                    if (error) {
                        console.error(`Supabase DELETE failed for ${tableName}:`, error);
                    } else {
                        console.log(`Supabase DELETE success for ${tableName}, id:`, item.id);
                    }
                }

                // 更新
                for (const item of updatedItems) {
                    const { id, ...rest } = item;
                    const { error } = await supabase.from(tableName).update(toSnakeCase(rest)).eq('id', id);
                    if (error) {
                        console.error(`Supabase UPDATE failed for ${tableName}:`, error);
                    } else {
                        console.log(`Supabase UPDATE success for ${tableName}, id:`, id);
                    }
                }
            } catch (e) {
                console.error('Supabase update failed:', e);
            }
        } else {
            saveToLocalStorage(newDb);
        }

        setDb(newDb);
    }, [db, useSupabaseState]);

    return createElement(
        DatabaseContext.Provider,
        { value: { db, isLoading, saveDb, updateCollection, useSupabase: useSupabaseState } },
        children
    );
}

export function useDatabase() {
    const context = useContext(DatabaseContext);
    if (!context) {
        throw new Error('useDatabase must be used within DatabaseProvider');
    }
    return context;
}

export function genId<T extends { id: number | string }>(arr: T[]): number {
    const ids = arr.map(x => x.id).filter((id): id is number => typeof id === 'number');
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

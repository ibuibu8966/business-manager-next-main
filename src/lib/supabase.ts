import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Supabaseが設定されているかチェック（URLが有効かつキーが存在する場合のみ）
export const isSupabaseConfigured = isValidUrl(supabaseUrl) && !!supabaseAnonKey;

// Supabaseクライアント（設定されている場合のみ）
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// テーブル名のマッピング（camelCase → snake_case）
export const tableNames = {
  users: 'users',
  businesses: 'businesses',
  tasks: 'tasks',
  customers: 'customers',
  tickets: 'tickets',
  histories: 'histories',
  accounts: 'accounts',
  persons: 'persons',
  lendings: 'lendings',
  transactions: 'transactions',
  fixedCosts: 'fixed_costs',
  categories: 'categories',
  contracts: 'contracts',
  manuals: 'manuals',
  taskHistories: 'task_histories',
  notifications: 'notifications',
  accountTransactions: 'account_transactions',
  tags: 'tags',
} as const;

// カラム名変換（camelCase → snake_case）
export function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = obj[key];
  }
  return result;
}

// カラム名変換（snake_case → camelCase）
export function toCamelCase<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result as T;
}

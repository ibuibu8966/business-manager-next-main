-- Supabase テーブル定義
-- このSQLをSupabaseのSQL Editorで実行してください

-- ユーザー
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 事業
CREATE TABLE IF NOT EXISTS businesses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_shared BOOLEAN DEFAULT FALSE
);

-- タスク
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  user_id INTEGER REFERENCES users(id),
  business_id INTEGER REFERENCES businesses(id),
  status TEXT DEFAULT '未着手',
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  show_after TIMESTAMPTZ,
  notify_hours_before INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- タスク履歴
CREATE TABLE IF NOT EXISTS task_histories (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 通知
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 顧客
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  memo TEXT
);

-- チケット
CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  customer_id INTEGER REFERENCES customers(id),
  assigned_user_id INTEGER REFERENCES users(id),
  source TEXT DEFAULT 'other',
  status TEXT DEFAULT '新規',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 顧客対応履歴
CREATE TABLE IF NOT EXISTS histories (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  ticket_id INTEGER REFERENCES tickets(id),
  content TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 社内口座
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  business_id INTEGER REFERENCES businesses(id)
);

-- 外部相手
CREATE TABLE IF NOT EXISTS persons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  memo TEXT
);

-- 貸し借り
CREATE TABLE IF NOT EXISTS lendings (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  counterparty_type TEXT,
  counterparty_id INTEGER,
  person_id INTEGER, -- legacy
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  date DATE NOT NULL,
  memo TEXT,
  returned BOOLEAN DEFAULT FALSE,
  original_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 売上・支出
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  business_id INTEGER REFERENCES businesses(id),
  account_id INTEGER REFERENCES accounts(id),
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  date DATE NOT NULL,
  memo TEXT,
  fixed_cost_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 固定費
CREATE TABLE IF NOT EXISTS fixed_costs (
  id SERIAL PRIMARY KEY,
  business_id INTEGER REFERENCES businesses(id),
  account_id INTEGER REFERENCES accounts(id),
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  day_of_month INTEGER NOT NULL,
  memo TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

-- カテゴリ
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL
);

-- 契約
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  business_id INTEGER REFERENCES businesses(id),
  name TEXT NOT NULL,
  memo TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- マニュアル
CREATE TABLE IF NOT EXISTS manuals (
  id SERIAL PRIMARY KEY,
  business_id INTEGER REFERENCES businesses(id),
  name TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ユーザー設定（LINE通知用）
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) UNIQUE,
  line_notify_token TEXT,
  notify_hours_before INTEGER DEFAULT 24
);

-- 口座取引（受取利息・運用益・振替など）
CREATE TABLE IF NOT EXISTS account_transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id),
  from_account_id INTEGER REFERENCES accounts(id),
  to_account_id INTEGER REFERENCES accounts(id),
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  date DATE NOT NULL,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 外部相手取引（純入出金）
CREATE TABLE IF NOT EXISTS person_transactions (
  id SERIAL PRIMARY KEY,
  person_id INTEGER REFERENCES persons(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  date DATE NOT NULL,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- タグ
CREATE TABLE IF NOT EXISTS tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT
);

-- チケットソース
CREATE TABLE IF NOT EXISTS ticket_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL
);

-- チケット履歴
CREATE TABLE IF NOT EXISTS ticket_histories (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 顧客履歴
CREATE TABLE IF NOT EXISTS customer_histories (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- サロン
CREATE TABLE IF NOT EXISTS salons (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- コース
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  salon_id INTEGER REFERENCES salons(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price INTEGER,
  sessions INTEGER,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- サブスクリプション（顧客のコース契約）
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id),
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active',
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 月次チェック
CREATE TABLE IF NOT EXISTS monthly_checks (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  checked BOOLEAN DEFAULT FALSE,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 貸借履歴（編集追跡用）
CREATE TABLE IF NOT EXISTS lending_histories (
  id SERIAL PRIMARY KEY,
  lending_id INTEGER REFERENCES lendings(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'archived', 'returned'
  description TEXT NOT NULL,
  changes TEXT, -- JSON形式のフィールド変更詳細
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 口座取引履歴（編集追跡用）
CREATE TABLE IF NOT EXISTS account_transaction_histories (
  id SERIAL PRIMARY KEY,
  account_transaction_id INTEGER REFERENCES account_transactions(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'archived'
  description TEXT NOT NULL,
  changes TEXT, -- JSON形式のフィールド変更詳細
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 初期データ
INSERT INTO users (name, email, password, is_admin) 
VALUES ('管理者', 'admin@example.com', 'admin123', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO categories (type, name) VALUES 
  ('income', '売上'),
  ('income', 'その他収入'),
  ('expense', '外注費'),
  ('expense', '広告費'),
  ('expense', '交通費'),
  ('expense', '消耗品'),
  ('expense', '家賃'),
  ('expense', 'サブスク'),
  ('expense', '人件費'),
  ('expense', 'その他経費')
ON CONFLICT DO NOTHING;

-- RLS (Row Level Security) を無効化（簡易版）
-- 本番では適切なRLSポリシーを設定することを推奨
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- 他のテーブルも同様に...

-- 全員に読み取り・書き込み許可（開発用）
CREATE POLICY "Allow all" ON users FOR ALL USING (true);
CREATE POLICY "Allow all" ON businesses FOR ALL USING (true);
CREATE POLICY "Allow all" ON tasks FOR ALL USING (true);
CREATE POLICY "Allow all" ON task_histories FOR ALL USING (true);
CREATE POLICY "Allow all" ON notifications FOR ALL USING (true);
CREATE POLICY "Allow all" ON customers FOR ALL USING (true);
CREATE POLICY "Allow all" ON tickets FOR ALL USING (true);
CREATE POLICY "Allow all" ON histories FOR ALL USING (true);
CREATE POLICY "Allow all" ON accounts FOR ALL USING (true);
CREATE POLICY "Allow all" ON persons FOR ALL USING (true);
CREATE POLICY "Allow all" ON lendings FOR ALL USING (true);
CREATE POLICY "Allow all" ON transactions FOR ALL USING (true);
CREATE POLICY "Allow all" ON fixed_costs FOR ALL USING (true);
CREATE POLICY "Allow all" ON categories FOR ALL USING (true);
CREATE POLICY "Allow all" ON contracts FOR ALL USING (true);
CREATE POLICY "Allow all" ON manuals FOR ALL USING (true);
CREATE POLICY "Allow all" ON user_settings FOR ALL USING (true);
CREATE POLICY "Allow all" ON account_transactions FOR ALL USING (true);
CREATE POLICY "Allow all" ON person_transactions FOR ALL USING (true);
CREATE POLICY "Allow all" ON tags FOR ALL USING (true);
CREATE POLICY "Allow all" ON ticket_sources FOR ALL USING (true);
CREATE POLICY "Allow all" ON ticket_histories FOR ALL USING (true);
CREATE POLICY "Allow all" ON customer_histories FOR ALL USING (true);
CREATE POLICY "Allow all" ON salons FOR ALL USING (true);
CREATE POLICY "Allow all" ON courses FOR ALL USING (true);
CREATE POLICY "Allow all" ON subscriptions FOR ALL USING (true);
CREATE POLICY "Allow all" ON monthly_checks FOR ALL USING (true);
CREATE POLICY "Allow all" ON lending_histories FOR ALL USING (true);
CREATE POLICY "Allow all" ON account_transaction_histories FOR ALL USING (true);

-- =====================================================
-- 貸借取引履歴機能拡張用のカラム追加（既存テーブル）
-- 既存のテーブルに対して実行してください
-- =====================================================

-- lendings テーブルに編集追跡用カラムを追加
ALTER TABLE lendings ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE lendings ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE lendings ADD COLUMN IF NOT EXISTS last_edited_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE lendings ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

-- account_transactions テーブルに編集追跡用カラムを追加
ALTER TABLE account_transactions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE account_transactions ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE account_transactions ADD COLUMN IF NOT EXISTS last_edited_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE account_transactions ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

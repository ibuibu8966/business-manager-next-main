export interface User {
    id: number;
    name: string;
    email: string;
    isAdmin: boolean;
}

export interface Business {
    id: number;
    name: string;
    description?: string;
    isShared?: boolean;
}

export interface Task {
    id: number;
    title: string;
    description?: string;
    userId: number;
    businessId?: number;
    assigneeId?: number;         // 担当者（ユーザーID）
    status: '未着手' | '進行中' | '完了';
    priority?: 'high' | 'medium' | 'low';
    dueDate?: string;
    createdAt: string;
    showAfter?: string;          // この日時まで非表示（リマインダー）
    notifyHoursBefore?: number;  // LINE通知タイミング（将来用）
    // マニュアル・チェックリスト連携
    attachedManualId?: number;      // 添付マニュアルID
    attachedChecklistId?: number;   // 元チェックリストID（テンプレート参照用）
    checklistBlocks?: ChecklistBlock[];  // タスク専用チェックリスト（コピー・編集可能）
}

export interface Customer {
    id: number;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    memo?: string;  // 旧フィールド（移行用に残す）
    // 新規追加フィールド
    tags?: string[];
    discordName?: string;
    lineName?: string;
    paypalId?: string;
    univapayId?: string;
    memberpayId?: string;
    robotpayId?: string;  // ロボットペイID
    note?: string;  // 備考（決済免除などの特記）
    isArchived?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface Ticket {
    id: number;
    title: string;
    description?: string;
    customerId?: number;
    assignedUserId?: number;
    source: string;  // カスタム経路対応
    status: '新規' | '対応中' | '保留' | '完了';
    createdAt: string;
}

// チケット経路マスタ
export interface TicketSource {
    id: number;
    name: string;
    key: string;
}

// チケット履歴
export interface TicketHistory {
    id: number;
    ticketId: number;
    action: 'created' | 'status' | 'comment' | 'memo' | 'updated';
    description: string;
    userId: number;
    createdAt: string;
}

export interface History {
    id: number;
    customerId: number;
    ticketId?: number;
    content: string;
    userId: number;
    createdAt: string;
}

export interface Account {
    id: number;
    name: string;
    businessId?: number;
    balance?: number;         // 残高（手動入力）
    tags?: string[];          // タグ（複数可）
    isArchived?: boolean;     // アーカイブフラグ
}

export interface Person {
    id: number;
    name: string;
    memo?: string;
    businessId?: number;      // 事業紐づけ
    tags?: string[];          // タグ（複数可）
    isArchived?: boolean;     // アーカイブフラグ
}

export interface Lending {
    id: number;
    accountId: number;
    counterpartyType?: 'account' | 'person';
    counterpartyId?: number;
    personId?: number; // legacy
    type: 'lend' | 'borrow' | 'return';
    amount: number;
    date: string;
    memo?: string;
    returned?: boolean;
    originalId?: number;
    createdAt: string;
    // 編集履歴追跡用
    isArchived?: boolean;
    createdByUserId?: number;
    lastEditedByUserId?: number;
    lastEditedAt?: string;
}

export interface Transaction {
    id: number;
    type: 'income' | 'expense';
    businessId?: number;
    accountId?: number;
    category: string;
    amount: number;
    date: string;
    memo?: string;
    fixedCostId?: number;
    createdAt: string;
}

export interface FixedCost {
    id: number;
    businessId: number;
    accountId?: number;
    category: string;
    amount: number;
    dayOfMonth: number;
    memo?: string;
    isActive: boolean;
}

export interface Category {
    id: number;
    type: 'income' | 'expense';
    name: string;
}

export interface Contract {
    id: number;
    businessId: number;
    name: string;
    memo?: string;
    fileName?: string;
    createdAt: string;
}

export interface Manual {
    id: number;
    businessId: number;
    name: string;
    type: 'pdf' | 'url';           // PDF or URL
    content?: string;              // URL用
    fileUrl?: string;              // PDF用（Supabase Storage URL）
    filePath?: string;             // 削除用パス
    fileName?: string;             // 元ファイル名
    fileSize?: number;             // バイト数
    description?: string;          // 説明文
    isArchived?: boolean;          // アーカイブフラグ
    createdAt: string;
    updatedAt?: string;
}

// タスク更新履歴
export interface TaskHistory {
    id: number;
    taskId: number;
    action: 'created' | 'status' | 'memo' | 'reminder' | 'assignee' | 'deleted' | 'updated';
    description: string;
    userId: number;
    createdAt: string;
}

// 通知
export interface Notification {
    id: number;
    type: 'task_update' | 'task_overdue' | 'task_reminder';
    taskId: number;
    userId: number;
    message: string;
    isRead: boolean;
    createdAt: string;
}

// 口座取引（移転・利息・運用益・純入出金）
export interface AccountTransaction {
    id: number;
    type: 'transfer' | 'interest' | 'investment_gain' | 'deposit' | 'withdrawal';
    fromAccountId?: number;   // 移転元口座（transferの場合）
    toAccountId?: number;     // 移転先口座（transferの場合）
    accountId?: number;       // 対象口座（interest/investment_gainの場合）
    amount: number;
    date: string;
    memo?: string;
    createdAt: string;
    // 編集履歴追跡用
    isArchived?: boolean;
    createdByUserId?: number;
    lastEditedByUserId?: number;
    lastEditedAt?: string;
    // 管理会計連携用
    linkedTransactionId?: number;  // 管理会計のtransactionsとの紐付け
}

// 外部相手取引（純入出金）
export interface PersonTransaction {
    id: number;
    type: 'deposit' | 'withdrawal';
    // deposit = 外部相手にお金が入る（あなたが渡す）→ あなたの純資産減少
    // withdrawal = 外部相手からお金が出る（あなたが受け取る）→ あなたの純資産増加
    personId: number;
    amount: number;        // 常に正の値
    date: string;
    memo?: string;
    createdAt: string;
}

// タグマスタ
export interface Tag {
    id: number;
    name: string;
    color?: string;
}

// 顧客履歴（メモ等）
export interface CustomerHistory {
    id: number;
    customerId: number;
    action: 'created' | 'updated' | 'memo' | 'tag_added' | 'tag_removed';
    description: string;
    userId: number;
    createdAt: string;
}

// 貸借履歴（編集追跡用）
export interface LendingHistory {
    id: number;
    lendingId: number;
    action: 'created' | 'updated' | 'archived' | 'returned';
    description: string;
    changes?: string; // JSON形式のフィールド変更詳細
    userId: number;
    createdAt: string;
}

// 口座取引履歴（編集追跡用）
export interface AccountTransactionHistory {
    id: number;
    accountTransactionId: number;
    action: 'created' | 'updated' | 'archived';
    description: string;
    changes?: string; // JSON形式のフィールド変更詳細
    userId: number;
    createdAt: string;
}

// サロン
export interface Salon {
    id: number;
    name: string;
}

// コース
export interface Course {
    id: number;
    salonId: number;
    name: string;
    discordRoleName?: string;  // 付与するDiscordロール名
    paymentService: 'paypal' | 'univapay' | 'memberpay' | 'robotpay';  // 決済サービス
    price?: number;
}

// 顧客の加入情報
export interface Subscription {
    id: number;
    customerId: number;
    courseId: number;
    paymentService: 'paypal' | 'univapay' | 'memberpay' | 'robotpay';  // 決済サービス（コースから自動設定）
    isExempt: boolean;        // 決済免除フラグ
    isActive: boolean;        // アクティブ/退会
    withdrawnAt?: string;     // 退会日
    createdAt: string;
}

// 月次チェック
export interface MonthlyCheck {
    id: number;
    yearMonth: string;        // '2025-01'
    customerId: number;
    courseId: number;
    subscriptionId: number;
    paymentConfirmed: boolean;  // ✓決済確認
    roleGranted: boolean;       // ✓ロール付与
    createdAt: string;
    updatedAt?: string;
}

// チェックリスト
export interface Checklist {
    id: number;
    businessId: number;
    title: string;
    description?: string;
    blocks: ChecklistBlock[];
    isArchived?: boolean;
    createdAt: string;
    updatedAt?: string;
}

export interface ChecklistBlock {
    id: string;
    type: 'paragraph' | 'checkbox' | 'heading-one' | 'heading-two' | 'heading-three'
        | 'bulleted-list' | 'numbered-list' | 'quote' | 'divider' | 'code-block' | 'callout';
    checked?: boolean;
    variant?: 'info' | 'warning' | 'error' | 'success';
    children: InlineContent[];
}

export interface InlineContent {
    text: string;
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    code?: boolean;
    link?: string;
}

// Database interface
export interface Database {
    users: User[];
    businesses: Business[];
    tasks: Task[];
    customers: Customer[];
    tickets: Ticket[];
    histories: History[];
    accounts: Account[];
    persons: Person[];
    lendings: Lending[];
    transactions: Transaction[];
    fixedCosts: FixedCost[];
    categories: Category[];
    contracts: Contract[];
    manuals: Manual[];
    taskHistories: TaskHistory[];
    notifications: Notification[];
    accountTransactions: AccountTransaction[];
    personTransactions: PersonTransaction[];
    tags: Tag[];
    ticketSources: TicketSource[];
    ticketHistories: TicketHistory[];
    // 新規追加
    customerHistories: CustomerHistory[];
    salons: Salon[];
    courses: Course[];
    subscriptions: Subscription[];
    monthlyChecks: MonthlyCheck[];
    // 貸借・口座取引履歴
    lendingHistories: LendingHistory[];
    accountTransactionHistories: AccountTransactionHistory[];
    // チェックリスト
    checklists: Checklist[];
}


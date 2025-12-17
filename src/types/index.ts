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
    status: '未着手' | '進行中' | '完了';
    priority?: 'high' | 'medium' | 'low';
    dueDate?: string;
    createdAt: string;
    showAfter?: string;          // この日時まで非表示（リマインダー）
    notifyHoursBefore?: number;  // LINE通知タイミング（将来用）
}

export interface Customer {
    id: number;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    memo?: string;
}

export interface Ticket {
    id: number;
    title: string;
    description?: string;
    customerId?: number;
    assignedUserId?: number;
    source: 'phone' | 'email' | 'web' | 'other';
    status: '新規' | '対応中' | '保留' | '完了';
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
}

export interface Person {
    id: number;
    name: string;
    memo?: string;
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
}

export interface Transaction {
    id: number;
    type: 'income' | 'expense';
    businessId: number;
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
    content?: string;
    createdAt: string;
}

// タスク更新履歴
export interface TaskHistory {
    id: number;
    taskId: number;
    action: 'created' | 'status' | 'memo' | 'reminder' | 'assignee';
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
}


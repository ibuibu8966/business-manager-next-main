'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { AppLayout } from '@/components/AppLayout';
import { useDatabase, genId } from '@/lib/db';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Customer, Salon, Course, Subscription, MonthlyCheck } from '@/types';

type ViewMode = 'browse' | 'payment';
type PaymentStatusFilter = 'all' | 'unchecked' | 'payment_only' | 'completed' | 'exempt';

function CustomersContent() {
    const { user } = useAuth();
    const { db, updateCollection } = useDatabase();

    // 表示モード
    const [viewMode, setViewMode] = useState<ViewMode>('browse');

    // 顧客閲覧モード用
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [search, setSearch] = useState('');
    const [filterTag, setFilterTag] = useState('');
    const [newCustomerTags, setNewCustomerTags] = useState<string[]>([]);
    const [newTagInput, setNewTagInput] = useState('');

    // サロン/コース管理モーダル
    const [salonModalOpen, setSalonModalOpen] = useState(false);
    const [editingSalon, setEditingSalon] = useState<Salon | null>(null);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [courseModalOpen, setCourseModalOpen] = useState(false);
    const [selectedSalonId, setSelectedSalonId] = useState<number | null>(null);

    // 加入コース追加モーダル
    const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
    const [subscriptionCustomerId, setSubscriptionCustomerId] = useState<number | null>(null);

    // 決済確認モード用
    const [selectedYearMonth, setSelectedYearMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatusFilter>('all');
    const [paymentSalonFilter, setPaymentSalonFilter] = useState<number | ''>('');
    const [paymentCourseFilter, setPaymentCourseFilter] = useState<number | ''>('');
    const [paymentServiceFilter, setPaymentServiceFilter] = useState<string>('');
    const [showWithdrawn, setShowWithdrawn] = useState(false);
    const [expandedCustomers, setExpandedCustomers] = useState<Set<number>>(new Set());

    if (!db) return <div>Loading...</div>;

    // ヘルパー関数
    const getLastMemo = (customerId: number) => {
        const memos = (db.customerHistories || [])
            .filter(h => h.customerId === customerId && h.action === 'memo')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return memos[0];
    };

    const getLastUpdater = (customerId: number) => {
        const lastHistory = (db.customerHistories || [])
            .filter(h => h.customerId === customerId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        return lastHistory ? db.users.find(u => u.id === lastHistory.userId) : null;
    };

    const getCustomerSubscriptions = (customerId: number) => {
        return (db.subscriptions || []).filter(s => s.customerId === customerId);
    };

    const getCourse = (courseId: number) => {
        return (db.courses || []).find(c => c.id === courseId);
    };

    const getSalon = (salonId: number) => {
        return (db.salons || []).find(s => s.id === salonId);
    };

    const getPaymentServiceLabel = (service: string) => {
        const labels: Record<string, string> = {
            paypal: 'Paypal',
            univapay: 'Univapay',
            memberpay: 'メンバーペイ',
            robotpay: 'ロボットペイ'
        };
        return labels[service] || service;
    };

    // 顧客の決済IDを取得
    const getCustomerPaymentId = (customer: Customer, paymentService: string) => {
        switch (paymentService) {
            case 'paypal': return customer.paypalId;
            case 'univapay': return customer.univapayId;
            case 'memberpay': return customer.memberpayId;
            case 'robotpay': return customer.robotpayId;
            default: return undefined;
        }
    };

    // 顧客フィルタリング
    let customers = [...db.customers];
    if (search) {
        const searchLower = search.toLowerCase();
        customers = customers.filter(c =>
            c.name.toLowerCase().includes(searchLower) ||
            c.email?.toLowerCase().includes(searchLower) ||
            c.phone?.includes(search) ||
            c.discordName?.toLowerCase().includes(searchLower) ||
            c.lineName?.toLowerCase().includes(searchLower)
        );
    }
    if (filterTag) {
        customers = customers.filter(c => c.tags?.includes(filterTag));
    }

    // 顧客モーダル
    const openModal = (customer?: Customer) => {
        setEditingCustomer(customer || null);
        setNewCustomerTags(customer?.tags || []);
        setModalOpen(true);
    };

    const saveCustomer = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        // 新規タグをtagsコレクションに追加
        newCustomerTags.forEach(tagName => {
            if (!db.tags.some(t => t.name === tagName)) {
                updateCollection('tags', items => [...items, {
                    id: genId(items),
                    name: tagName,
                    color: '#6366f1'
                }]);
            }
        });

        const customerData = {
            name: formData.get('name') as string,
            email: formData.get('email') as string || undefined,
            phone: formData.get('phone') as string || undefined,
            address: formData.get('address') as string || undefined,
            discordName: formData.get('discordName') as string || undefined,
            lineName: formData.get('lineName') as string || undefined,
            paypalId: formData.get('paypalId') as string || undefined,
            univapayId: formData.get('univapayId') as string || undefined,
            memberpayId: formData.get('memberpayId') as string || undefined,
            robotpayId: formData.get('robotpayId') as string || undefined,
            note: formData.get('note') as string || undefined,
            tags: newCustomerTags,
            updatedAt: new Date().toISOString(),
        };

        if (editingCustomer) {
            updateCollection('customers', items =>
                items.map(c => c.id === editingCustomer.id ? { ...c, ...customerData } : c)
            );
            // 更新履歴を追加
            updateCollection('customerHistories', items => [...items, {
                id: genId(items),
                customerId: editingCustomer.id,
                action: 'updated' as const,
                description: '顧客情報を更新',
                userId: user?.id || 1,
                createdAt: new Date().toISOString()
            }]);
        } else {
            const newId = genId(db.customers);
            updateCollection('customers', items => [
                ...items,
                {
                    id: newId,
                    ...customerData,
                    createdAt: new Date().toISOString()
                }
            ]);
            // 作成履歴を追加
            updateCollection('customerHistories', items => [...items, {
                id: genId(items),
                customerId: newId,
                action: 'created' as const,
                description: '顧客を作成',
                userId: user?.id || 1,
                createdAt: new Date().toISOString()
            }]);
        }
        setModalOpen(false);
        setNewCustomerTags([]);
        setNewTagInput('');
    };

    const deleteCustomer = (id: number) => {
        if (confirm('この顧客を削除しますか？関連する加入情報も削除されます。')) {
            updateCollection('customers', items => items.filter(c => c.id !== id));
            updateCollection('subscriptions', items => items.filter(s => s.customerId !== id));
            updateCollection('customerHistories', items => items.filter(h => h.customerId !== id));
            updateCollection('monthlyChecks', items => items.filter(m => m.customerId !== id));
        }
    };

    // サロン管理
    const saveSalon = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const name = formData.get('name') as string;

        if (editingSalon) {
            updateCollection('salons', items =>
                items.map(s => s.id === editingSalon.id ? { ...s, name } : s)
            );
        } else {
            updateCollection('salons', items => [...items, {
                id: genId(items),
                name
            }]);
        }
        setEditingSalon(null);
        form.reset();
    };

    const deleteSalon = (id: number) => {
        const courses = (db.courses || []).filter(c => c.salonId === id);
        if (courses.length > 0) {
            alert('このサロンにはコースが存在するため削除できません。先にコースを削除してください。');
            return;
        }
        if (confirm('このサロンを削除しますか？')) {
            updateCollection('salons', items => items.filter(s => s.id !== id));
        }
    };

    // コース管理
    const openCourseModal = (salonId: number, course?: Course) => {
        setSelectedSalonId(salonId);
        setEditingCourse(course || null);
        setCourseModalOpen(true);
    };

    const saveCourse = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const courseData = {
            salonId: selectedSalonId!,
            name: formData.get('name') as string,
            discordRoleName: formData.get('discordRoleName') as string || undefined,
            paymentService: (formData.get('paymentService') as 'paypal' | 'univapay' | 'memberpay' | 'robotpay') || 'paypal',
            price: formData.get('price') ? parseInt(formData.get('price') as string) : undefined,
        };

        if (editingCourse) {
            updateCollection('courses', items =>
                items.map(c => c.id === editingCourse.id ? { ...c, ...courseData } : c)
            );
        } else {
            updateCollection('courses', items => [...items, {
                id: genId(items),
                ...courseData
            }]);
        }
        setCourseModalOpen(false);
        setEditingCourse(null);
    };

    const deleteCourse = (id: number) => {
        const subs = (db.subscriptions || []).filter(s => s.courseId === id);
        if (subs.length > 0) {
            alert('このコースに加入している顧客が存在するため削除できません。');
            return;
        }
        if (confirm('このコースを削除しますか？')) {
            updateCollection('courses', items => items.filter(c => c.id !== id));
        }
    };

    // 加入コース管理
    const openSubscriptionModal = (customerId: number) => {
        setSubscriptionCustomerId(customerId);
        setSubscriptionModalOpen(true);
    };

    const saveSubscription = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);

        const courseId = parseInt(formData.get('courseId') as string);
        const course = getCourse(courseId);
        const paymentService = course?.paymentService || 'paypal';

        updateCollection('subscriptions', items => [...items, {
            id: genId(items),
            customerId: subscriptionCustomerId!,
            courseId,
            paymentService,
            isExempt: formData.get('isExempt') === 'on',
            isActive: true,
            createdAt: new Date().toISOString()
        }]);
        setSubscriptionModalOpen(false);
    };

    // 決済確認モード
    const startMonthlyCheck = () => {
        const activeSubscriptions = (db.subscriptions || []).filter(s => s.isActive);
        const existingChecks = (db.monthlyChecks || []).filter(m => m.yearMonth === selectedYearMonth);

        let addedCount = 0;
        activeSubscriptions.forEach(sub => {
            const exists = existingChecks.some(m => m.subscriptionId === sub.id);
            if (!exists) {
                updateCollection('monthlyChecks', items => [...items, {
                    id: genId(items),
                    yearMonth: selectedYearMonth,
                    customerId: sub.customerId,
                    courseId: sub.courseId,
                    subscriptionId: sub.id,
                    paymentConfirmed: false,
                    roleGranted: false,
                    createdAt: new Date().toISOString()
                }]);
                addedCount++;
            }
        });

        alert(`${selectedYearMonth}のチェックを開始しました。${addedCount}件のチェック項目を追加しました。`);
    };

    const togglePaymentConfirmed = (checkId: number) => {
        updateCollection('monthlyChecks', items =>
            items.map(m => m.id === checkId ? {
                ...m,
                paymentConfirmed: !m.paymentConfirmed,
                updatedAt: new Date().toISOString()
            } : m)
        );
    };

    const toggleRoleGranted = (checkId: number) => {
        updateCollection('monthlyChecks', items =>
            items.map(m => m.id === checkId ? {
                ...m,
                roleGranted: !m.roleGranted,
                updatedAt: new Date().toISOString()
            } : m)
        );
    };

    // 決済確認モードのデータ
    const monthlyChecks = (db.monthlyChecks || []).filter(m => m.yearMonth === selectedYearMonth);

    // フィルタリング
    let filteredChecks = monthlyChecks.map(check => {
        const customer = db.customers.find(c => c.id === check.customerId);
        const subscription = (db.subscriptions || []).find(s => s.id === check.subscriptionId);
        const course = getCourse(check.courseId);
        const salon = course ? getSalon(course.salonId) : null;
        return { check, customer, subscription, course, salon };
    }).filter(item => item.customer && item.subscription && item.course);

    // 退会者フィルター
    if (!showWithdrawn) {
        filteredChecks = filteredChecks.filter(item => item.subscription?.isActive);
    }

    // サロンフィルター
    if (paymentSalonFilter) {
        filteredChecks = filteredChecks.filter(item => item.course?.salonId === paymentSalonFilter);
    }

    // コースフィルター
    if (paymentCourseFilter) {
        filteredChecks = filteredChecks.filter(item => item.course?.id === paymentCourseFilter);
    }

    // 決済サービスフィルター
    if (paymentServiceFilter) {
        filteredChecks = filteredChecks.filter(item => item.subscription?.paymentService === paymentServiceFilter);
    }

    // ステータスフィルター
    if (paymentStatusFilter === 'unchecked') {
        filteredChecks = filteredChecks.filter(item => !item.check.paymentConfirmed && !item.check.roleGranted);
    } else if (paymentStatusFilter === 'payment_only') {
        filteredChecks = filteredChecks.filter(item => item.check.paymentConfirmed && !item.check.roleGranted);
    } else if (paymentStatusFilter === 'completed') {
        filteredChecks = filteredChecks.filter(item => item.check.paymentConfirmed && item.check.roleGranted);
    } else if (paymentStatusFilter === 'exempt') {
        filteredChecks = filteredChecks.filter(item => item.subscription?.isExempt);
    }

    // 進捗計算
    const totalChecks = monthlyChecks.length;
    const completedChecks = monthlyChecks.filter(m => m.paymentConfirmed && m.roleGranted).length;
    const progressPercent = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;

    // 顧客ごとにグループ化
    const groupedByCustomer = filteredChecks.reduce((acc, item) => {
        const customerId = item.customer!.id;
        if (!acc[customerId]) {
            acc[customerId] = {
                customer: item.customer!,
                checks: []
            };
        }
        acc[customerId].checks.push(item);
        return acc;
    }, {} as Record<number, { customer: Customer; checks: typeof filteredChecks }>);

    const customerGroups = Object.values(groupedByCustomer);

    // 展開状態の初期化（初回のみ全展開）
    const initializeExpandedState = () => {
        if (expandedCustomers.size === 0 && customerGroups.length > 0) {
            setExpandedCustomers(new Set(customerGroups.map(g => g.customer.id)));
        }
    };
    // useEffectの代わりにレンダリング時に初期化
    if (expandedCustomers.size === 0 && customerGroups.length > 0) {
        setTimeout(() => setExpandedCustomers(new Set(customerGroups.map(g => g.customer.id))), 0);
    }

    const toggleCustomerExpand = (customerId: number) => {
        setExpandedCustomers(prev => {
            const newSet = new Set(prev);
            if (newSet.has(customerId)) {
                newSet.delete(customerId);
            } else {
                newSet.add(customerId);
            }
            return newSet;
        });
    };

    // 顧客の進捗状況を取得
    const getCustomerProgress = (checks: typeof filteredChecks) => {
        const total = checks.length;
        const completed = checks.filter(c => c.check.paymentConfirmed && c.check.roleGranted).length;
        if (completed === 0) return '未決済';
        if (completed === total) return '完了';
        return '一部未決済';
    };

    const getProgressBadgeStyle = (progress: string) => {
        switch (progress) {
            case '完了': return { backgroundColor: 'var(--success)', color: 'white' };
            case '未決済': return { backgroundColor: 'var(--danger)', color: 'white' };
            default: return { backgroundColor: '#eab308', color: 'white' };
        }
    };

    // 年月選択肢の生成
    const generateYearMonthOptions = () => {
        const options = [];
        const now = new Date();
        for (let i = -12; i <= 3; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const label = `${date.getFullYear()}年${date.getMonth() + 1}月`;
            options.push({ value, label });
        }
        return options;
    };

    return (
        <AppLayout title="顧客管理">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h3>顧客管理</h3>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <Button
                            variant={viewMode === 'browse' ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={() => setViewMode('browse')}
                        >
                            顧客閲覧
                        </Button>
                        <Button
                            variant={viewMode === 'payment' ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={() => setViewMode('payment')}
                        >
                            決済確認
                        </Button>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {viewMode === 'browse' && (
                        <Button onClick={() => openModal()}>+ 新規顧客</Button>
                    )}
                    <Button variant="secondary" onClick={() => setSalonModalOpen(true)}>
                        サロン/コース管理
                    </Button>
                </div>
            </div>

            {viewMode === 'browse' ? (
                <>
                    {/* 検索とフィルター */}
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <div className="search-box" style={{ flex: 1, minWidth: '200px' }}>
                            <input
                                placeholder="検索（名前、メール、電話、Discord、LINE）..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* タグフィルター */}
                    {db.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <Button
                                variant={filterTag === '' ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setFilterTag('')}
                            >
                                全て
                            </Button>
                            {db.tags.map(tag => (
                                <Button
                                    key={tag.id}
                                    variant={filterTag === tag.name ? 'primary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setFilterTag(tag.name)}
                                    style={tag.color ? { borderColor: tag.color } : {}}
                                >
                                    {tag.name}
                                </Button>
                            ))}
                        </div>
                    )}

                    {/* 顧客一覧テーブル */}
                    <div className="data-table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>顧客名</th>
                                    <th>Discord</th>
                                    <th>LINE</th>
                                    <th>タグ</th>
                                    <th>加入コース</th>
                                    <th>最終メモ</th>
                                    <th>操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {customers.map(customer => {
                                    const lastMemo = getLastMemo(customer.id);
                                    const subscriptions = getCustomerSubscriptions(customer.id);
                                    return (
                                        <tr key={customer.id}>
                                            <td>
                                                <Link
                                                    href={`/customers/${customer.id}`}
                                                    style={{ color: 'var(--primary)', textDecoration: 'none' }}
                                                >
                                                    {customer.name}
                                                </Link>
                                            </td>
                                            <td>{customer.discordName || '-'}</td>
                                            <td>{customer.lineName || '-'}</td>
                                            <td>
                                                {customer.tags && customer.tags.length > 0 ? (
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                        {customer.tags.map(tag => (
                                                            <span key={tag} className="badge badge-primary" style={{ fontSize: '11px' }}>
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td>
                                                {subscriptions.filter(s => s.isActive).length > 0 ? (
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                        {subscriptions.filter(s => s.isActive).slice(0, 2).map(sub => {
                                                            const course = getCourse(sub.courseId);
                                                            return course ? (
                                                                <span key={sub.id} className="badge badge-secondary" style={{ fontSize: '11px' }}>
                                                                    {course.name}
                                                                </span>
                                                            ) : null;
                                                        })}
                                                        {subscriptions.filter(s => s.isActive).length > 2 && (
                                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                                +{subscriptions.filter(s => s.isActive).length - 2}
                                                            </span>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => openSubscriptionModal(customer.id)}
                                                            style={{ padding: '2px 6px', fontSize: '11px' }}
                                                        >
                                                            +
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => openSubscriptionModal(customer.id)}
                                                        style={{ fontSize: '11px' }}
                                                    >
                                                        + 追加
                                                    </Button>
                                                )}
                                            </td>
                                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {lastMemo?.description || '-'}
                                            </td>
                                            <td className="actions-cell">
                                                <Button size="sm" variant="secondary" onClick={() => openModal(customer)}>編集</Button>
                                                <Button size="sm" variant="danger" onClick={() => deleteCustomer(customer.id)}>削除</Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {customers.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-state-icon">&#x1F465;</div>
                                <div className="empty-state-text">顧客がいません</div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {/* 決済確認モード */}
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <label>対象月:</label>
                                <select
                                    value={selectedYearMonth}
                                    onChange={e => setSelectedYearMonth(e.target.value)}
                                    style={{ padding: '0.5rem' }}
                                >
                                    {generateYearMonthOptions().map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                            <Button onClick={startMonthlyCheck}>
                                {selectedYearMonth.split('-')[1]}月のチェックを開始
                            </Button>
                        </div>

                        {/* フィルター */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <select
                                value={paymentStatusFilter}
                                onChange={e => setPaymentStatusFilter(e.target.value as PaymentStatusFilter)}
                                style={{ padding: '0.5rem' }}
                            >
                                <option value="all">すべて</option>
                                <option value="unchecked">未チェック</option>
                                <option value="payment_only">決済確認済み・ロール未付与</option>
                                <option value="completed">完了</option>
                                <option value="exempt">免除対象</option>
                            </select>
                            <select
                                value={paymentSalonFilter}
                                onChange={e => setPaymentSalonFilter(e.target.value ? parseInt(e.target.value) : '')}
                                style={{ padding: '0.5rem' }}
                            >
                                <option value="">サロン: 全て</option>
                                {(db.salons || []).map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <select
                                value={paymentCourseFilter}
                                onChange={e => setPaymentCourseFilter(e.target.value ? parseInt(e.target.value) : '')}
                                style={{ padding: '0.5rem' }}
                            >
                                <option value="">コース: 全て</option>
                                {(db.courses || []).map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            <select
                                value={paymentServiceFilter}
                                onChange={e => setPaymentServiceFilter(e.target.value)}
                                style={{ padding: '0.5rem' }}
                            >
                                <option value="">決済: 全て</option>
                                <option value="paypal">Paypal</option>
                                <option value="univapay">Univapay</option>
                                <option value="memberpay">メンバーペイ</option>
                                <option value="robotpay">ロボットペイ</option>
                            </select>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <input
                                    type="checkbox"
                                    checked={showWithdrawn}
                                    onChange={e => setShowWithdrawn(e.target.checked)}
                                />
                                退会者も表示
                            </label>
                        </div>

                        {/* 進捗バー */}
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span>進捗</span>
                                <span>{completedChecks}/{totalChecks}件完了</span>
                            </div>
                            <div style={{
                                height: '8px',
                                backgroundColor: 'var(--border-color)',
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    height: '100%',
                                    width: `${progressPercent}%`,
                                    backgroundColor: 'var(--success)',
                                    transition: 'width 0.3s'
                                }} />
                            </div>
                        </div>
                    </div>

                    {/* チェックリスト（アコーディオン形式） */}
                    <div className="data-table-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}></th>
                                    <th>顧客名 / 決済会社</th>
                                    <th>Discord / 決済ID</th>
                                    <th>コース</th>
                                    <th>進捗 / 確認</th>
                                    <th style={{ minWidth: '200px' }}>メモ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {customerGroups.map(({ customer, checks }) => {
                                    const isExpanded = expandedCustomers.has(customer.id);
                                    const progress = getCustomerProgress(checks);
                                    const hasExempt = checks.some(c => c.subscription?.isExempt);

                                    return (
                                        <Fragment key={customer.id}>
                                            {/* 親行（顧客単位） */}
                                            <tr
                                                onClick={() => toggleCustomerExpand(customer.id)}
                                                style={{
                                                    cursor: 'pointer',
                                                    backgroundColor: hasExempt ? 'rgba(234, 179, 8, 0.05)' : undefined
                                                }}
                                            >
                                                <td style={{ textAlign: 'center', fontSize: '14px' }}>
                                                    {isExpanded ? '▼' : '▶'}
                                                </td>
                                                <td>
                                                    <Link
                                                        href={`/customers/${customer.id}`}
                                                        style={{ color: 'var(--primary)', textDecoration: 'none' }}
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        {customer.name}
                                                    </Link>
                                                </td>
                                                <td>{customer.discordName || '-'}</td>
                                                <td>{checks.length}件</td>
                                                <td>
                                                    <span className="badge" style={getProgressBadgeStyle(progress)}>
                                                        {progress}
                                                    </span>
                                                    {hasExempt && <span className="badge" style={{ backgroundColor: '#eab308', marginLeft: '4px' }}>免除あり</span>}
                                                </td>
                                                <td style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                                                    {customer.note || '-'}
                                                </td>
                                            </tr>

                                            {/* 子行（コース単位） */}
                                            {isExpanded && checks.map(({ check, subscription, course, salon }) => (
                                                <tr
                                                    key={`child-${check.id}`}
                                                    style={{
                                                        backgroundColor: subscription?.isExempt ? 'rgba(234, 179, 8, 0.1)' : 'var(--bg-secondary)'
                                                    }}
                                                >
                                                    <td style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)' }}>└</td>
                                                    {/* 決済会社 */}
                                                    <td>
                                                        <span style={{ fontSize: '12px' }}>
                                                            {getPaymentServiceLabel(course?.paymentService || subscription!.paymentService)}
                                                        </span>
                                                    </td>
                                                    {/* 決済ID */}
                                                    <td>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                            {getCustomerPaymentId(customer, course?.paymentService || subscription!.paymentService) || '-'}
                                                        </span>
                                                    </td>
                                                    {/* コース */}
                                                    <td>
                                                        <span className="badge badge-secondary" style={{ fontSize: '11px' }}>
                                                            {salon?.name} / {course!.name}
                                                        </span>
                                                        {subscription?.isExempt && (
                                                            <span className="badge" style={{ backgroundColor: '#eab308', marginLeft: '4px', fontSize: '10px' }}>免除</span>
                                                        )}
                                                    </td>
                                                    {/* 備考（チェックボックス） */}
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '12px', cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={check.paymentConfirmed}
                                                                    onChange={() => togglePaymentConfirmed(check.id)}
                                                                    onClick={e => e.stopPropagation()}
                                                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                                />
                                                                決済
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '12px', cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={check.roleGranted}
                                                                    onChange={() => toggleRoleGranted(check.id)}
                                                                    onClick={e => e.stopPropagation()}
                                                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                                />
                                                                ロール
                                                            </label>
                                                        </div>
                                                    </td>
                                                    {/* メモ */}
                                                    <td style={{ fontSize: '12px', whiteSpace: 'pre-wrap', minWidth: '200px' }}>
                                                        {customer.note || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {customerGroups.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-state-icon">&#x1F4CB;</div>
                                <div className="empty-state-text">
                                    {monthlyChecks.length === 0
                                        ? '月次チェックを開始してください'
                                        : 'フィルター条件に一致するデータがありません'}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* 顧客追加/編集モーダル */}
            <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setNewCustomerTags([]); setNewTagInput(''); }} title={editingCustomer ? '顧客編集' : '新規顧客'}>
                <form onSubmit={saveCustomer}>
                    <div className="form-group">
                        <label>顧客名 *</label>
                        <input name="name" defaultValue={editingCustomer?.name} required />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>電話番号</label>
                            <input name="phone" type="tel" defaultValue={editingCustomer?.phone} />
                        </div>
                        <div className="form-group">
                            <label>メールアドレス</label>
                            <input name="email" type="email" defaultValue={editingCustomer?.email} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>住所</label>
                        <input name="address" defaultValue={editingCustomer?.address} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>Discord名</label>
                            <input name="discordName" defaultValue={editingCustomer?.discordName} />
                        </div>
                        <div className="form-group">
                            <label>LINE名</label>
                            <input name="lineName" defaultValue={editingCustomer?.lineName} />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group">
                            <label>Paypal ID</label>
                            <input name="paypalId" defaultValue={editingCustomer?.paypalId} />
                        </div>
                        <div className="form-group">
                            <label>Univapay ID</label>
                            <input name="univapayId" defaultValue={editingCustomer?.univapayId} />
                        </div>
                        <div className="form-group">
                            <label>メンバーペイ ID</label>
                            <input name="memberpayId" defaultValue={editingCustomer?.memberpayId} />
                        </div>
                        <div className="form-group">
                            <label>ロボットペイ ID</label>
                            <input name="robotpayId" defaultValue={editingCustomer?.robotpayId} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>備考（決済免除など）</label>
                        <textarea name="note" defaultValue={editingCustomer?.note} rows={2} />
                    </div>
                    <div className="form-group">
                        <label>タグ</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                            {newCustomerTags.map(tag => (
                                <span key={tag} className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => setNewCustomerTags(prev => prev.filter(t => t !== tag))}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                                    >
                                        x
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={newTagInput}
                                onChange={e => setNewTagInput(e.target.value)}
                                placeholder="タグ名を入力"
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (newTagInput.trim() && !newCustomerTags.includes(newTagInput.trim())) {
                                            setNewCustomerTags(prev => [...prev, newTagInput.trim()]);
                                            setNewTagInput('');
                                        }
                                    }
                                }}
                                style={{ flex: 1 }}
                            />
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                    if (newTagInput.trim() && !newCustomerTags.includes(newTagInput.trim())) {
                                        setNewCustomerTags(prev => [...prev, newTagInput.trim()]);
                                        setNewTagInput('');
                                    }
                                }}
                            >
                                追加
                            </Button>
                        </div>
                        {db.tags.length > 0 && (
                            <div style={{ marginTop: '8px' }}>
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>既存タグから選択:</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {db.tags
                                        .filter(t => !newCustomerTags.includes(t.name))
                                        .map(tag => (
                                            <button
                                                key={tag.id}
                                                type="button"
                                                className="badge"
                                                style={{ backgroundColor: tag.color || '#6366f1', cursor: 'pointer', border: 'none' }}
                                                onClick={() => setNewCustomerTags(prev => [...prev, tag.name])}
                                            >
                                                + {tag.name}
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* サロン/コース管理モーダル */}
            <Modal isOpen={salonModalOpen} onClose={() => { setSalonModalOpen(false); setEditingSalon(null); }} title="サロン・コース管理" size="lg">
                <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                    {(db.salons || []).map(salon => (
                        <div key={salon.id} style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <h4 style={{ margin: 0 }}>{salon.name}</h4>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <Button size="sm" variant="secondary" onClick={() => setEditingSalon(salon)}>編集</Button>
                                    <Button size="sm" variant="danger" onClick={() => deleteSalon(salon.id)}>削除</Button>
                                </div>
                            </div>
                            <div style={{ marginLeft: '1rem' }}>
                                {(db.courses || []).filter(c => c.salonId === salon.id).map(course => (
                                    <div key={course.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {course.name}
                                                <span className="badge badge-secondary" style={{ fontSize: '10px' }}>
                                                    {getPaymentServiceLabel(course.paymentService || 'paypal')}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                                ロール: {course.discordRoleName || '-'}
                                                {course.price && ` | ¥${course.price.toLocaleString()}`}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <Button size="sm" variant="secondary" onClick={() => openCourseModal(salon.id, course)}>編集</Button>
                                            <Button size="sm" variant="danger" onClick={() => deleteCourse(course.id)}>削除</Button>
                                        </div>
                                    </div>
                                ))}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openCourseModal(salon.id)}
                                    style={{ marginTop: '0.5rem' }}
                                >
                                    + コース追加
                                </Button>
                            </div>
                        </div>
                    ))}

                    {/* サロン追加フォーム */}
                    <form onSubmit={saveSalon} style={{ padding: '1rem', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0' }}>{editingSalon ? 'サロン編集' : '+ サロン追加'}</h4>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                name="name"
                                placeholder="サロン名"
                                defaultValue={editingSalon?.name}
                                key={editingSalon?.id}
                                required
                                style={{ flex: 1 }}
                            />
                            <Button type="submit">{editingSalon ? '更新' : '追加'}</Button>
                            {editingSalon && (
                                <Button type="button" variant="secondary" onClick={() => setEditingSalon(null)}>キャンセル</Button>
                            )}
                        </div>
                    </form>
                </div>
            </Modal>

            {/* コース追加/編集モーダル */}
            <Modal isOpen={courseModalOpen} onClose={() => { setCourseModalOpen(false); setEditingCourse(null); }} title={editingCourse ? 'コース編集' : 'コース追加'}>
                <form onSubmit={saveCourse}>
                    <div className="form-group">
                        <label>コース名 *</label>
                        <input name="name" defaultValue={editingCourse?.name} required />
                    </div>
                    <div className="form-group">
                        <label>Discordロール名</label>
                        <input name="discordRoleName" defaultValue={editingCourse?.discordRoleName} placeholder="@role_name" />
                    </div>
                    <div className="form-group">
                        <label>決済サービス *</label>
                        <select name="paymentService" defaultValue={editingCourse?.paymentService || 'paypal'} required>
                            <option value="paypal">Paypal</option>
                            <option value="univapay">Univapay</option>
                            <option value="memberpay">メンバーペイ</option>
                            <option value="robotpay">ロボットペイ</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>月額（任意）</label>
                        <input name="price" type="number" defaultValue={editingCourse?.price} placeholder="9800" />
                    </div>
                    <Button type="submit" block>保存</Button>
                </form>
            </Modal>

            {/* 加入コース追加モーダル */}
            <Modal isOpen={subscriptionModalOpen} onClose={() => setSubscriptionModalOpen(false)} title="加入コース追加">
                <form onSubmit={saveSubscription}>
                    <div className="form-group">
                        <label>コース *</label>
                        <select name="courseId" required>
                            <option value="">選択してください</option>
                            {(db.salons || []).map(salon => (
                                <optgroup key={salon.id} label={salon.name}>
                                    {(db.courses || []).filter(c => c.salonId === salon.id).map(course => (
                                        <option key={course.id} value={course.id}>
                                            {course.name}（{getPaymentServiceLabel(course.paymentService || 'paypal')}）
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="checkbox" name="isExempt" />
                            決済免除
                        </label>
                    </div>
                    <Button type="submit" block>追加</Button>
                </form>
            </Modal>
        </AppLayout>
    );
}

export default function CustomersPage() {
    const { user, isLoading } = useAuth();
    if (isLoading) return <div>Loading...</div>;
    if (!user) return <LoginForm />;
    return <CustomersContent />;
}

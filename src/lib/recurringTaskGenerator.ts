import { supabase, toSnakeCase, toCamelCase } from './supabase';
import { isHoliday } from './holidays';
import { RecurringTaskTemplate, Task, Checklist, ChecklistBlock } from '@/types';

/**
 * テンプレートと日付に基づいてタスクを生成すべきか判定
 */
export function shouldGenerateTask(
    template: RecurringTaskTemplate,
    date: Date
): boolean {
    const dayOfWeek = date.getDay(); // 0=日, 1=月, ..., 6=土
    const dayOfMonth = date.getDate();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isJapaneseHoliday = isHoliday(date);

    // 開始日チェック
    const startDate = new Date(template.startDate);
    if (date < startDate) return false;

    // 終了日チェック
    if (template.endDate) {
        const endDate = new Date(template.endDate);
        if (date > endDate) return false;
    }

    switch (template.pattern) {
        case 'daily':
            return true;

        case 'weekly':
            return dayOfWeek === template.dayOfWeek;

        case 'monthly':
            // 月末処理：指定日が存在しない月は月末日に生成
            const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
            if (template.dayOfMonth! > lastDay) {
                return dayOfMonth === lastDay;
            }
            return dayOfMonth === template.dayOfMonth;

        case 'weekdays':
            return isWeekday;

        case 'weekdays_include_holidays':
            return isWeekday; // 祝日でも生成

        case 'weekdays_exclude_holidays':
            return isWeekday && !isJapaneseHoliday;

        default:
            return false;
    }
}

/**
 * 日付をYYYY-MM-DD形式の文字列に変換
 */
function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 繰り返しタスクを生成（Cron用）
 */
export async function generateRecurringTasks(targetDate?: Date): Promise<{
    createdCount: number;
    skippedCount: number;
    errors: string[];
    details: { templateId: number; title: string; action: string }[];
}> {
    if (!supabase) {
        return {
            createdCount: 0,
            skippedCount: 0,
            errors: ['Supabase is not configured'],
            details: []
        };
    }

    const today = targetDate || new Date();
    const todayStr = formatDate(today);

    const result = {
        createdCount: 0,
        skippedCount: 0,
        errors: [] as string[],
        details: [] as { templateId: number; title: string; action: string }[]
    };

    try {
        // アクティブなテンプレート一覧を取得
        const { data: templatesData, error: templatesError } = await supabase
            .from('recurring_task_templates')
            .select('*')
            .eq('is_active', true);

        if (templatesError) {
            result.errors.push(`Failed to fetch templates: ${templatesError.message}`);
            return result;
        }

        const templates: RecurringTaskTemplate[] = (templatesData || []).map(t => toCamelCase<RecurringTaskTemplate>(t));

        for (const template of templates) {
            // 今日がパターンに合致するか
            if (!shouldGenerateTask(template, today)) {
                result.details.push({
                    templateId: template.id,
                    title: template.title,
                    action: 'skipped (pattern not matched)'
                });
                result.skippedCount++;
                continue;
            }

            // 重複チェック：同じテンプレート＆同じ日のタスクが存在するか
            const { data: existingTasks, error: checkError } = await supabase
                .from('tasks')
                .select('id')
                .eq('recurring_template_id', template.id)
                .eq('generated_for_date', todayStr);

            if (checkError) {
                result.errors.push(`Check error for template ${template.id}: ${checkError.message}`);
                continue;
            }

            if (existingTasks && existingTasks.length > 0) {
                result.details.push({
                    templateId: template.id,
                    title: template.title,
                    action: 'skipped (already generated)'
                });
                result.skippedCount++;
                continue;
            }

            // チェックリストをディープコピー（あれば）
            let checklistBlocks: ChecklistBlock[] | undefined;
            if (template.attachedChecklistId) {
                const { data: checklistData } = await supabase
                    .from('checklists')
                    .select('blocks')
                    .eq('id', template.attachedChecklistId)
                    .single();

                if (checklistData?.blocks) {
                    checklistBlocks = JSON.parse(JSON.stringify(checklistData.blocks));
                }
            }

            // 新規タスクを作成
            const newTask: Partial<Task> = {
                title: template.title,
                description: template.description,
                businessId: template.businessId,
                assigneeId: template.assigneeId,
                priority: template.priority,
                status: '未着手',
                userId: template.userId,
                dueDate: todayStr,
                createdAt: new Date().toISOString(),
                recurringTemplateId: template.id,
                generatedForDate: todayStr,
                attachedManualId: template.attachedManualId,
                attachedChecklistId: template.attachedChecklistId,
                checklistBlocks: checklistBlocks,
            };

            const { error: insertError } = await supabase
                .from('tasks')
                .insert(toSnakeCase(newTask));

            if (insertError) {
                result.errors.push(`Insert error for template ${template.id}: ${insertError.message}`);
                continue;
            }

            // テンプレートのlastGeneratedDateを更新
            await supabase
                .from('recurring_task_templates')
                .update({ last_generated_date: todayStr, updated_at: new Date().toISOString() })
                .eq('id', template.id);

            result.details.push({
                templateId: template.id,
                title: template.title,
                action: 'created'
            });
            result.createdCount++;
        }
    } catch (e) {
        result.errors.push(`Unexpected error: ${e instanceof Error ? e.message : 'Unknown'}`);
    }

    return result;
}

/**
 * パターンの日本語表示ラベル
 */
export const patternLabels: Record<string, string> = {
    daily: '毎日',
    weekly: '毎週',
    monthly: '毎月',
    weekdays: '平日（月〜金）',
    weekdays_include_holidays: '平日（祝日含む）',
    weekdays_exclude_holidays: '平日（祝日除く）',
};

/**
 * 曜日の日本語表示ラベル
 */
export const dayOfWeekLabels = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * テンプレートの繰り返しパターンを日本語で表示
 */
export function formatPatternLabel(template: RecurringTaskTemplate): string {
    switch (template.pattern) {
        case 'daily':
            return '毎日';
        case 'weekly':
            return `毎週${dayOfWeekLabels[template.dayOfWeek || 0]}曜日`;
        case 'monthly':
            return `毎月${template.dayOfMonth}日`;
        case 'weekdays':
            return '平日（月〜金）';
        case 'weekdays_include_holidays':
            return '平日（祝日含む）';
        case 'weekdays_exclude_holidays':
            return '平日（祝日除く）';
        default:
            return template.pattern;
    }
}

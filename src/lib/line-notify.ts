// LINE通知ヘルパー

export async function sendLineNotification(message: string, token?: string): Promise<boolean> {
    try {
        const response = await fetch('/api/line-notify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message, token }),
        });

        return response.ok;
    } catch (error) {
        console.error('Failed to send LINE notification:', error);
        return false;
    }
}

// タスク期限通知メッセージを生成
export function createTaskDueMessage(taskTitle: string, dueDate: string): string {
    return `【業務管理システム】\n📋 タスク期限のお知らせ\n\nタイトル: ${taskTitle}\n期限: ${dueDate}\n\n早めの対応をお願いします。`;
}

// タスク更新通知メッセージを生成
export function createTaskUpdateMessage(
    userName: string,
    taskTitle: string,
    action: string
): string {
    return `【業務管理システム】\n📝 タスク更新\n\n${userName}さんが「${taskTitle}」を更新しました。\n\n内容: ${action}`;
}

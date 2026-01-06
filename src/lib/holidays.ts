import holidayJp from '@holiday-jp/holiday_jp';

/**
 * 指定した日付が日本の祝日かどうかを判定
 */
export function isHoliday(date: Date): boolean {
    return !!holidayJp.isHoliday(date);
}

/**
 * 指定した日付の祝日名を取得（祝日でなければundefined）
 */
export function getHolidayName(date: Date): string | undefined {
    const holidays = holidayJp.between(date, date);
    if (holidays.length > 0) {
        return holidays[0].name;
    }
    return undefined;
}

/**
 * 指定した年の祝日一覧を取得
 */
export function getHolidaysInYear(year: number): { date: Date; name: string }[] {
    const holidays = holidayJp.between(
        new Date(year, 0, 1),
        new Date(year, 11, 31)
    );
    return holidays.map(h => ({
        date: h.date,
        name: h.name
    }));
}

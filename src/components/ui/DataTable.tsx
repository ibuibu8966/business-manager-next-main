'use client';

import { ReactNode } from 'react';

interface Column<T> {
    header: string;
    accessor: keyof T | ((item: T) => ReactNode);
    className?: string;
}

interface DataTableProps<T> {
    data: T[];
    columns: Column<T>[];
    emptyMessage?: string;
}

export function DataTable<T extends { id: number }>({
    data,
    columns,
    emptyMessage = 'データがありません'
}: DataTableProps<T>) {
    if (data.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-text">{emptyMessage}</div>
            </div>
        );
    }

    return (
        <div className="data-table-container">
            <table className="data-table">
                <thead>
                    <tr>
                        {columns.map((col, i) => (
                            <th key={i}>{col.header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.map(item => (
                        <tr key={item.id}>
                            {columns.map((col, i) => (
                                <td key={i} className={col.className}>
                                    {typeof col.accessor === 'function'
                                        ? col.accessor(item)
                                        : String(item[col.accessor] ?? '')}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

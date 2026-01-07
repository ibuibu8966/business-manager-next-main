'use client';

import { useState } from 'react';
import { Button } from './Button';
import { Tag } from '@/types';

interface TagInputProps {
    /** 選択されているタグ名の配列 */
    tags: string[];
    /** タグが変更されたときのコールバック */
    onTagsChange: (tags: string[]) => void;
    /** 既存のタグ一覧（選択肢として表示） */
    existingTags?: Tag[];
    /** 入力欄のプレースホルダー */
    placeholder?: string;
    /** デフォルトのタグ色 */
    defaultColor?: string;
}

/**
 * タグ入力コンポーネント
 * - テキスト入力でタグを追加
 * - Enterキーまたは追加ボタンで追加
 * - 既存タグからワンクリックで選択
 * - IME入力（日本語）に対応
 */
export function TagInput({
    tags,
    onTagsChange,
    existingTags = [],
    placeholder = 'タグ名を入力',
    defaultColor = '#6366f1',
}: TagInputProps) {
    const [input, setInput] = useState('');

    const addTag = (tagName: string) => {
        const trimmed = tagName.trim();
        if (trimmed && !tags.includes(trimmed)) {
            onTagsChange([...tags, trimmed]);
        }
        setInput('');
    };

    const removeTag = (tagName: string) => {
        onTagsChange(tags.filter(t => t !== tagName));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // IME入力中（日本語変換中）はEnterを無視
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            addTag(input);
        }
    };

    // 既存タグから未選択のものだけ表示
    const availableTags = existingTags.filter(t => !tags.includes(t.name));

    return (
        <div>
            {/* 入力欄 + 追加ボタン */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={placeholder}
                    onKeyDown={handleKeyDown}
                    style={{ flex: 1 }}
                />
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => addTag(input)}
                >
                    追加
                </Button>
            </div>

            {/* 選択済みタグ */}
            {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {tags.map(tag => {
                        const existingTag = existingTags.find(t => t.name === tag);
                        const color = existingTag?.color || defaultColor;
                        return (
                            <span
                                key={tag}
                                className="badge"
                                style={{
                                    backgroundColor: color,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                }}
                            >
                                {tag}
                                <button
                                    type="button"
                                    onClick={() => removeTag(tag)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 0,
                                        color: 'inherit',
                                        fontSize: '14px',
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}

            {/* 既存タグから選択 */}
            {availableTags.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        既存タグから選択:
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {availableTags.map(tag => (
                            <button
                                key={tag.id}
                                type="button"
                                className="badge"
                                style={{
                                    backgroundColor: tag.color || defaultColor,
                                    cursor: 'pointer',
                                    border: 'none',
                                }}
                                onClick={() => onTagsChange([...tags, tag.name])}
                            >
                                + {tag.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

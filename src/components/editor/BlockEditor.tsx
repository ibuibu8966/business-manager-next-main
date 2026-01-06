'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { nanoid } from 'nanoid';

// ブロックタイプの定義
export type BlockType =
    | 'paragraph'
    | 'heading-one'
    | 'heading-two'
    | 'heading-three'
    | 'checkbox'
    | 'bulleted-list'
    | 'numbered-list'
    | 'quote'
    | 'divider'
    | 'code-block'
    | 'callout';

export interface InlineContent {
    text: string;
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    code?: boolean;
    link?: string;
}

export interface Block {
    id: string;
    type: BlockType;
    children: InlineContent[];
    checked?: boolean;
    variant?: 'info' | 'warning' | 'error' | 'success';
}

interface BlockEditorProps {
    initialValue?: Block[];
    onChange?: (blocks: Block[]) => void;
    readOnly?: boolean;
}

const BLOCK_TYPES: { type: BlockType; label: string; icon: string }[] = [
    { type: 'paragraph', label: 'テキスト', icon: 'Aa' },
    { type: 'heading-one', label: '見出し1', icon: 'H1' },
    { type: 'heading-two', label: '見出し2', icon: 'H2' },
    { type: 'heading-three', label: '見出し3', icon: 'H3' },
    { type: 'checkbox', label: 'ToDoリスト', icon: '☐' },
    { type: 'bulleted-list', label: '箇条書き', icon: '•' },
    { type: 'numbered-list', label: '番号付きリスト', icon: '1.' },
    { type: 'quote', label: '引用', icon: '"' },
    { type: 'divider', label: '区切り線', icon: '—' },
    { type: 'code-block', label: 'コード', icon: '</>' },
    { type: 'callout', label: 'コールアウト', icon: 'ℹ️' },
];

const createEmptyBlock = (type: BlockType = 'paragraph'): Block => ({
    id: nanoid(),
    type,
    children: [{ text: '' }],
    ...(type === 'checkbox' ? { checked: false } : {}),
    ...(type === 'callout' ? { variant: 'info' as const } : {}),
});

// カーソルを末尾に移動するユーティリティ関数
const setCaretToEnd = (el: HTMLElement) => {
    const range = document.createRange();
    const sel = window.getSelection();
    if (!sel) return;

    // テキストノードがある場合はその末尾に、なければ要素の末尾に
    if (el.childNodes.length > 0) {
        const lastChild = el.childNodes[el.childNodes.length - 1];
        if (lastChild.nodeType === Node.TEXT_NODE) {
            range.setStart(lastChild, lastChild.textContent?.length || 0);
            range.setEnd(lastChild, lastChild.textContent?.length || 0);
        } else {
            range.selectNodeContents(el);
            range.collapse(false);
        }
    } else {
        range.selectNodeContents(el);
        range.collapse(false);
    }

    sel.removeAllRanges();
    sel.addRange(range);
    el.focus();
};

// カーソルが行頭にあるかチェック
const isCaretAtStart = (): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    return range.startOffset === 0 && range.collapsed;
};

export function BlockEditor({ initialValue, onChange, readOnly = false }: BlockEditorProps) {
    const [blocks, setBlocks] = useState<Block[]>(
        initialValue?.length ? initialValue : [createEmptyBlock()]
    );
    const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [slashMenuIndex, setSlashMenuIndex] = useState(0);
    const [slashMenuBlockId, setSlashMenuBlockId] = useState<string | null>(null);
    const [slashFilter, setSlashFilter] = useState('');

    // IME composition状態
    const [isComposing, setIsComposing] = useState(false);

    // 複数選択用の状態
    const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

    const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    // 各ブロックのcontentEditable要素への参照
    const contentRefs = useRef<Map<string, HTMLElement>>(new Map());
    // 初期化済みブロックIDを追跡
    const initializedBlockIds = useRef<Set<string>>(new Set());

    // フィルタされたブロックタイプ
    const filteredBlockTypes = useMemo(() => {
        if (!slashFilter) return BLOCK_TYPES;
        return BLOCK_TYPES.filter(bt =>
            bt.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
            bt.type.toLowerCase().includes(slashFilter.toLowerCase())
        );
    }, [slashFilter]);

    // ブロックの更新を親に通知
    useEffect(() => {
        onChange?.(blocks);
    }, [blocks, onChange]);

    const updateBlock = useCallback((id: string, updates: Partial<Block>) => {
        setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    }, []);

    const updateBlockText = useCallback((id: string, text: string) => {
        setBlocks(prev => prev.map(b =>
            b.id === id ? { ...b, children: [{ ...b.children[0], text }] } : b
        ));
    }, []);

    const insertBlockAfter = useCallback((afterId: string, type: BlockType = 'paragraph') => {
        const newBlock = createEmptyBlock(type);
        setBlocks(prev => {
            const index = prev.findIndex(b => b.id === afterId);
            if (index === -1) return prev;
            const newBlocks = [...prev];
            newBlocks.splice(index + 1, 0, newBlock);
            return newBlocks;
        });
        // 新しいブロックにフォーカス
        setTimeout(() => {
            const el = blockRefs.current.get(newBlock.id);
            if (el) {
                const input = el.querySelector('[contenteditable]') as HTMLElement;
                if (input) {
                    input.focus();
                }
            }
        }, 0);
        return newBlock.id;
    }, []);

    const deleteBlock = useCallback((id: string) => {
        setBlocks(prev => {
            if (prev.length <= 1) {
                // 最後のブロックは削除せず、空にする
                const newBlock = createEmptyBlock();
                // DOMもクリア
                const contentEl = contentRefs.current.get(id);
                if (contentEl) {
                    contentEl.textContent = '';
                }
                initializedBlockIds.current.delete(id);
                return [newBlock];
            }
            const index = prev.findIndex(b => b.id === id);
            const newBlocks = prev.filter(b => b.id !== id);
            // 前のブロックにフォーカス
            const prevBlock = prev[index - 1];
            if (prevBlock) {
                setTimeout(() => {
                    const el = blockRefs.current.get(prevBlock.id);
                    if (el) {
                        const input = el.querySelector('[contenteditable]') as HTMLElement;
                        if (input) {
                            setCaretToEnd(input);
                        }
                    }
                }, 0);
            }
            // 削除されたブロックの初期化フラグをクリア
            initializedBlockIds.current.delete(id);
            contentRefs.current.delete(id);
            return newBlocks;
        });
    }, []);

    const changeBlockType = useCallback((id: string, newType: BlockType) => {
        setBlocks(prev => prev.map(b => {
            if (b.id !== id) return b;
            return {
                ...b,
                type: newType,
                ...(newType === 'checkbox' ? { checked: false } : {}),
                ...(newType === 'callout' ? { variant: 'info' as const } : {}),
            };
        }));
        setShowSlashMenu(false);
        setSlashFilter('');
        // フォーカスを戻す
        setTimeout(() => {
            const el = blockRefs.current.get(id);
            if (el) {
                const input = el.querySelector('[contenteditable]') as HTMLElement;
                if (input) {
                    setCaretToEnd(input);
                }
            }
        }, 0);
    }, []);

    // 複数ブロックのタイプを一括変更
    const changeMultipleBlockTypes = useCallback((newType: BlockType) => {
        setBlocks(prev => prev.map(b =>
            selectedBlockIds.has(b.id)
                ? {
                    ...b,
                    type: newType,
                    ...(newType === 'checkbox' ? { checked: false } : {}),
                    ...(newType === 'callout' ? { variant: 'info' as const } : {}),
                }
                : b
        ));
        setSelectedBlockIds(new Set());
    }, [selectedBlockIds]);

    // 長押し開始
    const handleLongPressStart = useCallback((blockId: string) => {
        longPressTimerRef.current = setTimeout(() => {
            setSelectedBlockIds(prev => {
                const next = new Set(prev);
                if (next.has(blockId)) {
                    next.delete(blockId);
                } else {
                    next.add(blockId);
                }
                return next;
            });
        }, 500);
    }, []);

    // 長押し終了
    const handleLongPressEnd = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    // IME composition開始
    const handleCompositionStart = useCallback(() => {
        setIsComposing(true);
    }, []);

    // IME composition終了
    const handleCompositionEnd = useCallback((e: React.CompositionEvent, block: Block) => {
        setIsComposing(false);
        const text = (e.currentTarget as HTMLElement).textContent || '';
        updateBlockText(block.id, text);

        // スラッシュコマンド検出
        if (text.startsWith('/')) {
            setShowSlashMenu(true);
            setSlashMenuBlockId(block.id);
            setSlashFilter(text.slice(1));
            setSlashMenuIndex(0);
        } else {
            setShowSlashMenu(false);
            setSlashFilter('');
        }
    }, [updateBlockText]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent, block: Block) => {
        const currentEl = e.currentTarget as HTMLElement;
        const text = currentEl.textContent || '';

        // スラッシュメニュー表示中
        if (showSlashMenu) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSlashMenuIndex(prev => Math.min(prev + 1, filteredBlockTypes.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSlashMenuIndex(prev => Math.max(prev - 1, 0));
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const selectedType = filteredBlockTypes[slashMenuIndex];
                if (selectedType && slashMenuBlockId) {
                    // スラッシュとフィルタテキストを削除
                    const contentEl = contentRefs.current.get(slashMenuBlockId);
                    if (contentEl) {
                        contentEl.textContent = '';
                    }
                    updateBlockText(slashMenuBlockId, '');
                    changeBlockType(slashMenuBlockId, selectedType.type);
                }
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowSlashMenu(false);
                setSlashFilter('');
                return;
            }
        }

        // Enter: 新しいブロックを作成
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            insertBlockAfter(block.id);
            return;
        }

        // Backspace: 空のブロックを削除、または行頭で前のブロックと結合
        if (e.key === 'Backspace') {
            if (text === '' || (text === '' && isCaretAtStart())) {
                e.preventDefault();
                deleteBlock(block.id);
                return;
            }
        }

        // インライン書式（選択テキストがある場合のみ）
        if (e.ctrlKey || e.metaKey) {
            // 簡易実装: 全体に適用
            if (e.key === 'b') {
                e.preventDefault();
                const currentBold = block.children[0]?.bold || false;
                updateBlock(block.id, {
                    children: [{ ...block.children[0], bold: !currentBold }]
                });
                return;
            }
            if (e.key === 'i') {
                e.preventDefault();
                const currentItalic = block.children[0]?.italic || false;
                updateBlock(block.id, {
                    children: [{ ...block.children[0], italic: !currentItalic }]
                });
                return;
            }
        }
    }, [showSlashMenu, filteredBlockTypes, slashMenuIndex, slashMenuBlockId, updateBlockText, changeBlockType, insertBlockAfter, deleteBlock, updateBlock]);

    const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>, block: Block) => {
        // IME入力中は更新しない（compositionEndで処理）
        if (isComposing) return;

        const text = (e.target as HTMLElement).textContent || '';
        updateBlockText(block.id, text);

        // スラッシュコマンド検出
        if (text.startsWith('/')) {
            setShowSlashMenu(true);
            setSlashMenuBlockId(block.id);
            setSlashFilter(text.slice(1));
            setSlashMenuIndex(0);
        } else {
            setShowSlashMenu(false);
            setSlashFilter('');
        }
    }, [updateBlockText, isComposing]);

    const toggleCheckbox = useCallback((id: string) => {
        setBlocks(prev => prev.map(b =>
            b.id === id ? { ...b, checked: !b.checked } : b
        ));
    }, []);

    // 選択解除
    const clearSelection = useCallback(() => {
        setSelectedBlockIds(new Set());
    }, []);

    const renderBlock = (block: Block, index: number) => {
        const text = block.children[0]?.text || '';
        const { bold, italic, strikethrough, code } = block.children[0] || {};

        const textStyle: React.CSSProperties = {
            fontWeight: bold ? 'bold' : undefined,
            fontStyle: italic ? 'italic' : undefined,
            textDecoration: strikethrough ? 'line-through' : undefined,
            fontFamily: code ? 'monospace' : undefined,
            backgroundColor: code ? 'var(--bg-tertiary)' : undefined,
            padding: code ? '2px 4px' : undefined,
            borderRadius: code ? '4px' : undefined,
        };

        const handleBlockKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
            handleKeyDown(e as React.KeyboardEvent<HTMLDivElement>, block);
        };

        const handleBlockInput = (e: React.FormEvent<HTMLElement>) => {
            handleInput(e as React.FormEvent<HTMLDivElement>, block);
        };

        const handleBlockCompositionEnd = (e: React.CompositionEvent<HTMLElement>) => {
            handleCompositionEnd(e as React.CompositionEvent<HTMLDivElement>, block);
        };

        const getPlaceholder = () => {
            switch (block.type) {
                case 'heading-one': return '見出し1';
                case 'heading-two': return '見出し2';
                case 'heading-three': return '見出し3';
                case 'checkbox': return 'ToDoを入力';
                case 'bulleted-list': return 'リスト項目';
                case 'numbered-list': return 'リスト項目';
                case 'quote': return '引用を入力';
                case 'code-block': return 'コードを入力';
                case 'callout': return 'コールアウトを入力';
                default: return "'/'でメニューを表示...";
            }
        };

        // contentEditable要素のrefコールバック - 初期化時のみテキストをセット
        const contentRefCallback = (el: HTMLElement | null) => {
            if (el) {
                contentRefs.current.set(block.id, el);
                // 初期化されていない場合のみテキストをセット
                if (!initializedBlockIds.current.has(block.id)) {
                    el.textContent = text;
                    initializedBlockIds.current.add(block.id);
                }
            }
        };

        const commonProps = {
            contentEditable: !readOnly && block.type !== 'divider',
            suppressContentEditableWarning: true,
            onKeyDown: handleBlockKeyDown,
            onInput: handleBlockInput,
            onCompositionStart: handleCompositionStart,
            onCompositionEnd: handleBlockCompositionEnd,
            onFocus: () => setFocusedBlockId(block.id),
            onBlur: () => setFocusedBlockId(null),
            style: textStyle,
            className: `block-content ${!text ? 'empty' : ''}`,
            'data-placeholder': getPlaceholder(),
        };

        // 注意: {text}を直接レンダリングしない - DOMの内容はユーザー入力に任せる
        switch (block.type) {
            case 'heading-one':
                return (
                    <h1 {...commonProps} ref={contentRefCallback} />
                );
            case 'heading-two':
                return (
                    <h2 {...commonProps} ref={contentRefCallback} />
                );
            case 'heading-three':
                return (
                    <h3 {...commonProps} ref={contentRefCallback} />
                );
            case 'checkbox':
                return (
                    <div className="checkbox-block">
                        <button
                            type="button"
                            className={`checkbox-toggle ${block.checked ? 'checked' : ''}`}
                            onClick={() => toggleCheckbox(block.id)}
                            disabled={readOnly}
                        >
                            {block.checked && '✓'}
                        </button>
                        <div
                            {...commonProps}
                            ref={contentRefCallback}
                            className={`block-content ${block.checked ? 'completed' : ''} ${!text ? 'empty' : ''}`}
                        />
                    </div>
                );
            case 'bulleted-list':
                return (
                    <div className="list-block bulleted">
                        <span className="list-marker">•</span>
                        <div {...commonProps} ref={contentRefCallback} />
                    </div>
                );
            case 'numbered-list':
                return (
                    <div className="list-block numbered">
                        <span className="list-marker">{index + 1}.</span>
                        <div {...commonProps} ref={contentRefCallback} />
                    </div>
                );
            case 'quote':
                return (
                    <blockquote {...commonProps} ref={contentRefCallback} />
                );
            case 'divider':
                return <hr className="block-divider" />;
            case 'code-block':
                return (
                    <pre className="code-block">
                        <code {...commonProps} ref={contentRefCallback} />
                    </pre>
                );
            case 'callout':
                return (
                    <div className={`callout-block callout-${block.variant || 'info'}`}>
                        <span className="callout-icon">
                            {block.variant === 'warning' ? '⚠️' :
                             block.variant === 'error' ? '❌' :
                             block.variant === 'success' ? '✅' : 'ℹ️'}
                        </span>
                        <div {...commonProps} ref={contentRefCallback} />
                    </div>
                );
            default:
                return (
                    <div {...commonProps} ref={contentRefCallback} />
                );
        }
    };

    return (
        <div className="block-editor">
            {blocks.map((block, index) => (
                <div
                    key={block.id}
                    ref={el => {
                        if (el) blockRefs.current.set(block.id, el);
                        else blockRefs.current.delete(block.id);
                    }}
                    className={`block-wrapper ${focusedBlockId === block.id ? 'focused' : ''} ${selectedBlockIds.has(block.id) ? 'selected' : ''}`}
                    onMouseDown={() => handleLongPressStart(block.id)}
                    onMouseUp={handleLongPressEnd}
                    onMouseLeave={handleLongPressEnd}
                    onTouchStart={() => handleLongPressStart(block.id)}
                    onTouchEnd={handleLongPressEnd}
                >
                    {!readOnly && (
                        <div className="block-handle">
                            {selectedBlockIds.has(block.id) ? (
                                <span className="block-selected-indicator">✓</span>
                            ) : (
                                <button
                                    type="button"
                                    className="block-menu-trigger"
                                    onClick={() => {
                                        setSlashMenuBlockId(block.id);
                                        setShowSlashMenu(true);
                                        setSlashFilter('');
                                        setSlashMenuIndex(0);
                                    }}
                                >
                                    ⋮⋮
                                </button>
                            )}
                        </div>
                    )}
                    {renderBlock(block, index)}

                    {/* スラッシュメニュー */}
                    {showSlashMenu && slashMenuBlockId === block.id && (
                        <div className="slash-menu">
                            {filteredBlockTypes.length > 0 ? (
                                filteredBlockTypes.map((bt, i) => (
                                    <button
                                        key={bt.type}
                                        type="button"
                                        className={`slash-menu-item ${i === slashMenuIndex ? 'selected' : ''}`}
                                        onClick={() => {
                                            const contentEl = contentRefs.current.get(block.id);
                                            if (contentEl) {
                                                contentEl.textContent = '';
                                            }
                                            updateBlockText(block.id, '');
                                            changeBlockType(block.id, bt.type);
                                        }}
                                    >
                                        <span className="slash-menu-icon">{bt.icon}</span>
                                        <span className="slash-menu-label">{bt.label}</span>
                                    </button>
                                ))
                            ) : (
                                <div className="slash-menu-empty">一致するブロックがありません</div>
                            )}
                        </div>
                    )}
                </div>
            ))}

            {/* 複数選択時のツールバー */}
            {selectedBlockIds.size > 0 && (
                <div className="selection-toolbar">
                    <span className="selection-count">{selectedBlockIds.size}件選択中</span>
                    <div className="selection-toolbar-buttons">
                        {BLOCK_TYPES.filter(bt => bt.type !== 'divider').slice(0, 6).map(bt => (
                            <button
                                key={bt.type}
                                type="button"
                                className="selection-toolbar-btn"
                                onClick={() => changeMultipleBlockTypes(bt.type)}
                                title={bt.label}
                            >
                                {bt.icon}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="selection-toolbar-clear"
                        onClick={clearSelection}
                    >
                        ✕
                    </button>
                </div>
            )}
        </div>
    );
}

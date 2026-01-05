import { Font } from '@react-pdf/renderer';

// Noto Sans JP フォントを登録
// 軽量版（Static/Regular）を使用
Font.register({
    family: 'NotoSansJP',
    src: 'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.0.1/files/noto-sans-jp-japanese-400-normal.woff',
});

export const fontFamily = 'NotoSansJP';

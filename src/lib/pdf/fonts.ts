import { Font } from '@react-pdf/renderer';

// Noto Sans JP フォントを登録（GitHub raw URLから取得）
// 日本語対応のTTFフォント
Font.register({
    family: 'NotoSansJP',
    src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP-Regular.ttf',
});

Font.register({
    family: 'NotoSansJP',
    src: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP-Bold.ttf',
    fontWeight: 'bold',
});

export const fontFamily = 'NotoSansJP';

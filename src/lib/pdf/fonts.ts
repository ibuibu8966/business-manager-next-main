import { Font } from '@react-pdf/renderer';

// Google Fonts CDNからNoto Sans JPを登録
// サーバーサイドでのPDF生成時に日本語フォントを使用するため
Font.register({
    family: 'NotoSansJP',
    fonts: [
        {
            src: 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf',
            fontWeight: 'normal',
        },
        {
            src: 'https://fonts.gstatic.com/s/notosansjp/v52/-F6pfjtqLzI2JPCgQBnw7HFQoggM-AsregP8VFJEk75s.ttf',
            fontWeight: 'bold',
        },
    ],
});

export const fontFamily = 'NotoSansJP';

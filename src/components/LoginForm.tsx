'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from './ui/Button';

export function LoginForm() {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, signUp } = useAuth();

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            if (isSignUp) {
                const { error } = await signUp(email, password, name);
                if (error) {
                    setError(error.message);
                } else {
                    setMessage('登録確認メールを送信しました。メール内のリンクをクリックするか、そのままログインしてください。');
                }
            } else {
                const { error } = await login(email, password);
                if (error) {
                    setError('ログインに失敗しました: ' + error.message);
                }
            }
        } catch (e) {
            setError('エラーが発生しました');
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div id="login-screen">
            <div className="login-container">
                <div className="login-card">
                    <div className="login-header">
                        <div className="logo">💼</div>
                        <h1>業務管理システム</h1>
                        <p>{isSignUp ? 'アカウントを作成' : 'ログインしてください'}</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        {isSignUp && (
                            <div className="form-group">
                                <label>お名前（表示名）</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="山田 太郎"
                                    required
                                />
                            </div>
                        )}

                        <div className="form-group">
                            <label>メールアドレス</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder="example@email.com"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>パスワード</label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="6文字以上"
                                minLength={6}
                                required
                            />
                        </div>

                        {error && (
                            <div style={{ color: 'var(--danger)', marginBottom: '16px', fontSize: '14px', background: '#ffebee', padding: '8px', borderRadius: '4px' }}>
                                {error}
                            </div>
                        )}
                        {message && (
                            <div style={{ color: 'var(--success)', marginBottom: '16px', fontSize: '14px', background: '#e8f5e9', padding: '8px', borderRadius: '4px' }}>
                                {message}
                            </div>
                        )}

                        <Button type="submit" variant="primary" block disabled={loading}>
                            {loading ? '処理中...' : (isSignUp ? '登録してログイン' : 'ログイン')}
                        </Button>

                        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '14px' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsSignUp(!isSignUp);
                                    setError('');
                                    setMessage('');
                                }}
                                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                                {isSignUp ? 'すでにアカウントをお持ちの方' : '新しくアカウントを作成する'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

'use client';
import React, { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const result = await signIn('credentials', {
                email,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError('Email atau password salah');
                return;
            }

            // Redirect berdasarkan role
            router.push('/dashboard');
        } catch (error) {
            console.error('Login error:', error);
            setError('Terjadi kesalahan saat login');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-[#1a3a8c]">
            <div className="login-card bg-white p-10 rounded-xl shadow-xl flex flex-col items-center">
                <img src="/st_louis-2.png" alt="School Logo" className="logo w-52 mb-8" />
                
                {error && (
                    <div className="text-red-500 mb-4">{error}</div>
                )}

                <form onSubmit={handleLogin} className="w-full">
                    <input 
                        type="email" 
                        placeholder="Email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full p-4 mb-5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                    />
                    <input 
                        type="password" 
                        placeholder="Password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full p-4 mb-8 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                    />
                    
                    <button 
                        type="submit"
                        disabled={isLoading}
                        className={`login-button w-full p-4 bg-[#f7b538] text-white rounded-lg cursor-pointer font-bold transition duration-300 hover:bg-[#e0a430] ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isLoading ? 'Loading...' : 'Login'}
                    </button>
                </form>
            </div>
        </main>
    );
};

export default LoginPage;
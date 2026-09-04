'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginPassword, checkDeviceLogin, requestOtp, verifyOtp } from '@/lib/auth';
import { getDeviceId } from '@/lib/device-id';

type LoginMode = 'password' | 'otp';
type OtpStage = 'request' | 'verify';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>('password');
  const [otpStage, setOtpStage] = useState<OtpStage>('request');
  
  // Password login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  
  // Check for auto-login on mount
  useEffect(() => {
    const checkAutoLogin = async () => {
      const storedEmail = localStorage.getItem('scs_last_email');
      if (!storedEmail) return;
      
      const deviceId = getDeviceId();
      try {
        const result = await checkDeviceLogin(storedEmail, deviceId);
        if (result.canAutoLogin) {
          // Auto-login with stored credentials
          setEmail(storedEmail);
          // User will need to enter password
        }
      } catch {
        // Ignore errors
      }
    };
    
    checkAutoLogin();
  }, []);
  
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const deviceId = getDeviceId();
      const result = await loginPassword(email, password, deviceId);
      
      if ('requiresOtp' in result) {
        // Device not trusted - require OTP
        setPhone(result.otpPhone);
        setMode('otp');
        setOtpStage('request');
        setError('New device detected. Please verify with OTP sent to your phone.');
      } else {
        // Login successful
        localStorage.setItem('scs_last_email', email);
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };
  
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await requestOtp(phone);
      setOtpStage('verify');
    } catch (err: any) {
      setError(err.message || 'OTP request failed');
    } finally {
      setLoading(false);
    }
  };
  
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await verifyOtp(phone, otp);
      localStorage.setItem('scs_last_email', email);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-6">
          Smart Commerce Platform
        </h1>
        
        {/* Mode Tabs */}
        <div className="flex mb-6 border-b">
          <button
            className={`flex-1 pb-2 ${mode === 'password' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}
            onClick={() => setMode('password')}
          >
            Email/Password
          </button>
          <button
            className={`flex-1 pb-2 ${mode === 'otp' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}
            onClick={() => setMode('otp')}
          >
            Phone OTP
          </button>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        {/* Password Login Form */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordLogin}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-300"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
            
            <p className="text-sm text-gray-500 text-center mt-4">
              Don't have credentials?{' '}
              <button
                type="button"
                onClick={() => setMode('otp')}
                className="text-blue-500 hover:underline"
              >
                Login with OTP
              </button>
            </p>
          </form>
        )}
        
        {/* OTP Login Form */}
        {mode === 'otp' && (
          <>
            {otpStage === 'request' ? (
              <form onSubmit={handleRequestOtp}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+971501234567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-300"
                >
                  {loading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter OTP sent to {phone}
                  </label>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-300"
                >
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </button>
                
                <button
                  type="button"
                  onClick={() => setOtpStage('request')}
                  className="w-full mt-2 text-gray-500 hover:text-gray-700"
                >
                  Change phone number
                </button>
              </form>
            )}
            
            <p className="text-sm text-gray-500 text-center mt-4">
              Have credentials?{' '}
              <button
                type="button"
                onClick={() => setMode('password')}
                className="text-blue-500 hover:underline"
              >
                Login with Email/Password
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setupCredentials, changePassword } from '@/lib/auth';
import { validatePasswordStrength, calculatePasswordEntropy, getPasswordStrengthLabel } from '@/lib/utils/password-validation';

type Mode = 'setup' | 'change';

export default function CredentialsPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('setup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Setup form
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  
  // Change password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    // Validate passwords match
    if (setupPassword !== setupConfirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    // Validate password strength
    const validation = validatePasswordStrength(setupPassword, setupEmail);
    if (!validation.valid) {
      setError(validation.errors.join('; '));
      return;
    }
    
    setLoading(true);
    
    try {
      await setupCredentials(setupEmail, setupPassword);
      setSuccess('Credentials set up successfully! You can now login with email and password.');
      setTimeout(() => router.push('/profile'), 2000);
    } catch (err: any) {
      setError(err.message || 'Credential setup failed');
    } finally {
      setLoading(false);
    }
  };
  
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    // Validate passwords match
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }
    
    // Validate password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.valid) {
      setError(validation.errors.join('; '));
      return;
    }
    
    setLoading(true);
    
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      setError(err.message || 'Password change failed');
    } finally {
      setLoading(false);
    }
  };
  
  const passwordEntropy = setupPassword ? calculatePasswordEntropy(setupPassword) : 0;
  const passwordStrength = setupPassword ? getPasswordStrengthLabel(passwordEntropy) : null;
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Credential Management</h1>
      
      {/* Mode Tabs */}
      <div className="flex mb-6 border-b">
        <button
          className={`flex-1 pb-2 ${mode === 'setup' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}
          onClick={() => setMode('setup')}
        >
          Set Up Credentials
        </button>
        <button
          className={`flex-1 pb-2 ${mode === 'change' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-500'}`}
          onClick={() => setMode('change')}
        >
          Change Password
        </button>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}
      
      {/* Setup Credentials Form */}
      {mode === 'setup' && (
        <form onSubmit={handleSetup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={setupEmail}
              onChange={(e) => setSetupEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={setupPassword}
              onChange={(e) => setSetupPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={12}
            />
            {setupPassword && (
              <div className="mt-2">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        passwordStrength === 'weak' ? 'bg-red-500 w-1/4' :
                        passwordStrength === 'fair' ? 'bg-yellow-500 w-2/4' :
                        passwordStrength === 'good' ? 'bg-blue-500 w-3/4' :
                        'bg-green-500 w-full'
                      }`}
                    />
                  </div>
                  <span className={`text-sm ${
                    passwordStrength === 'weak' ? 'text-red-500' :
                    passwordStrength === 'fair' ? 'text-yellow-500' :
                    passwordStrength === 'good' ? 'text-blue-500' :
                    'text-green-500'
                  }`}>
                    {passwordStrength}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Minimum 12 characters with 3 character classes (uppercase, lowercase, digits, symbols)
                </p>
              </div>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={setupConfirmPassword}
              onChange={(e) => setSetupConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={12}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-300"
          >
            {loading ? 'Setting up...' : 'Set Up Credentials'}
          </button>
        </form>
      )}
      
      {/* Change Password Form */}
      {mode === 'change' && (
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={12}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={12}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:bg-gray-300"
          >
            {loading ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      )}
    </div>
  );
}

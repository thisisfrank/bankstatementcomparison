import React, { useState, useEffect } from 'react';
import { userService } from '../lib/userService';
import { Profile, TIER_CONFIG } from '../lib/supabase';

interface TierTesterProps {
  isVisible: boolean;
  onClose: () => void;
  isDark: boolean;
}

export function TierTester({ isVisible, onClose, isDark }: TierTesterProps) {
  const [user, setUser] = useState<Profile | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>('anonymous');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await userService.getCurrentUser();
        setUser(currentUser);
        if (currentUser) {
          setSelectedTier(currentUser.tier);
        }
      } catch (error) {
        console.error('Error loading user:', error);
      }
    };

    if (isVisible) {
      loadUser();
    }
  }, [isVisible]);

  const handleTierChange = async () => {
    setLoading(true);
    try {
      await userService.updateUserTier(selectedTier as Profile['tier']);
      const updatedUser = await userService.getCurrentUser();
      setUser(updatedUser);
      alert(`Tier updated to ${TIER_CONFIG[selectedTier as keyof typeof TIER_CONFIG].name}`);
    } catch (error) {
      console.error('Error updating tier:', error);
      alert('Failed to update tier');
    } finally {
      setLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`rounded-xl max-w-md w-full p-6 relative ${
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      } border shadow-lg`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-xl font-bold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            Tier Testing
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Current User
            </label>
            <div className={`p-3 rounded-lg border ${
              isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
            }`}>
              {user ? (
                <div className="space-y-1">
                  <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    <strong>Name:</strong> {user.full_name || 'Anonymous'}
                  </div>
                  <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    <strong>Current Tier:</strong> {TIER_CONFIG[user.tier].name}
                  </div>
                  <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    <strong>Credits:</strong> {user.credits} / {TIER_CONFIG[user.tier].credits}
                  </div>
                </div>
              ) : (
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Not signed in (Anonymous)
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Test Tier
            </label>
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className={`w-full p-3 rounded-lg border ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-gray-200' 
                  : 'bg-white border-gray-300 text-gray-800'
              }`}
            >
              {Object.entries(TIER_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.name} - {config.price} ({config.credits} credits)
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleTierChange}
            disabled={loading}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
              loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {loading ? 'Updating...' : 'Update Tier'}
          </button>

          <button
            onClick={async () => {
              setLoading(true);
              try {
                const result = await userService.resetUserAccount('thisisfrankgonzalez@gmail.com');
                if (result.success) {
                  alert('Account reset successfully! You can now sign in with thisisfrankgonzalez@gmail.com and password: testpassword123');
                  window.location.reload();
                } else {
                  alert('Failed to reset account: ' + result.error);
                }
              } catch (error) {
                alert('Error resetting account');
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
              loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {loading ? 'Resetting...' : 'Reset Account (thisisfrankgonzalez@gmail.com)'}
          </button>

          <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            This will update your tier for testing purposes. Changes are saved to the database.
          </div>
        </div>
      </div>
    </div>
  );
} 
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchMyOrganizations } from '../lib/buyer-api';
import { useAuth } from './AuthProvider';
import { isMerchantRole } from '../lib/auth';

interface OrgInfo {
  id: string;
  name: string;
  type: string;
  verificationStatus?: string;
  membershipStatus?: string;
}

export function MerchantRegistrationCard() {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegistration, setShowRegistration] = useState(false);

  useEffect(() => {
    async function checkEligibility() {
      try {
        const orgList = await fetchMyOrganizations() as OrgInfo[];
        setOrgs(orgList);
        
        // A verified business org hides the CTA. The org list carries the DB
        // column name `verificationStatus` — the previous check read
        // `storeVerificationStatus`, which never exists, so this card never
        // self-hid (audit A1-2).
        const hasVerifiedStore = orgList.some(org => 
          org.verificationStatus === 'VERIFIED'
        );
        // Owners and staff are already onboarded, so never pitch them the
        // registration flow — `role` is only exposed on the profile, not on the
        // org list (which returns a `roleId` UUID).
        setShowRegistration(!hasVerifiedStore && !isMerchantRole(user?.role));
      } catch {
        // Unauthenticated visitors get the CTA; a failed lookup for a signed-in
        // user must not default to showing it.
        setShowRegistration(!user);
      } finally {
        setLoading(false);
      }
    }
    checkEligibility();
  }, [user]);

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 20px',
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(22,35,43,.04)',
        opacity: 0.5,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: '#f2f7f9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0,
        }}>🏢</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 2 }}>Register as Merchant</div>
          <div style={{ fontSize: 12, color: '#5b6b74', lineHeight: 1.4 }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!showRegistration) {
    return null;
  }

  return (
    <Link href="/merchant/register" className="home-quick" style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '16px 20px',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      textDecoration: 'none',
      boxShadow: '0 1px 3px rgba(22,35,43,.04)',
      transition: 'box-shadow 0.2s ease, transform 0.2s ease',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: '#f2f7f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0,
      }}>🏢</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0f3340', marginBottom: 2 }}>Register as Merchant</div>
        <div style={{ fontSize: 12, color: '#5b6b74', lineHeight: 1.4 }}>Onboard your business</div>
      </div>
      <svg className="home-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="#b0bec5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, transition: 'stroke 0.2s ease' }}>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}

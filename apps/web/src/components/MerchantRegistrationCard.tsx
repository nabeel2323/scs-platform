'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchMyOrganizations } from '../lib/buyer-api';

interface OrgInfo {
  orgId: string;
  name: string;
  role: string;
  status: string;
  storeVerificationStatus?: string;
}

export function MerchantRegistrationCard() {
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegistration, setShowRegistration] = useState(false);

  useEffect(() => {
    async function checkEligibility() {
      try {
        const orgList = await fetchMyOrganizations() as OrgInfo[];
        setOrgs(orgList);
        
        // Show registration only if user has no orgs or no verified store
        const hasVerifiedStore = orgList.some(org => 
          org.storeVerificationStatus === 'VERIFIED' || org.role === 'MERCHANT_OWNER'
        );
        setShowRegistration(!hasVerifiedStore);
      } catch {
        // If not authenticated or error, show registration
        setShowRegistration(true);
      } finally {
        setLoading(false);
      }
    }
    checkEligibility();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px 24px', background: '#fff', border: '1px solid #d9e2e6', borderRadius: 10, opacity: 0.5 }}>
        <b>Register as Merchant</b>
        <span>Loading...</span>
      </div>
    );
  }

  if (!showRegistration) {
    return null;
  }

  return (
    <Link href="/merchant/register" style={{
      display: 'block',
      padding: '20px 24px',
      background: '#fff',
      border: '1px solid #d9e2e6',
      borderRadius: 10,
      textDecoration: 'none',
      boxShadow: '0 1px 2px rgba(22,35,43,.06),0 4px 14px rgba(22,35,43,.05)',
    }}>
      <b>Register as Merchant</b>
      <span>Onboard your business</span>
    </Link>
  );
}

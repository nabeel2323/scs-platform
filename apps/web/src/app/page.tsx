import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0f3340', marginBottom: 8 }}>
        Smart Commerce Platform
      </h1>
      <p style={{ color: '#5b6b74', fontSize: 18, marginBottom: 32 }}>
        B2B-first marketplace — retailer &amp; merchant portal
      </p>

      {/* Primary Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
        <Link href="/search" style={cardStyle}>
          <b>Search Products</b>
          <span>Browse catalog with filters</span>
        </Link>
        <Link href="/stores" style={cardStyle}>
          <b>Browse Stores</b>
          <span>Discover wholesalers near you</span>
        </Link>
        <Link href="/cart" style={cardStyle}>
          <b>Cart</b>
          <span>Multi-supplier checkout</span>
        </Link>
        <Link href="/orders" style={cardStyle}>
          <b>My Orders</b>
          <span>Track &amp; reorder</span>
        </Link>
      </div>

      {/* Secondary Actions */}
      <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0f3340', marginBottom: 12 }}>More</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <Link href="/notifications" style={cardStyle}>
          <b>Notifications</b>
          <span>Order updates &amp; alerts</span>
        </Link>
        <Link href="/merchant/orders" style={cardStyle}>
          <b>Merchant Orders</b>
          <span>Manage incoming orders</span>
        </Link>
        <Link href="/reviews" style={cardStyle}>
          <b>Reviews &amp; Disputes</b>
          <span>Rate stores or open disputes</span>
        </Link>
        <Link href="/auth/login" style={cardStyle}>
          <b>Sign In</b>
          <span>OTP-based phone authentication</span>
        </Link>
      </div>
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'block',
  padding: '20px 24px',
  background: '#fff',
  border: '1px solid #d9e2e6',
  borderRadius: 10,
  textDecoration: 'none',
  boxShadow: '0 1px 2px rgba(22,35,43,.06),0 4px 14px rgba(22,35,43,.05)',
};

import type { Metadata } from 'next';
import SearchPageClient from './SearchPageClient';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const rawQuery = searchParams['q'];
  const query = Array.isArray(rawQuery) ? rawQuery[0] ?? '' : rawQuery ?? '';

  return {
    title: query
      ? `Search: ${query} | Smart Commerce Platform`
      : 'Search Products | Smart Commerce Platform',
    description: query
      ? `Search results for "${query}" on Smart Commerce Platform — B2B marketplace`
      : 'Browse products from verified suppliers on Smart Commerce Platform',
  };
}

export default function SearchPage() {
  return <SearchPageClient />;
}

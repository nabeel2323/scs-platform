import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';

type Props = {
  params: {
    id: string;
  };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const apiBase =
      process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

    const response = await fetch(
      `${apiBase}/v1/products/${params.id}`,
      { next: { revalidate: 300 } } as RequestInit,
    );

    if (!response.ok) {
      return { title: 'Product Not Found' };
    }

    const product = await response.json();
    const description = product.description
      ? product.description.length > 155
        ? `${product.description.slice(0, 152)}…`
        : product.description
      : 'B2B marketplace product listing';

    const image =
      Array.isArray(product.media) && product.media.length > 0
        ? product.media[0].displayUrl || product.media[0].thumbSrc
        : undefined;

    return {
      title: `${product.title} | Smart Commerce Platform`,
      description,
      openGraph: {
        title: product.title,
        description,
        type: 'website',
        ...(image ? { images: [{ url: image, alt: product.title }] } : {}),
      },
    };
  } catch {
    return { title: 'Product | Smart Commerce Platform' };
  }
}

export default function ProductPage() {
  return <ProductDetailClient />;
}

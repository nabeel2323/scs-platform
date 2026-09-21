import { sql, SQLWrapper } from 'drizzle-orm';
import { products, productMedia } from './catalog.schema';

// ECMAScript trim whitespace, including nonbreaking spaces and the BOM.
const trimCharacters = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
export const trimProductReference = (value: SQLWrapper) => sql`btrim(${value}, ${trimCharacters})`;

/** Counts stored image references, not successful uploads or reachable objects. */
export const productImageCount = sql<number>`(
  select count(distinct ref)::integer from (
    select ${trimProductReference(sql`image #>> '{}'`)} as ref
    from jsonb_array_elements(case when jsonb_typeof(${products.images}) = 'array'
      then ${products.images} else '[]'::jsonb end) as image
    where jsonb_typeof(image) = 'string'
    union all
    select ${trimProductReference(productMedia.url)} as ref
    from ${productMedia} where ${productMedia.productId} = ${products.id}
      and ${productMedia.mediaType} = 'IMAGE'
  ) image_refs where ref <> ''
)`;

export function imageReferences(images: unknown, media: { mediaType: string; url: string }[] = []): string[] {
  const refs: unknown[] = Array.isArray(images) ? images : [];
  return [...new Set([...refs, ...media.filter(m => m.mediaType === 'IMAGE').map(m => m.url)]
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim()).filter(Boolean))];
}

export function isProductMediaKey(value: string): boolean {
  return /^products\/[A-Za-z0-9][^\s\\?#%]*$/.test(value)
    && value.split('/').every(segment => segment !== '.' && segment !== '..' && segment !== '');
}

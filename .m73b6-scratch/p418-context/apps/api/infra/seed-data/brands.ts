/**
 * Production Catalog Seed — Brands.
 *
 * 18 real IT brands.  Each slug is the stable external reference and is
 * globally unique (UNIQUE constraint on brands.slug).
 */

import type { SeedBrand } from './types';

export const BRANDS: SeedBrand[] = [
  { slug: 'dell', name: 'Dell', nameAr: 'ديل', description: 'Enterprise and consumer computing, servers, and peripherals' },
  { slug: 'lenovo', name: 'Lenovo', nameAr: 'لينوفو', description: 'PCs, laptops, workstations, and smart devices' },
  { slug: 'hp', name: 'HP', nameAr: 'إتش بي', description: 'Computing, printing, and digital solutions' },
  { slug: 'apple', name: 'Apple', nameAr: 'آبل', description: 'Mac computers, iPhones, iPads, and accessories' },
  { slug: 'asus', name: 'ASUS', nameAr: 'أسوس', description: 'Laptops, motherboards, and networking equipment' },
  { slug: 'acer', name: 'Acer', nameAr: 'أيسر', description: 'Laptops, desktops, monitors, and projectors' },
  { slug: 'msi', name: 'MSI', nameAr: 'إم إس آي', description: 'Gaming laptops, desktops, and components' },
  { slug: 'samsung', name: 'Samsung', nameAr: 'سامسونج', description: 'Electronics, semiconductors, and displays' },
  { slug: 'lg', name: 'LG', nameAr: 'إل جي', description: 'Electronics, displays, and home appliances' },
  { slug: 'tp-link', name: 'TP-Link', nameAr: 'تي بي-لينك', description: 'Networking equipment and smart home devices' },
  { slug: 'ubiquiti', name: 'Ubiquiti', nameAr: 'يوبيكويتي', description: 'Enterprise networking, surveillance, and access control' },
  { slug: 'logitech', name: 'Logitech', nameAr: 'لوجيتك', description: 'Peripherals, video collaboration, and accessories' },
  { slug: 'kingston', name: 'Kingston', nameAr: 'كينغستون', description: 'Memory modules, SSDs, and USB flash drives' },
  { slug: 'western-digital', name: 'Western Digital', nameAr: 'ويسترن ديجيتال', description: 'Data storage devices and solutions' },
  { slug: 'seagate', name: 'Seagate', nameAr: 'سيجيت', description: 'Hard drives, SSDs, and data storage solutions' },
  { slug: 'intel', name: 'Intel', nameAr: 'إنتل', description: 'Processors, chipsets, and semiconductor products' },
  { slug: 'amd', name: 'AMD', nameAr: 'أي إم دي', description: 'Processors, graphics, and adaptive computing' },
  { slug: 'nvidia', name: 'NVIDIA', nameAr: 'إنفيديا', description: 'GPUs, AI computing, and professional visualization' },
];

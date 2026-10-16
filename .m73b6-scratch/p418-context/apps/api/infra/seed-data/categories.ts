/**
 * Production Catalog Seed — Category hierarchy.
 *
 * Platform-owned (store_id = NULL).  Materialized path is computed by the
 * orchestrator from the parentSlug references.
 *
 * ~22 categories covering the core IT product taxonomy.
 */

import type { SeedCategory } from './types';

export const CATEGORIES: SeedCategory[] = [
  // ── Root ──────────────────────────────────────────────────────────────
  { slug: 'computers-it', name: 'Computers & IT', nameAr: 'أجهزة الكمبيوتر وتكنولوجيا المعلومات', description: 'Computers, peripherals, components, and networking equipment', sortOrder: 10 },

  // ── Laptops ───────────────────────────────────────────────────────────
  { slug: 'laptops', name: 'Laptops', nameAr: 'أجهزة الكمبيوتر المحمولة', description: 'Portable computers for business, gaming, and creative work', parentSlug: 'computers-it', sortOrder: 10 },
  { slug: 'business-laptops', name: 'Business Laptops', nameAr: 'أجهزة كمبيوتر محمولة للأعمال', description: 'Durable laptops built for enterprise use', parentSlug: 'laptops', sortOrder: 10 },
  { slug: 'gaming-laptops', name: 'Gaming Laptops', nameAr: 'أجهزة كمبيوتر محمولة للألعاب', description: 'High-performance laptops with dedicated graphics', parentSlug: 'laptops', sortOrder: 20 },
  { slug: 'workstation-laptops', name: 'Workstation Laptops', nameAr: 'أجهزة كمبيوتر محمولة للعمل', description: 'Mobile workstations for CAD, 3D, and data science', parentSlug: 'laptops', sortOrder: 30 },
  { slug: 'ultrabooks', name: 'Ultrabooks', nameAr: 'أجهزة ألترا بوك', description: 'Thin and light premium laptops', parentSlug: 'laptops', sortOrder: 40 },

  // ── Desktops ──────────────────────────────────────────────────────────
  { slug: 'desktops', name: 'Desktop Computers', nameAr: 'أجهزة الكمبيوتر المكتبية', description: 'Tower and small-form-factor desktop PCs', parentSlug: 'computers-it', sortOrder: 20 },

  // ── Monitors ──────────────────────────────────────────────────────────
  { slug: 'monitors', name: 'Monitors', nameAr: 'الشاشات', description: 'Desktop displays and professional monitors', parentSlug: 'computers-it', sortOrder: 30 },

  // ── Computer Components ───────────────────────────────────────────────
  { slug: 'components', name: 'Computer Components', nameAr: 'مكونات الكمبيوتر', description: 'Internal hardware components', parentSlug: 'computers-it', sortOrder: 40 },
  { slug: 'processors', name: 'Processors', nameAr: 'المعالجات', description: 'CPU processors for desktop and server', parentSlug: 'components', sortOrder: 10 },
  { slug: 'graphics-cards', name: 'Graphics Cards', nameAr: 'بطاقات الرسومات', description: 'Dedicated GPUs for workstation and gaming', parentSlug: 'components', sortOrder: 20 },
  { slug: 'memory', name: 'Memory', nameAr: 'الذاكرة', description: 'RAM modules for desktop and server', parentSlug: 'components', sortOrder: 30 },
  { slug: 'internal-storage', name: 'Internal Storage', nameAr: 'التخزين الداخلي', description: 'SSD and HDD internal drives', parentSlug: 'components', sortOrder: 40 },

  // ── Networking ────────────────────────────────────────────────────────
  { slug: 'networking', name: 'Networking', nameAr: 'الشبكات', description: 'Network infrastructure equipment', parentSlug: 'computers-it', sortOrder: 50 },
  { slug: 'routers', name: 'Routers', nameAr: 'أجهزة التوجيه', description: 'Enterprise and prosumer routers', parentSlug: 'networking', sortOrder: 10 },
  { slug: 'switches', name: 'Switches', nameAr: 'مفاتيح الشبكة', description: 'Managed and unmanaged network switches', parentSlug: 'networking', sortOrder: 20 },
  { slug: 'access-points', name: 'Wireless Access Points', nameAr: 'نقاط الوصول اللاسلكي', description: 'Wi-Fi access points and controllers', parentSlug: 'networking', sortOrder: 30 },

  // ── Peripherals ───────────────────────────────────────────────────────
  { slug: 'peripherals', name: 'Peripherals', nameAr: 'الأجهزة الطرفية', description: 'Input devices, audio, and video peripherals', parentSlug: 'computers-it', sortOrder: 60 },
  { slug: 'keyboards', name: 'Keyboards', nameAr: 'لوحات المفاتيح', description: 'Mechanical, membrane, and ergonomic keyboards', parentSlug: 'peripherals', sortOrder: 10 },
  { slug: 'mice', name: 'Mice', nameAr: 'أجهزة الماوس', description: 'Wired and wireless mice', parentSlug: 'peripherals', sortOrder: 20 },
  { slug: 'webcams', name: 'Webcams', nameAr: 'كاميرات الويب', description: 'USB webcams for conferencing', parentSlug: 'peripherals', sortOrder: 30 },
  { slug: 'headsets', name: 'Headsets', nameAr: 'سماعات الرأس', description: 'Wired and wireless headsets', parentSlug: 'peripherals', sortOrder: 40 },

  // ── Printers ──────────────────────────────────────────────────────────
  { slug: 'printers', name: 'Printers', nameAr: 'الطابعات', description: 'Laser and inkjet printers', parentSlug: 'computers-it', sortOrder: 70 },
];

/**
 * Production Catalog Seed — Product types and their attribute configurations.
 *
 * Each product type declares which attributes apply, which are required,
 * filterable, searchable, comparable, and which define the variant matrix.
 */

import type { SeedProductType } from './types';

// ── Shared attribute config builders ────────────────────────────────────────

function laptopAttrs(): SeedProductType['attributes'] {
  return [
    // General
    { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true, filterable: false, comparable: false },
    { attributeCode: 'series', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 2, searchable: true, filterable: false, comparable: false },
    { attributeCode: 'generation', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 3, searchable: false, filterable: false, comparable: false },
    // Processor
    { attributeCode: 'cpu_manufacturer', groupName: 'Processor', required: true, scope: 'VARIANT', displayOrder: 10, filterable: true, searchable: true, comparable: true },
    { attributeCode: 'cpu_family', groupName: 'Processor', required: true, scope: 'VARIANT', displayOrder: 11, filterable: true, searchable: true, comparable: true },
    { attributeCode: 'cpu_model', groupName: 'Processor', required: true, scope: 'VARIANT', displayOrder: 12, searchable: true, comparable: true },
    { attributeCode: 'cpu_cores', groupName: 'Processor', required: false, scope: 'VARIANT', displayOrder: 13, comparable: true },
    { attributeCode: 'cpu_threads', groupName: 'Processor', required: false, scope: 'VARIANT', displayOrder: 14, comparable: true },
    { attributeCode: 'cpu_base_freq', groupName: 'Processor', required: false, scope: 'VARIANT', displayOrder: 15, comparable: true },
    { attributeCode: 'cpu_turbo_freq', groupName: 'Processor', required: false, scope: 'VARIANT', displayOrder: 16, comparable: true },
    // Memory
    { attributeCode: 'ram_capacity', groupName: 'Memory', required: true, scope: 'VARIANT', displayOrder: 20, filterable: true, sortable: true, comparable: true },
    { attributeCode: 'ram_type', groupName: 'Memory', required: true, scope: 'VARIANT', displayOrder: 21, filterable: true, comparable: true },
    { attributeCode: 'ram_speed', groupName: 'Memory', required: false, scope: 'VARIANT', displayOrder: 22, comparable: true },
    { attributeCode: 'max_ram', groupName: 'Memory', required: false, scope: 'PRODUCT', displayOrder: 23 },
    { attributeCode: 'ram_slots', groupName: 'Memory', required: false, scope: 'PRODUCT', displayOrder: 24 },
    // Storage
    { attributeCode: 'storage_capacity', groupName: 'Storage', required: true, scope: 'VARIANT', displayOrder: 30, filterable: true, sortable: true, comparable: true },
    { attributeCode: 'storage_type', groupName: 'Storage', required: true, scope: 'VARIANT', displayOrder: 31, filterable: true, comparable: true },
    { attributeCode: 'storage_slots', groupName: 'Storage', required: false, scope: 'PRODUCT', displayOrder: 32 },
    // Display
    { attributeCode: 'display_size', groupName: 'Display', required: true, scope: 'VARIANT', displayOrder: 40, filterable: true, sortable: true, comparable: true },
    { attributeCode: 'resolution', groupName: 'Display', required: true, scope: 'VARIANT', displayOrder: 41, filterable: true, comparable: true },
    { attributeCode: 'panel_type', groupName: 'Display', required: false, scope: 'VARIANT', displayOrder: 42, filterable: true, comparable: true },
    { attributeCode: 'refresh_rate', groupName: 'Display', required: false, scope: 'VARIANT', displayOrder: 43, comparable: true },
    { attributeCode: 'brightness', groupName: 'Display', required: false, scope: 'VARIANT', displayOrder: 44, comparable: true },
    { attributeCode: 'touchscreen', groupName: 'Display', required: false, scope: 'VARIANT', displayOrder: 45, filterable: true },
    // Graphics
    { attributeCode: 'gpu_type', groupName: 'Graphics', required: false, scope: 'VARIANT', displayOrder: 50, filterable: true, comparable: true },
    { attributeCode: 'gpu_model', groupName: 'Graphics', required: false, scope: 'VARIANT', displayOrder: 51, comparable: true },
    { attributeCode: 'gpu_memory', groupName: 'Graphics', required: false, scope: 'VARIANT', displayOrder: 52, comparable: true },
    // OS
    { attributeCode: 'os', groupName: 'Operating System', required: false, scope: 'VARIANT', displayOrder: 60, filterable: true },
    // Connectivity
    { attributeCode: 'wifi_standard', groupName: 'Connectivity', required: false, scope: 'VARIANT', displayOrder: 70, filterable: true },
    { attributeCode: 'bluetooth_version', groupName: 'Connectivity', required: false, scope: 'VARIANT', displayOrder: 71 },
    { attributeCode: 'ethernet', groupName: 'Connectivity', required: false, scope: 'VARIANT', displayOrder: 72 },
    // Ports
    { attributeCode: 'usb_a_count', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 80 },
    { attributeCode: 'usb_c_count', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 81 },
    { attributeCode: 'thunderbolt_count', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 82 },
    { attributeCode: 'hdmi_count', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 83 },
    { attributeCode: 'audio_jack', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 84 },
    { attributeCode: 'sd_card_reader', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 85 },
    { attributeCode: 'rj45', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 86 },
    // Keyboard
    { attributeCode: 'backlit_keyboard', groupName: 'Keyboard', required: false, scope: 'VARIANT', displayOrder: 90 },
    { attributeCode: 'numeric_keypad', groupName: 'Keyboard', required: false, scope: 'VARIANT', displayOrder: 91 },
    // Battery
    { attributeCode: 'battery_capacity', groupName: 'Battery', required: false, scope: 'VARIANT', displayOrder: 100, comparable: true },
    { attributeCode: 'battery_type', groupName: 'Battery', required: false, scope: 'VARIANT', displayOrder: 101 },
    // Physical
    { attributeCode: 'weight', groupName: 'Physical', required: false, scope: 'VARIANT', displayOrder: 110, sortable: true, comparable: true },
    { attributeCode: 'color', groupName: 'Physical', required: false, scope: 'VARIANT', displayOrder: 111, filterable: true },
    { attributeCode: 'chassis_material', groupName: 'Physical', required: false, scope: 'VARIANT', displayOrder: 112 },
    // Security
    { attributeCode: 'fingerprint_reader', groupName: 'Security', required: false, scope: 'VARIANT', displayOrder: 120 },
    { attributeCode: 'ir_camera', groupName: 'Security', required: false, scope: 'VARIANT', displayOrder: 121 },
    { attributeCode: 'smart_card_reader', groupName: 'Security', required: false, scope: 'VARIANT', displayOrder: 122 },
    { attributeCode: 'tpm', groupName: 'Security', required: false, scope: 'VARIANT', displayOrder: 123 },
    // Warranty
    { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
  ];
}

export const PRODUCT_TYPES: SeedProductType[] = [

  // ── Laptops ─────────────────────────────────────────────────────────────
  {
    code: 'laptop', name: 'Laptop', nameAr: 'جهاز كمبيوتر محمول',
    description: 'General-purpose laptop computer',
    categorySlug: 'laptops',
    variantDimensions: ['cpu_family', 'ram_capacity', 'storage_capacity', 'display_size', 'color'],
    attributes: laptopAttrs(),
  },
  {
    code: 'business-laptop', name: 'Business Laptop', nameAr: 'جهاز كمبيوتر محمول للأعمال',
    description: 'Enterprise-grade laptop with manageability and security features',
    categorySlug: 'business-laptops',
    variantDimensions: ['cpu_family', 'ram_capacity', 'storage_capacity', 'display_size', 'color'],
    attributes: laptopAttrs(),
  },
  {
    code: 'gaming-laptop', name: 'Gaming Laptop', nameAr: 'جهاز كمبيوتر محمول للألعاب',
    description: 'High-performance laptop with dedicated GPU for gaming',
    categorySlug: 'gaming-laptops',
    variantDimensions: ['cpu_family', 'ram_capacity', 'storage_capacity', 'display_size', 'gpu_model', 'color'],
    attributes: laptopAttrs(),
  },
  {
    code: 'workstation-laptop', name: 'Workstation Laptop', nameAr: 'جهاز كمبيوتر محمول للعمل',
    description: 'ISV-certified mobile workstation for professional applications',
    categorySlug: 'workstation-laptops',
    variantDimensions: ['cpu_family', 'ram_capacity', 'storage_capacity', 'display_size', 'gpu_model', 'color'],
    attributes: laptopAttrs(),
  },
  {
    code: 'ultrabook', name: 'Ultrabook', nameAr: 'ألترا بوك',
    description: 'Thin and light premium laptop',
    categorySlug: 'ultrabooks',
    variantDimensions: ['cpu_family', 'ram_capacity', 'storage_capacity', 'display_size', 'color'],
    attributes: laptopAttrs(),
  },

  // ── Desktops ────────────────────────────────────────────────────────────
  {
    code: 'desktop-pc', name: 'Desktop PC', nameAr: 'جهاز كمبيوتر مكتبي',
    description: 'Tower or small-form-factor desktop computer',
    categorySlug: 'desktops',
    variantDimensions: ['cpu_family', 'ram_capacity', 'storage_capacity', 'gpu_model'],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'series', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 2, searchable: true },
      { attributeCode: 'form_factor', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 3, filterable: true },
      { attributeCode: 'cpu_manufacturer', groupName: 'Processor', required: true, scope: 'VARIANT', displayOrder: 10, filterable: true },
      { attributeCode: 'cpu_family', groupName: 'Processor', required: true, scope: 'VARIANT', displayOrder: 11, filterable: true, comparable: true },
      { attributeCode: 'cpu_model', groupName: 'Processor', required: true, scope: 'VARIANT', displayOrder: 12 },
      { attributeCode: 'cpu_cores', groupName: 'Processor', required: false, scope: 'VARIANT', displayOrder: 13, comparable: true },
      { attributeCode: 'ram_capacity', groupName: 'Memory', required: true, scope: 'VARIANT', displayOrder: 20, filterable: true, comparable: true },
      { attributeCode: 'ram_type', groupName: 'Memory', required: true, scope: 'VARIANT', displayOrder: 21, filterable: true },
      { attributeCode: 'max_ram', groupName: 'Memory', required: false, scope: 'PRODUCT', displayOrder: 22 },
      { attributeCode: 'ram_slots', groupName: 'Memory', required: false, scope: 'PRODUCT', displayOrder: 23 },
      { attributeCode: 'storage_capacity', groupName: 'Storage', required: true, scope: 'VARIANT', displayOrder: 30, filterable: true, comparable: true },
      { attributeCode: 'storage_type', groupName: 'Storage', required: true, scope: 'VARIANT', displayOrder: 31, filterable: true },
      { attributeCode: 'storage_slots', groupName: 'Storage', required: false, scope: 'PRODUCT', displayOrder: 32 },
      { attributeCode: 'gpu_type', groupName: 'Graphics', required: false, scope: 'VARIANT', displayOrder: 40, filterable: true },
      { attributeCode: 'gpu_model', groupName: 'Graphics', required: false, scope: 'VARIANT', displayOrder: 41 },
      { attributeCode: 'gpu_memory', groupName: 'Graphics', required: false, scope: 'VARIANT', displayOrder: 42, comparable: true },
      { attributeCode: 'os', groupName: 'Operating System', required: false, scope: 'VARIANT', displayOrder: 50, filterable: true },
      { attributeCode: 'wifi_standard', groupName: 'Connectivity', required: false, scope: 'VARIANT', displayOrder: 60 },
      { attributeCode: 'bluetooth_version', groupName: 'Connectivity', required: false, scope: 'VARIANT', displayOrder: 61 },
      { attributeCode: 'ethernet', groupName: 'Connectivity', required: false, scope: 'VARIANT', displayOrder: 62 },
      { attributeCode: 'usb_a_count', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 70 },
      { attributeCode: 'usb_c_count', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 71 },
      { attributeCode: 'hdmi_count', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 72 },
      { attributeCode: 'audio_jack', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 73 },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },

  // ── Monitors ────────────────────────────────────────────────────────────
  {
    code: 'monitor', name: 'Monitor', nameAr: 'شاشة',
    description: 'Desktop display monitor',
    categorySlug: 'monitors',
    variantDimensions: ['display_size', 'resolution', 'color'],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'series', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 2 },
      { attributeCode: 'display_size', groupName: 'Display', required: true, scope: 'VARIANT', displayOrder: 10, filterable: true, sortable: true, comparable: true },
      { attributeCode: 'resolution', groupName: 'Display', required: true, scope: 'VARIANT', displayOrder: 11, filterable: true, comparable: true },
      { attributeCode: 'panel_type', groupName: 'Display', required: true, scope: 'VARIANT', displayOrder: 12, filterable: true, comparable: true },
      { attributeCode: 'refresh_rate', groupName: 'Display', required: true, scope: 'VARIANT', displayOrder: 13, filterable: true, sortable: true, comparable: true },
      { attributeCode: 'brightness', groupName: 'Display', required: false, scope: 'VARIANT', displayOrder: 14, comparable: true },
      { attributeCode: 'touchscreen', groupName: 'Display', required: false, scope: 'VARIANT', displayOrder: 15 },
      { attributeCode: 'hdmi_count', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 20 },
      { attributeCode: 'usb_a_count', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 21 },
      { attributeCode: 'usb_c_count', groupName: 'Ports', required: false, scope: 'VARIANT', displayOrder: 22 },
      { attributeCode: 'weight', groupName: 'Physical', required: false, scope: 'VARIANT', displayOrder: 30, comparable: true },
      { attributeCode: 'color', groupName: 'Physical', required: false, scope: 'VARIANT', displayOrder: 31, filterable: true },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },

  // ── Components ──────────────────────────────────────────────────────────
  {
    code: 'processor', name: 'Processor', nameAr: 'معالج',
    description: 'CPU processor',
    categorySlug: 'processors',
    variantDimensions: [],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'series', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 2 },
      { attributeCode: 'generation', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 3 },
      { attributeCode: 'cpu_manufacturer', groupName: 'Processor', required: true, scope: 'PRODUCT', displayOrder: 10, filterable: true },
      { attributeCode: 'cpu_family', groupName: 'Processor', required: true, scope: 'PRODUCT', displayOrder: 11, filterable: true },
      { attributeCode: 'cpu_model', groupName: 'Processor', required: true, scope: 'PRODUCT', displayOrder: 12 },
      { attributeCode: 'cpu_cores', groupName: 'Processor', required: true, scope: 'PRODUCT', displayOrder: 13, filterable: true, sortable: true, comparable: true },
      { attributeCode: 'cpu_threads', groupName: 'Processor', required: true, scope: 'PRODUCT', displayOrder: 14, comparable: true },
      { attributeCode: 'cpu_base_freq', groupName: 'Processor', required: false, scope: 'PRODUCT', displayOrder: 15, comparable: true },
      { attributeCode: 'cpu_turbo_freq', groupName: 'Processor', required: false, scope: 'PRODUCT', displayOrder: 16, comparable: true },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },
  {
    code: 'graphics-card', name: 'Graphics Card', nameAr: 'بطاقة رسومات',
    description: 'Dedicated GPU',
    categorySlug: 'graphics-cards',
    variantDimensions: [],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'series', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 2 },
      { attributeCode: 'gpu_model', groupName: 'Graphics', required: true, scope: 'PRODUCT', displayOrder: 10, filterable: true },
      { attributeCode: 'gpu_memory', groupName: 'Graphics', required: true, scope: 'PRODUCT', displayOrder: 11, filterable: true, sortable: true, comparable: true },
      { attributeCode: 'interface_type', groupName: 'Ports', required: false, scope: 'PRODUCT', displayOrder: 20 },
      { attributeCode: 'hdmi_count', groupName: 'Ports', required: false, scope: 'PRODUCT', displayOrder: 21 },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },
  {
    code: 'ram-module', name: 'RAM Module', nameAr: 'وحدة ذاكرة',
    description: 'Memory module',
    categorySlug: 'memory',
    variantDimensions: [],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'ram_capacity', groupName: 'Memory', required: true, scope: 'PRODUCT', displayOrder: 10, filterable: true, sortable: true, comparable: true },
      { attributeCode: 'ram_type', groupName: 'Memory', required: true, scope: 'PRODUCT', displayOrder: 11, filterable: true },
      { attributeCode: 'ram_speed', groupName: 'Memory', required: true, scope: 'PRODUCT', displayOrder: 12, comparable: true },
      { attributeCode: 'form_factor', groupName: 'Physical', required: false, scope: 'PRODUCT', displayOrder: 20, filterable: true },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },
  {
    code: 'ssd', name: 'SSD', nameAr: 'قرص SSD',
    description: 'Solid-state drive',
    categorySlug: 'internal-storage',
    variantDimensions: [],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'series', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 2 },
      { attributeCode: 'storage_capacity', groupName: 'Storage', required: true, scope: 'PRODUCT', displayOrder: 10, filterable: true, sortable: true, comparable: true },
      { attributeCode: 'storage_type', groupName: 'Storage', required: true, scope: 'PRODUCT', displayOrder: 11, filterable: true },
      { attributeCode: 'interface_type', groupName: 'Ports', required: false, scope: 'PRODUCT', displayOrder: 20, filterable: true },
      { attributeCode: 'form_factor', groupName: 'Physical', required: false, scope: 'PRODUCT', displayOrder: 30, filterable: true },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },

  // ── Networking ──────────────────────────────────────────────────────────
  {
    code: 'router', name: 'Router', nameAr: 'جهاز توجيه',
    description: 'Network router',
    categorySlug: 'routers',
    variantDimensions: [],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'series', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 2 },
      { attributeCode: 'port_count', groupName: 'Network', required: false, scope: 'PRODUCT', displayOrder: 10, filterable: true },
      { attributeCode: 'port_speed', groupName: 'Network', required: false, scope: 'PRODUCT', displayOrder: 11, filterable: true },
      { attributeCode: 'wifi_standard', groupName: 'Connectivity', required: false, scope: 'PRODUCT', displayOrder: 20, filterable: true },
      { attributeCode: 'throughput', groupName: 'Network', required: false, scope: 'PRODUCT', displayOrder: 12 },
      { attributeCode: 'form_factor', groupName: 'Physical', required: false, scope: 'PRODUCT', displayOrder: 30 },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },
  {
    code: 'network-switch', name: 'Network Switch', nameAr: 'مفتاح شبكة',
    description: 'Managed or unmanaged network switch',
    categorySlug: 'switches',
    variantDimensions: [],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'port_count', groupName: 'Network', required: true, scope: 'PRODUCT', displayOrder: 10, filterable: true, sortable: true },
      { attributeCode: 'port_speed', groupName: 'Network', required: true, scope: 'PRODUCT', displayOrder: 11, filterable: true },
      { attributeCode: 'managed', groupName: 'Network', required: false, scope: 'PRODUCT', displayOrder: 12, filterable: true },
      { attributeCode: 'poe_support', groupName: 'Network', required: false, scope: 'PRODUCT', displayOrder: 13, filterable: true },
      { attributeCode: 'form_factor', groupName: 'Physical', required: false, scope: 'PRODUCT', displayOrder: 20 },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },
  {
    code: 'wireless-ap', name: 'Wireless Access Point', nameAr: 'نقطة وصول لاسلكي',
    description: 'Wi-Fi access point',
    categorySlug: 'access-points',
    variantDimensions: [],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'series', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 2 },
      { attributeCode: 'wifi_standard', groupName: 'Connectivity', required: true, scope: 'PRODUCT', displayOrder: 10, filterable: true },
      { attributeCode: 'throughput', groupName: 'Network', required: false, scope: 'PRODUCT', displayOrder: 11 },
      { attributeCode: 'port_count', groupName: 'Network', required: false, scope: 'PRODUCT', displayOrder: 12 },
      { attributeCode: 'port_speed', groupName: 'Network', required: false, scope: 'PRODUCT', displayOrder: 13 },
      { attributeCode: 'poe_support', groupName: 'Network', required: false, scope: 'PRODUCT', displayOrder: 14, filterable: true },
      { attributeCode: 'frequency_band', groupName: 'Connectivity', required: false, scope: 'PRODUCT', displayOrder: 20, filterable: true },
      { attributeCode: 'form_factor', groupName: 'Physical', required: false, scope: 'PRODUCT', displayOrder: 30 },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },

  // ── Peripherals ─────────────────────────────────────────────────────────
  {
    code: 'keyboard', name: 'Keyboard', nameAr: 'لوحة مفاتيح',
    description: 'Computer keyboard',
    categorySlug: 'keyboards',
    variantDimensions: ['color', 'connection_type'],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'connection_type', groupName: 'Connectivity', required: true, scope: 'VARIANT', displayOrder: 10, filterable: true },
      { attributeCode: 'switch_type', groupName: 'Keyboard', required: false, scope: 'VARIANT', displayOrder: 20, filterable: true },
      { attributeCode: 'backlit_keyboard', groupName: 'Keyboard', required: false, scope: 'VARIANT', displayOrder: 21, filterable: true },
      { attributeCode: 'numeric_keypad', groupName: 'Keyboard', required: false, scope: 'VARIANT', displayOrder: 22 },
      { attributeCode: 'color', groupName: 'Physical', required: false, scope: 'VARIANT', displayOrder: 30, filterable: true },
      { attributeCode: 'bluetooth_version', groupName: 'Connectivity', required: false, scope: 'VARIANT', displayOrder: 40 },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },
  {
    code: 'mouse', name: 'Mouse', nameAr: 'جهاز ماوس',
    description: 'Computer mouse',
    categorySlug: 'mice',
    variantDimensions: ['color', 'connection_type'],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'connection_type', groupName: 'Connectivity', required: true, scope: 'VARIANT', displayOrder: 10, filterable: true },
      { attributeCode: 'dpi', groupName: 'General', required: false, scope: 'VARIANT', displayOrder: 20, sortable: true, comparable: true },
      { attributeCode: 'color', groupName: 'Physical', required: false, scope: 'VARIANT', displayOrder: 30, filterable: true },
      { attributeCode: 'bluetooth_version', groupName: 'Connectivity', required: false, scope: 'VARIANT', displayOrder: 40 },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },
  {
    code: 'headset', name: 'Headset', nameAr: 'سماعة رأس',
    description: 'Audio headset',
    categorySlug: 'headsets',
    variantDimensions: ['color', 'connection_type'],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'connection_type', groupName: 'Connectivity', required: true, scope: 'VARIANT', displayOrder: 10, filterable: true },
      { attributeCode: 'driver_size', groupName: 'Camera & Audio', required: false, scope: 'VARIANT', displayOrder: 20, comparable: true },
      { attributeCode: 'noise_cancellation', groupName: 'Camera & Audio', required: false, scope: 'VARIANT', displayOrder: 21, filterable: true },
      { attributeCode: 'microphone', groupName: 'Camera & Audio', required: false, scope: 'VARIANT', displayOrder: 22, filterable: true },
      { attributeCode: 'color', groupName: 'Physical', required: false, scope: 'VARIANT', displayOrder: 30, filterable: true },
      { attributeCode: 'bluetooth_version', groupName: 'Connectivity', required: false, scope: 'VARIANT', displayOrder: 40 },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },
  {
    code: 'webcam', name: 'Webcam', nameAr: 'كاميرا ويب',
    description: 'USB webcam for conferencing',
    categorySlug: 'webcams',
    variantDimensions: [],
    attributes: [
      { attributeCode: 'model', groupName: 'General', required: true, scope: 'PRODUCT', displayOrder: 1, searchable: true },
      { attributeCode: 'resolution_sensor', groupName: 'General', required: false, scope: 'PRODUCT', displayOrder: 10, filterable: true },
      { attributeCode: 'microphone', groupName: 'Camera & Audio', required: false, scope: 'PRODUCT', displayOrder: 20, filterable: true },
      { attributeCode: 'connection_type', groupName: 'Connectivity', required: false, scope: 'PRODUCT', displayOrder: 30, filterable: true },
      { attributeCode: 'warranty', groupName: 'Warranty', required: false, scope: 'PRODUCT', displayOrder: 200 },
    ],
  },
];

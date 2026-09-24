/**
 * Production Catalog Seed — Attribute definitions, options, and groups.
 *
 * Covers the full IT product specification space.  Each attribute uses the
 * correct type (SELECT for controlled vocabularies, DECIMAL for measurements,
 * INTEGER for counts, BOOLEAN for yes/no, TEXT for free-form).
 *
 * Scope: PRODUCT for attributes that describe the product family,
 *        VARIANT for attributes that differ between configurations.
 */

import type { SeedAttribute, SeedAttributeGroup } from './types';

// ── Attribute Groups ────────────────────────────────────────────────────────

export const ATTRIBUTE_GROUPS: SeedAttributeGroup[] = [
  { name: 'General', nameAr: 'عام', kind: 'general' },
  { name: 'Processor', nameAr: 'المعالج', kind: 'processor' },
  { name: 'Memory', nameAr: 'الذاكرة', kind: 'memory' },
  { name: 'Storage', nameAr: 'التخزين', kind: 'storage' },
  { name: 'Display', nameAr: 'الشاشة', kind: 'display' },
  { name: 'Graphics', nameAr: 'الرسومات', kind: 'graphics' },
  { name: 'Operating System', nameAr: 'نظام التشغيل', kind: 'os' },
  { name: 'Connectivity', nameAr: 'الاتصال', kind: 'connectivity' },
  { name: 'Ports', nameAr: 'المنافذ', kind: 'ports' },
  { name: 'Camera & Audio', nameAr: 'الكاميرا والصوت', kind: 'camera-audio' },
  { name: 'Keyboard', nameAr: 'لوحة المفاتيح', kind: 'keyboard' },
  { name: 'Battery', nameAr: 'البطارية', kind: 'battery' },
  { name: 'Physical', nameAr: 'الهيكل', kind: 'physical' },
  { name: 'Security', nameAr: 'الأمان', kind: 'security' },
  { name: 'Warranty', nameAr: 'الضمان', kind: 'warranty' },
  { name: 'Network', nameAr: 'الشبكة', kind: 'network' },
];

// ── Attribute Definitions ───────────────────────────────────────────────────

export const ATTRIBUTES: SeedAttribute[] = [

  // ═══ General ═══════════════════════════════════════════════════════════
  { code: 'model', name: 'Model', nameAr: 'الطراز', type: 'TEXT', scope: 'PRODUCT' },
  { code: 'series', name: 'Series', nameAr: 'السلسلة', type: 'TEXT', scope: 'PRODUCT' },
  { code: 'generation', name: 'Generation', nameAr: 'الجيل', type: 'TEXT', scope: 'PRODUCT' },

  // ═══ Processor ═════════════════════════════════════════════════════════
  {
    code: 'cpu_manufacturer', name: 'CPU Manufacturer', nameAr: 'مصنع المعالج',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'Intel', label: 'Intel', sortOrder: 1 },
      { value: 'AMD', label: 'AMD', sortOrder: 2 },
      { value: 'Apple', label: 'Apple', sortOrder: 3 },
      { value: 'Qualcomm', label: 'Qualcomm', sortOrder: 4 },
    ],
  },
  {
    code: 'cpu_family', name: 'CPU Family', nameAr: 'عائلة المعالج',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'Core Ultra 5', label: 'Core Ultra 5', sortOrder: 1 },
      { value: 'Core Ultra 7', label: 'Core Ultra 7', sortOrder: 2 },
      { value: 'Core Ultra 9', label: 'Core Ultra 9', sortOrder: 3 },
      { value: 'Core i5', label: 'Core i5', sortOrder: 4 },
      { value: 'Core i7', label: 'Core i7', sortOrder: 5 },
      { value: 'Core i9', label: 'Core i9', sortOrder: 6 },
      { value: 'Ryzen 5', label: 'Ryzen 5', sortOrder: 7 },
      { value: 'Ryzen 7', label: 'Ryzen 7', sortOrder: 8 },
      { value: 'Ryzen 9', label: 'Ryzen 9', sortOrder: 9 },
      { value: 'Apple M3', label: 'Apple M3', sortOrder: 10 },
      { value: 'Apple M3 Pro', label: 'Apple M3 Pro', sortOrder: 11 },
      { value: 'Apple M3 Max', label: 'Apple M3 Max', sortOrder: 12 },
      { value: 'Apple M4', label: 'Apple M4', sortOrder: 13 },
      { value: 'Apple M4 Pro', label: 'Apple M4 Pro', sortOrder: 14 },
      { value: 'Apple M4 Max', label: 'Apple M4 Max', sortOrder: 15 },
      { value: 'Xeon', label: 'Xeon', sortOrder: 16 },
      { value: 'EPYC', label: 'EPYC', sortOrder: 17 },
    ],
  },
  { code: 'cpu_model', name: 'CPU Model', nameAr: 'موديل المعالج', type: 'TEXT', scope: 'VARIANT' },
  { code: 'cpu_cores', name: 'CPU Cores', nameAr: 'أنوية المعالج', type: 'INTEGER', scope: 'VARIANT' },
  { code: 'cpu_threads', name: 'CPU Threads', nameAr: 'خيوط المعالج', type: 'INTEGER', scope: 'VARIANT' },
  { code: 'cpu_base_freq', name: 'Base Frequency', nameAr: 'التردد الأساسي', type: 'DECIMAL', unit: 'GHz', scope: 'VARIANT' },
  { code: 'cpu_turbo_freq', name: 'Max Turbo Frequency', nameAr: 'أقصى تردد توربو', type: 'DECIMAL', unit: 'GHz', scope: 'VARIANT' },

  // ═══ Memory ════════════════════════════════════════════════════════════
  { code: 'ram_capacity', name: 'RAM Capacity', nameAr: 'سعة الذاكرة', type: 'DECIMAL', unit: 'GB', scope: 'VARIANT' },
  {
    code: 'ram_type', name: 'RAM Type', nameAr: 'نوع الذاكرة',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'DDR4', label: 'DDR4', sortOrder: 1 },
      { value: 'DDR5', label: 'DDR5', sortOrder: 2 },
      { value: 'LPDDR5', label: 'LPDDR5', sortOrder: 3 },
      { value: 'LPDDR5X', label: 'LPDDR5X', sortOrder: 4 },
      { value: 'DDR5 ECC', label: 'DDR5 ECC', sortOrder: 5 },
    ],
  },
  { code: 'ram_speed', name: 'RAM Speed', nameAr: 'سرعة الذاكرة', type: 'INTEGER', unit: 'MHz', scope: 'VARIANT' },
  { code: 'max_ram', name: 'Maximum RAM', nameAr: 'الحد الأقصى للذاكرة', type: 'DECIMAL', unit: 'GB', scope: 'PRODUCT' },
  { code: 'ram_slots', name: 'RAM Slots', nameAr: 'فتحات الذاكرة', type: 'INTEGER', scope: 'PRODUCT' },

  // ═══ Storage ═══════════════════════════════════════════════════════════
  { code: 'storage_capacity', name: 'Storage Capacity', nameAr: 'سعة التخزين', type: 'DECIMAL', unit: 'GB', scope: 'VARIANT' },
  {
    code: 'storage_type', name: 'Storage Type', nameAr: 'نوع التخزين',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'NVMe SSD', label: 'NVMe SSD', sortOrder: 1 },
      { value: 'SATA SSD', label: 'SATA SSD', sortOrder: 2 },
      { value: 'HDD', label: 'HDD', sortOrder: 3 },
      { value: 'eMMC', label: 'eMMC', sortOrder: 4 },
      { value: 'PCIe Gen4 NVMe', label: 'PCIe Gen4 NVMe', sortOrder: 5 },
      { value: 'PCIe Gen5 NVMe', label: 'PCIe Gen5 NVMe', sortOrder: 6 },
    ],
  },
  { code: 'storage_slots', name: 'Storage Slots', nameAr: 'فتحات التخزين', type: 'INTEGER', scope: 'PRODUCT' },

  // ═══ Display ═══════════════════════════════════════════════════════════
  { code: 'display_size', name: 'Display Size', nameAr: 'حجم الشاشة', type: 'DECIMAL', unit: 'inch', scope: 'VARIANT' },
  {
    code: 'resolution', name: 'Resolution', nameAr: 'الدقة',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: '1920x1080 (FHD)', label: '1920x1080 (FHD)', sortOrder: 1 },
      { value: '1920x1200 (WUXGA)', label: '1920x1200 (WUXGA)', sortOrder: 2 },
      { value: '2560x1440 (QHD)', label: '2560x1440 (QHD)', sortOrder: 3 },
      { value: '2560x1600 (WQXGA)', label: '2560x1600 (WQXGA)', sortOrder: 4 },
      { value: '2560x1664', label: '2560x1664', sortOrder: 5 },
      { value: '2880x1800', label: '2880x1800', sortOrder: 6 },
      { value: '3024x1964', label: '3024x1964', sortOrder: 7 },
      { value: '3440x1440 (UWQHD)', label: '3440x1440 (UWQHD)', sortOrder: 8 },
      { value: '3456x2234', label: '3456x2234', sortOrder: 9 },
      { value: '3840x2160 (4K UHD)', label: '3840x2160 (4K UHD)', sortOrder: 10 },
      { value: '3840x2400 (WQUXGA)', label: '3840x2400 (WQUXGA)', sortOrder: 11 },
      { value: '5120x3200 (5K)', label: '5120x3200 (5K)', sortOrder: 12 },
    ],
  },
  {
    code: 'panel_type', name: 'Panel Type', nameAr: 'نوع اللوحة',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'IPS', label: 'IPS', sortOrder: 1 },
      { value: 'OLED', label: 'OLED', sortOrder: 2 },
      { value: 'Mini LED', label: 'Mini LED', sortOrder: 3 },
      { value: 'TN', label: 'TN', sortOrder: 4 },
      { value: 'VA', label: 'VA', sortOrder: 5 },
      { value: 'Liquid Retina', label: 'Liquid Retina', sortOrder: 6 },
      { value: 'Liquid Retina XDR', label: 'Liquid Retina XDR', sortOrder: 7 },
    ],
  },
  { code: 'refresh_rate', name: 'Refresh Rate', nameAr: 'معدل التحديث', type: 'INTEGER', unit: 'Hz', scope: 'VARIANT' },
  { code: 'brightness', name: 'Brightness', nameAr: 'السطوع', type: 'DECIMAL', unit: 'nits', scope: 'VARIANT' },
  { code: 'touchscreen', name: 'Touchscreen', nameAr: 'شاشة تعمل باللمس', type: 'BOOLEAN', scope: 'VARIANT' },

  // ═══ Graphics ══════════════════════════════════════════════════════════
  {
    code: 'gpu_type', name: 'Graphics Type', nameAr: 'نوع الرسومات',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'Integrated', label: 'Integrated', sortOrder: 1 },
      { value: 'Dedicated', label: 'Dedicated', sortOrder: 2 },
      { value: 'Apple Silicon GPU', label: 'Apple Silicon GPU', sortOrder: 3 },
    ],
  },
  {
    code: 'gpu_model', name: 'GPU Model', nameAr: 'موديل كرت الشاشة',
    type: 'TEXT', scope: 'VARIANT',
  },
  { code: 'gpu_memory', name: 'Dedicated GPU Memory', nameAr: 'ذاكرة كرت الشاشة', type: 'DECIMAL', unit: 'GB', scope: 'VARIANT' },

  // ═══ Operating System ══════════════════════════════════════════════════
  {
    code: 'os', name: 'Operating System', nameAr: 'نظام التشغيل',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'Windows 11 Pro', label: 'Windows 11 Pro', sortOrder: 1 },
      { value: 'Windows 11 Home', label: 'Windows 11 Home', sortOrder: 2 },
      { value: 'Windows 10 Pro', label: 'Windows 10 Pro', sortOrder: 3 },
      { value: 'macOS', label: 'macOS', sortOrder: 4 },
      { value: 'Ubuntu Linux', label: 'Ubuntu Linux', sortOrder: 5 },
      { value: 'FreeDOS', label: 'FreeDOS', sortOrder: 6 },
      { value: 'No OS', label: 'No OS', sortOrder: 7 },
    ],
  },

  // ═══ Connectivity ══════════════════════════════════════════════════════
  {
    code: 'wifi_standard', name: 'Wi-Fi Standard', nameAr: 'معيار واي-فاي',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'Wi-Fi 6E (802.11ax)', label: 'Wi-Fi 6E', sortOrder: 1 },
      { value: 'Wi-Fi 6 (802.11ax)', label: 'Wi-Fi 6', sortOrder: 2 },
      { value: 'Wi-Fi 7 (802.11be)', label: 'Wi-Fi 7', sortOrder: 3 },
      { value: 'Wi-Fi 5 (802.11ac)', label: 'Wi-Fi 5', sortOrder: 4 },
    ],
  },
  {
    code: 'bluetooth_version', name: 'Bluetooth Version', nameAr: 'إصدار بلوتوث',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: '5.0', label: '5.0', sortOrder: 1 },
      { value: '5.1', label: '5.1', sortOrder: 2 },
      { value: '5.2', label: '5.2', sortOrder: 3 },
      { value: '5.3', label: '5.3', sortOrder: 4 },
      { value: '5.4', label: '5.4', sortOrder: 5 },
    ],
  },
  { code: 'ethernet', name: 'Ethernet', nameAr: 'إيثرنت', type: 'TEXT', scope: 'VARIANT' },

  // ═══ Ports ═════════════════════════════════════════════════════════════
  { code: 'usb_a_count', name: 'USB-A Ports', nameAr: 'منافذ USB-A', type: 'INTEGER', scope: 'VARIANT' },
  { code: 'usb_c_count', name: 'USB-C Ports', nameAr: 'منافذ USB-C', type: 'INTEGER', scope: 'VARIANT' },
  { code: 'thunderbolt_count', name: 'Thunderbolt Ports', nameAr: 'منافذ ثندربلت', type: 'INTEGER', scope: 'VARIANT' },
  { code: 'hdmi_count', name: 'HDMI Ports', nameAr: 'منافذ HDMI', type: 'INTEGER', scope: 'VARIANT' },
  { code: 'audio_jack', name: 'Audio Jack', nameAr: 'مقبس الصوت', type: 'TEXT', scope: 'VARIANT' },
  { code: 'sd_card_reader', name: 'SD Card Reader', nameAr: 'قارئ بطاقات SD', type: 'TEXT', scope: 'VARIANT' },
  { code: 'rj45', name: 'RJ45 (Ethernet)', nameAr: 'منفذ RJ45', type: 'BOOLEAN', scope: 'VARIANT' },

  // ═══ Keyboard ══════════════════════════════════════════════════════════
  { code: 'backlit_keyboard', name: 'Backlit Keyboard', nameAr: 'لوحة مفاتيح مضاءة', type: 'BOOLEAN', scope: 'VARIANT' },
  { code: 'numeric_keypad', name: 'Numeric Keypad', nameAr: 'لوحة أرقام', type: 'BOOLEAN', scope: 'VARIANT' },

  // ═══ Battery ═══════════════════════════════════════════════════════════
  { code: 'battery_capacity', name: 'Battery Capacity', nameAr: 'سعة البطارية', type: 'DECIMAL', unit: 'Wh', scope: 'VARIANT' },
  {
    code: 'battery_type', name: 'Battery Type', nameAr: 'نوع البطارية',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'Lithium-Ion', label: 'Lithium-Ion', sortOrder: 1 },
      { value: 'Lithium-Polymer', label: 'Lithium-Polymer', sortOrder: 2 },
    ],
  },

  // ═══ Physical ══════════════════════════════════════════════════════════
  { code: 'weight', name: 'Weight', nameAr: 'الوزن', type: 'DECIMAL', unit: 'kg', scope: 'VARIANT' },
  { code: 'width', name: 'Width', nameAr: 'العرض', type: 'DECIMAL', unit: 'mm', scope: 'VARIANT' },
  { code: 'depth', name: 'Depth', nameAr: 'العمق', type: 'DECIMAL', unit: 'mm', scope: 'VARIANT' },
  { code: 'height', name: 'Height', nameAr: 'الارتفاع', type: 'DECIMAL', unit: 'mm', scope: 'VARIANT' },
  {
    code: 'color', name: 'Color', nameAr: 'اللون',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'Black', label: 'Black', sortOrder: 1 },
      { value: 'Silver', label: 'Silver', sortOrder: 2 },
      { value: 'Grey', label: 'Grey', sortOrder: 3 },
      { value: 'Space Grey', label: 'Space Grey', sortOrder: 4 },
      { value: 'Midnight', label: 'Midnight', sortOrder: 5 },
      { value: 'Starlight', label: 'Starlight', sortOrder: 6 },
      { value: 'White', label: 'White', sortOrder: 7 },
      { value: 'Blue', label: 'Blue', sortOrder: 8 },
      { value: 'Red', label: 'Red', sortOrder: 9 },
    ],
  },
  {
    code: 'chassis_material', name: 'Chassis Material', nameAr: 'مادة الهيكل',
    type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'Aluminium', label: 'Aluminium', sortOrder: 1 },
      { value: 'Magnesium Alloy', label: 'Magnesium Alloy', sortOrder: 2 },
      { value: 'Carbon Fibre', label: 'Carbon Fibre', sortOrder: 3 },
      { value: 'Plastic', label: 'Plastic', sortOrder: 4 },
      { value: 'Aluminium/Plastic', label: 'Aluminium/Plastic', sortOrder: 5 },
    ],
  },

  // ═══ Security ══════════════════════════════════════════════════════════
  { code: 'fingerprint_reader', name: 'Fingerprint Reader', nameAr: 'قارئ البصمة', type: 'BOOLEAN', scope: 'VARIANT' },
  { code: 'ir_camera', name: 'IR Camera (Windows Hello)', nameAr: 'كاميرا الأشعة تحت الحمراء', type: 'BOOLEAN', scope: 'VARIANT' },
  { code: 'smart_card_reader', name: 'Smart Card Reader', nameAr: 'قارئ البطاقات الذكية', type: 'BOOLEAN', scope: 'VARIANT' },
  { code: 'tpm', name: 'TPM', nameAr: 'TPM', type: 'TEXT', scope: 'VARIANT' },

  // ═══ Warranty ══════════════════════════════════════════════════════════
  { code: 'warranty', name: 'Warranty', nameAr: 'الضمان', type: 'TEXT', scope: 'PRODUCT' },

  // ═══ Network (for networking equipment) ════════════════════════════════
  { code: 'port_count', name: 'Number of Ports', nameAr: 'عدد المنافذ', type: 'INTEGER', scope: 'VARIANT' },
  { code: 'port_speed', name: 'Port Speed', nameAr: 'سرعة المنفذ', type: 'TEXT', scope: 'VARIANT' },
  { code: 'poe_support', name: 'PoE Support', nameAr: 'دعم PoE', type: 'BOOLEAN', scope: 'VARIANT' },
  { code: 'managed', name: 'Managed', nameAr: 'مدار', type: 'BOOLEAN', scope: 'VARIANT' },
  { code: 'form_factor', name: 'Form Factor', nameAr: 'عامل الشكل', type: 'TEXT', scope: 'PRODUCT' },
  { code: 'throughput', name: 'Throughput', nameAr: 'الإنتاجية', type: 'TEXT', scope: 'VARIANT' },
  { code: 'frequency_band', name: 'Frequency Band', nameAr: 'نطاق التردد', type: 'TEXT', scope: 'VARIANT' },
  { code: 'interface_type', name: 'Interface', nameAr: 'الواجهة', type: 'TEXT', scope: 'VARIANT' },
  { code: 'connection_type', name: 'Connection Type', nameAr: 'نوع الاتصال', type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'Wired', label: 'Wired', sortOrder: 1 },
      { value: 'Wireless', label: 'Wireless', sortOrder: 2 },
      { value: 'USB', label: 'USB', sortOrder: 3 },
      { value: 'Bluetooth', label: 'Bluetooth', sortOrder: 4 },
    ],
  },
  { code: 'dpi', name: 'DPI', nameAr: 'DPI', type: 'INTEGER', scope: 'VARIANT' },
  { code: 'switch_type', name: 'Switch Type', nameAr: 'نوع المفتاح', type: 'TEXT', scope: 'VARIANT' },
  { code: 'driver_size', name: 'Driver Size', nameAr: 'حجم السماعة', type: 'DECIMAL', unit: 'mm', scope: 'VARIANT' },
  { code: 'noise_cancellation', name: 'Noise Cancellation', nameAr: 'إلغاء الضوضاء', type: 'SELECT', scope: 'VARIANT',
    options: [
      { value: 'Active (ANC)', label: 'Active (ANC)', sortOrder: 1 },
      { value: 'Passive', label: 'Passive', sortOrder: 2 },
      { value: 'None', label: 'None', sortOrder: 3 },
    ],
  },
  { code: 'microphone', name: 'Microphone', nameAr: 'الميكروفون', type: 'BOOLEAN', scope: 'VARIANT' },
  { code: 'resolution_sensor', name: 'Sensor Resolution', nameAr: 'دقة المستشعر', type: 'TEXT', scope: 'VARIANT' },
];

/**
 * Production Catalog Seed — Laptop products and variants.
 *
 * Real commercial products with verified specifications from manufacturer
 * documentation.  GTIN/EAN left null (unverified).  MPN included where known.
 *
 * Product = canonical model family (e.g. "ThinkPad T14 Gen 5").
 * Variant = purchasable configuration (CPU/RAM/SSD/display/GPU/color).
 */

import type { SeedProduct } from '../types';

export const LAPTOP_PRODUCTS: SeedProduct[] = [

  // ═══ Dell Latitude (Business) ══════════════════════════════════════════

  {
    slug: 'dell-latitude-5450', title: 'Dell Latitude 5450', brandSlug: 'dell',
    productTypeCode: 'business-laptop', categorySlug: 'business-laptops',
    mpn: 'Latitude 5450',
    description: '14-inch business laptop with Intel Core Ultra processor, DDR5 memory, and USB-C connectivity.',
    attributes: [
      { attributeCode: 'model', text: 'Latitude 5450' },
      { attributeCode: 'series', text: 'Latitude 5000' },
      { attributeCode: 'warranty', text: '1-year limited hardware warranty' },
    ],
    variants: [
      { sku: 'DL-5450-U5-16-512', title: 'Core Ultra 5 / 16 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 5' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 5 135U' }, { attributeCode: 'cpu_cores', number: 12 }, { attributeCode: 'cpu_threads', number: 14 },
        { attributeCode: 'ram_capacity', number: 16 }, { attributeCode: 'ram_type', option: 'DDR5' }, { attributeCode: 'ram_speed', number: 5200 },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 14 }, { attributeCode: 'resolution', option: '1920x1200 (WUXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'usb_c_count', number: 2 }, { attributeCode: 'usb_a_count', number: 2 }, { attributeCode: 'hdmi_count', number: 1 },
        { attributeCode: 'battery_capacity', number: 54 }, { attributeCode: 'weight', number: 1.52 },
        { attributeCode: 'color', option: 'Black' }, { attributeCode: 'backlit_keyboard', boolean: true },
        { attributeCode: 'fingerprint_reader', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
      { sku: 'DL-5450-U7-32-512', title: 'Core Ultra 7 / 32 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 7' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 7 165U' }, { attributeCode: 'cpu_cores', number: 12 }, { attributeCode: 'cpu_threads', number: 14 },
        { attributeCode: 'ram_capacity', number: 32 }, { attributeCode: 'ram_type', option: 'DDR5' }, { attributeCode: 'ram_speed', number: 5200 },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 14 }, { attributeCode: 'resolution', option: '1920x1200 (WUXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'usb_c_count', number: 2 }, { attributeCode: 'usb_a_count', number: 2 }, { attributeCode: 'hdmi_count', number: 1 },
        { attributeCode: 'battery_capacity', number: 54 }, { attributeCode: 'weight', number: 1.52 },
        { attributeCode: 'color', option: 'Black' }, { attributeCode: 'backlit_keyboard', boolean: true },
        { attributeCode: 'fingerprint_reader', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
    ],
  },

  {
    slug: 'dell-latitude-7450', title: 'Dell Latitude 7450', brandSlug: 'dell',
    productTypeCode: 'business-laptop', categorySlug: 'business-laptops',
    mpn: 'Latitude 7450',
    description: '14-inch premium business laptop with Intel Core Ultra processor, advanced security, and optional touchscreen.',
    attributes: [
      { attributeCode: 'model', text: 'Latitude 7450' },
      { attributeCode: 'series', text: 'Latitude 7000' },
      { attributeCode: 'warranty', text: '1-year limited hardware warranty' },
    ],
    variants: [
      { sku: 'DL-7450-U7-16-512', title: 'Core Ultra 7 / 16 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 7' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 7 165U' }, { attributeCode: 'cpu_cores', number: 12 }, { attributeCode: 'cpu_threads', number: 14 },
        { attributeCode: 'ram_capacity', number: 16 }, { attributeCode: 'ram_type', option: 'LPDDR5' },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 14 }, { attributeCode: 'resolution', option: '1920x1200 (WUXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 2 }, { attributeCode: 'usb_c_count', number: 2 }, { attributeCode: 'hdmi_count', number: 1 },
        { attributeCode: 'battery_capacity', number: 55 }, { attributeCode: 'weight', number: 1.36 },
        { attributeCode: 'color', option: 'Grey' }, { attributeCode: 'backlit_keyboard', boolean: true },
        { attributeCode: 'fingerprint_reader', boolean: true }, { attributeCode: 'ir_camera', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
    ],
  },

  // ═══ Dell XPS (Ultrabook) ═════════════════════════════════════════════

  {
    slug: 'dell-xps-13-9340', title: 'Dell XPS 13 (9340)', brandSlug: 'dell',
    productTypeCode: 'ultrabook', categorySlug: 'ultrabooks',
    mpn: 'XPS 13 9340',
    description: '13-inch premium ultrabook with Intel Core Ultra processor, edge-to-edge display, and CNC-machined aluminium chassis.',
    attributes: [
      { attributeCode: 'model', text: 'XPS 13 9340' },
      { attributeCode: 'series', text: 'XPS' },
      { attributeCode: 'warranty', text: '1-year limited hardware warranty' },
    ],
    variants: [
      { sku: 'XPS13-9340-U7-16-512', title: 'Core Ultra 7 / 16 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 7' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 7 155H' }, { attributeCode: 'cpu_cores', number: 16 }, { attributeCode: 'cpu_threads', number: 22 },
        { attributeCode: 'ram_capacity', number: 16 }, { attributeCode: 'ram_type', option: 'LPDDR5X' },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 13.4 }, { attributeCode: 'resolution', option: '1920x1200 (WUXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Home' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 2 }, { attributeCode: 'usb_c_count', number: 2 },
        { attributeCode: 'battery_capacity', number: 52 }, { attributeCode: 'weight', number: 1.2 },
        { attributeCode: 'color', option: 'Silver' }, { attributeCode: 'chassis_material', option: 'Aluminium' },
        { attributeCode: 'backlit_keyboard', boolean: true }, { attributeCode: 'fingerprint_reader', boolean: true },
      ]},
    ],
  },

  // ═══ Dell Precision (Workstation) ═════════════════════════════════════

  {
    slug: 'dell-precision-5690', title: 'Dell Precision 5690', brandSlug: 'dell',
    productTypeCode: 'workstation-laptop', categorySlug: 'workstation-laptops',
    mpn: 'Precision 5690',
    description: '16-inch mobile workstation with Intel Core Ultra processor and NVIDIA professional graphics, ISV-certified.',
    attributes: [
      { attributeCode: 'model', text: 'Precision 5690' },
      { attributeCode: 'series', text: 'Precision 5000' },
      { attributeCode: 'warranty', text: '3-year ProSupport warranty' },
    ],
    variants: [
      { sku: 'P5690-U9-64-1T-RTX', title: 'Core Ultra 9 / 64 GB / 1 TB / RTX 2000 Ada', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 9' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 9 185H' }, { attributeCode: 'cpu_cores', number: 16 }, { attributeCode: 'cpu_threads', number: 22 },
        { attributeCode: 'ram_capacity', number: 64 }, { attributeCode: 'ram_type', option: 'DDR5' },
        { attributeCode: 'storage_capacity', number: 1000 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 16 }, { attributeCode: 'resolution', option: '2560x1600 (WQXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Dedicated' }, { attributeCode: 'gpu_model', text: 'NVIDIA RTX 2000 Ada Generation' }, { attributeCode: 'gpu_memory', number: 8 },
        { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 2 }, { attributeCode: 'sd_card_reader', text: 'SD card reader' },
        { attributeCode: 'battery_capacity', number: 69 }, { attributeCode: 'weight', number: 1.8 },
        { attributeCode: 'color', option: 'Silver' }, { attributeCode: 'chassis_material', option: 'Aluminium' },
        { attributeCode: 'backlit_keyboard', boolean: true }, { attributeCode: 'fingerprint_reader', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
    ],
  },

  // ═══ Lenovo ThinkPad T14 Gen 5 (Business) ═════════════════════════════

  {
    slug: 'lenovo-thinkpad-t14-gen5', title: 'Lenovo ThinkPad T14 Gen 5', brandSlug: 'lenovo',
    productTypeCode: 'business-laptop', categorySlug: 'business-laptops',
    mpn: '21ML',
    description: '14-inch business laptop with Intel Core Ultra processor, MIL-STD-810H tested, and ThinkShield security.',
    attributes: [
      { attributeCode: 'model', text: 'ThinkPad T14 Gen 5' },
      { attributeCode: 'series', text: 'ThinkPad T' },
      { attributeCode: 'generation', text: '5' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: 'TP-T14G5-U5-16-512', title: 'Core Ultra 5 / 16 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 5' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 5 135U' }, { attributeCode: 'cpu_cores', number: 12 }, { attributeCode: 'cpu_threads', number: 14 },
        { attributeCode: 'ram_capacity', number: 16 }, { attributeCode: 'ram_type', option: 'DDR5' },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 14 }, { attributeCode: 'resolution', option: '1920x1200 (WUXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 1 }, { attributeCode: 'usb_c_count', number: 1 }, { attributeCode: 'usb_a_count', number: 2 }, { attributeCode: 'hdmi_count', number: 1 },
        { attributeCode: 'battery_capacity', number: 52.5 }, { attributeCode: 'weight', number: 1.4 },
        { attributeCode: 'color', option: 'Black' }, { attributeCode: 'backlit_keyboard', boolean: true },
        { attributeCode: 'fingerprint_reader', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
      { sku: 'TP-T14G5-U7-32-1T', title: 'Core Ultra 7 / 32 GB / 1 TB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 7' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 7 165U' }, { attributeCode: 'cpu_cores', number: 12 }, { attributeCode: 'cpu_threads', number: 14 },
        { attributeCode: 'ram_capacity', number: 32 }, { attributeCode: 'ram_type', option: 'DDR5' },
        { attributeCode: 'storage_capacity', number: 1000 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 14 }, { attributeCode: 'resolution', option: '1920x1200 (WUXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 1 }, { attributeCode: 'usb_c_count', number: 1 }, { attributeCode: 'usb_a_count', number: 2 }, { attributeCode: 'hdmi_count', number: 1 },
        { attributeCode: 'battery_capacity', number: 52.5 }, { attributeCode: 'weight', number: 1.4 },
        { attributeCode: 'color', option: 'Black' }, { attributeCode: 'backlit_keyboard', boolean: true },
        { attributeCode: 'fingerprint_reader', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
    ],
  },

  // ═══ Lenovo ThinkPad X1 Carbon Gen 12 (Ultrabook) ═════════════════════

  {
    slug: 'lenovo-thinkpad-x1-carbon-g12', title: 'Lenovo ThinkPad X1 Carbon Gen 12', brandSlug: 'lenovo',
    productTypeCode: 'ultrabook', categorySlug: 'ultrabooks',
    mpn: '21KC',
    description: '14-inch premium ultrabook with Intel Core Ultra processor, carbon fibre chassis, and 1.08 kg weight.',
    attributes: [
      { attributeCode: 'model', text: 'ThinkPad X1 Carbon Gen 12' },
      { attributeCode: 'series', text: 'ThinkPad X1' },
      { attributeCode: 'warranty', text: '3-year limited warranty' },
    ],
    variants: [
      { sku: 'X1C-G12-U7-32-512', title: 'Core Ultra 7 / 32 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 7' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 7 155H' }, { attributeCode: 'cpu_cores', number: 16 }, { attributeCode: 'cpu_threads', number: 22 },
        { attributeCode: 'ram_capacity', number: 32 }, { attributeCode: 'ram_type', option: 'LPDDR5X' },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 14 }, { attributeCode: 'resolution', option: '2560x1600 (WQXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 2 }, { attributeCode: 'hdmi_count', number: 1 }, { attributeCode: 'audio_jack', text: '3.5mm combo' },
        { attributeCode: 'battery_capacity', number: 57 }, { attributeCode: 'weight', number: 1.08 },
        { attributeCode: 'color', option: 'Black' }, { attributeCode: 'chassis_material', option: 'Carbon Fibre' },
        { attributeCode: 'backlit_keyboard', boolean: true }, { attributeCode: 'fingerprint_reader', boolean: true },
        { attributeCode: 'ir_camera', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
    ],
  },

  // ═══ HP EliteBook 840 G11 (Business) ══════════════════════════════════

  {
    slug: 'hp-elitebook-840-g11', title: 'HP EliteBook 840 G11', brandSlug: 'hp',
    productTypeCode: 'business-laptop', categorySlug: 'business-laptops',
    mpn: 'EliteBook 840 G11',
    description: '14-inch business laptop with Intel Core Ultra processor, HP Wolf Security, and AI-enhanced audio.',
    attributes: [
      { attributeCode: 'model', text: 'EliteBook 840 G11' },
      { attributeCode: 'series', text: 'EliteBook 800' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: 'EB840G11-U7-16-512', title: 'Core Ultra 7 / 16 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 7' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 7 165U' }, { attributeCode: 'cpu_cores', number: 12 }, { attributeCode: 'cpu_threads', number: 14 },
        { attributeCode: 'ram_capacity', number: 16 }, { attributeCode: 'ram_type', option: 'DDR5' },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 14 }, { attributeCode: 'resolution', option: '1920x1200 (WUXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 2 }, { attributeCode: 'usb_a_count', number: 1 }, { attributeCode: 'hdmi_count', number: 1 },
        { attributeCode: 'battery_capacity', number: 51 }, { attributeCode: 'weight', number: 1.36 },
        { attributeCode: 'color', option: 'Silver' }, { attributeCode: 'chassis_material', option: 'Aluminium' },
        { attributeCode: 'backlit_keyboard', boolean: true }, { attributeCode: 'fingerprint_reader', boolean: true },
        { attributeCode: 'ir_camera', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
    ],
  },

  // ═══ Apple MacBook Air M3 (Ultrabook) ═════════════════════════════════

  {
    slug: 'apple-macbook-air-13-m3', title: 'Apple MacBook Air 13" (M3)', brandSlug: 'apple',
    productTypeCode: 'ultrabook', categorySlug: 'ultrabooks',
    mpn: 'MXCW3',
    description: '13.6-inch ultraportable laptop with Apple M3 chip, Liquid Retina display, and fanless design.',
    attributes: [
      { attributeCode: 'model', text: 'MacBook Air 13" (M3)' },
      { attributeCode: 'series', text: 'MacBook Air' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: 'MBA-13-M3-8-256', title: 'M3 / 8 GB / 256 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Apple' }, { attributeCode: 'cpu_family', option: 'Apple M3' },
        { attributeCode: 'cpu_model', text: 'Apple M3' }, { attributeCode: 'cpu_cores', number: 8 },
        { attributeCode: 'ram_capacity', number: 8 }, { attributeCode: 'ram_type', option: 'LPDDR5' },
        { attributeCode: 'storage_capacity', number: 256 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 13.6 }, { attributeCode: 'resolution', option: '2560x1664' }, { attributeCode: 'panel_type', option: 'Liquid Retina' },
        { attributeCode: 'gpu_type', option: 'Apple Silicon GPU' }, { attributeCode: 'gpu_model', text: 'Apple M3 8-core GPU' },
        { attributeCode: 'os', option: 'macOS' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 2 }, { attributeCode: 'audio_jack', text: '3.5mm headphone jack' },
        { attributeCode: 'battery_capacity', number: 52.6 }, { attributeCode: 'weight', number: 1.24 },
        { attributeCode: 'color', option: 'Midnight' }, { attributeCode: 'chassis_material', option: 'Aluminium' },
        { attributeCode: 'backlit_keyboard', boolean: true }, { attributeCode: 'fingerprint_reader', boolean: true },
      ]},
      { sku: 'MBA-13-M3-16-512', title: 'M3 / 16 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Apple' }, { attributeCode: 'cpu_family', option: 'Apple M3' },
        { attributeCode: 'cpu_model', text: 'Apple M3' }, { attributeCode: 'cpu_cores', number: 8 },
        { attributeCode: 'ram_capacity', number: 16 }, { attributeCode: 'ram_type', option: 'LPDDR5' },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 13.6 }, { attributeCode: 'resolution', option: '2560x1664' }, { attributeCode: 'panel_type', option: 'Liquid Retina' },
        { attributeCode: 'gpu_type', option: 'Apple Silicon GPU' }, { attributeCode: 'gpu_model', text: 'Apple M3 10-core GPU' },
        { attributeCode: 'os', option: 'macOS' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 2 }, { attributeCode: 'audio_jack', text: '3.5mm headphone jack' },
        { attributeCode: 'battery_capacity', number: 52.6 }, { attributeCode: 'weight', number: 1.24 },
        { attributeCode: 'color', option: 'Starlight' }, { attributeCode: 'chassis_material', option: 'Aluminium' },
        { attributeCode: 'backlit_keyboard', boolean: true }, { attributeCode: 'fingerprint_reader', boolean: true },
      ]},
    ],
  },

  // ═══ Apple MacBook Pro 14 M4 Pro ══════════════════════════════════════

  {
    slug: 'apple-macbook-pro-14-m4-pro', title: 'Apple MacBook Pro 14" (M4 Pro)', brandSlug: 'apple',
    productTypeCode: 'workstation-laptop', categorySlug: 'workstation-laptops',
    mpn: 'MXK73',
    description: '14.2-inch professional laptop with Apple M4 Pro chip, Liquid Retina XDR display, and up to 24 hours battery life.',
    attributes: [
      { attributeCode: 'model', text: 'MacBook Pro 14" (M4 Pro)' },
      { attributeCode: 'series', text: 'MacBook Pro' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: 'MBP14-M4P-24-512', title: 'M4 Pro / 24 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Apple' }, { attributeCode: 'cpu_family', option: 'Apple M4 Pro' },
        { attributeCode: 'cpu_model', text: 'Apple M4 Pro' }, { attributeCode: 'cpu_cores', number: 12 },
        { attributeCode: 'ram_capacity', number: 24 }, { attributeCode: 'ram_type', option: 'LPDDR5' },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 14.2 }, { attributeCode: 'resolution', option: '3024x1964' }, { attributeCode: 'panel_type', option: 'Liquid Retina XDR' },
        { attributeCode: 'refresh_rate', number: 120 },
        { attributeCode: 'gpu_type', option: 'Apple Silicon GPU' }, { attributeCode: 'gpu_model', text: 'Apple M4 Pro 16-core GPU' },
        { attributeCode: 'os', option: 'macOS' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 3 }, { attributeCode: 'hdmi_count', number: 1 }, { attributeCode: 'sd_card_reader', text: 'SDXC card slot' },
        { attributeCode: 'battery_capacity', number: 72.4 }, { attributeCode: 'weight', number: 1.55 },
        { attributeCode: 'color', option: 'Space Grey' }, { attributeCode: 'chassis_material', option: 'Aluminium' },
        { attributeCode: 'backlit_keyboard', boolean: true }, { attributeCode: 'fingerprint_reader', boolean: true },
      ]},
    ],
  },

  // ═══ ASUS ExpertBook B9 (Business) ═══════════════════════════════════

  {
    slug: 'asus-expertbook-b9', title: 'ASUS ExpertBook B9 (B9400CVA)', brandSlug: 'asus',
    productTypeCode: 'business-laptop', categorySlug: 'business-laptops',
    mpn: 'B9400CVA',
    description: '14-inch ultra-light business laptop at 0.99 kg with Intel Core Ultra processor and MIL-STD-810H durability.',
    attributes: [
      { attributeCode: 'model', text: 'ExpertBook B9 B9400CVA' },
      { attributeCode: 'series', text: 'ExpertBook' },
      { attributeCode: 'warranty', text: '2-year global warranty' },
    ],
    variants: [
      { sku: 'EB-B9-U7-16-512', title: 'Core Ultra 7 / 16 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 7' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 7 155U' }, { attributeCode: 'cpu_cores', number: 12 }, { attributeCode: 'cpu_threads', number: 14 },
        { attributeCode: 'ram_capacity', number: 16 }, { attributeCode: 'ram_type', option: 'LPDDR5' },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 14 }, { attributeCode: 'resolution', option: '1920x1200 (WUXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'thunderbolt_count', number: 2 }, { attributeCode: 'hdmi_count', number: 1 }, { attributeCode: 'usb_a_count', number: 1 },
        { attributeCode: 'battery_capacity', number: 66 }, { attributeCode: 'weight', number: 0.99 },
        { attributeCode: 'color', option: 'Black' }, { attributeCode: 'chassis_material', option: 'Magnesium Alloy' },
        { attributeCode: 'backlit_keyboard', boolean: true }, { attributeCode: 'fingerprint_reader', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
    ],
  },

  // ═══ Lenovo ThinkBook 14 G7 (Business) ════════════════════════════════

  {
    slug: 'lenovo-thinkbook-14-g7', title: 'Lenovo ThinkBook 14 G7', brandSlug: 'lenovo',
    productTypeCode: 'business-laptop', categorySlug: 'business-laptops',
    mpn: '21MH',
    description: '14-inch business laptop with Intel Core Ultra processor, aluminium top cover, and dual storage support.',
    attributes: [
      { attributeCode: 'model', text: 'ThinkBook 14 G7' },
      { attributeCode: 'series', text: 'ThinkBook' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: 'TB14-G7-U5-16-512', title: 'Core Ultra 5 / 16 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 5' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 5 125U' }, { attributeCode: 'cpu_cores', number: 12 }, { attributeCode: 'cpu_threads', number: 14 },
        { attributeCode: 'ram_capacity', number: 16 }, { attributeCode: 'ram_type', option: 'DDR5' },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 14 }, { attributeCode: 'resolution', option: '1920x1200 (WUXGA)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6 (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'usb_c_count', number: 1 }, { attributeCode: 'usb_a_count', number: 2 }, { attributeCode: 'hdmi_count', number: 1 }, { attributeCode: 'sd_card_reader', text: 'SD card reader' },
        { attributeCode: 'battery_capacity', number: 45 }, { attributeCode: 'weight', number: 1.48 },
        { attributeCode: 'color', option: 'Grey' }, { attributeCode: 'chassis_material', option: 'Aluminium/Plastic' },
        { attributeCode: 'backlit_keyboard', boolean: true }, { attributeCode: 'fingerprint_reader', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
    ],
  },

  // ═══ HP ProBook 450 G11 (Business) ════════════════════════════════════

  {
    slug: 'hp-probook-450-g11', title: 'HP ProBook 450 G11', brandSlug: 'hp',
    productTypeCode: 'business-laptop', categorySlug: 'business-laptops',
    mpn: 'ProBook 450 G11',
    description: '15.6-inch business laptop with Intel Core Ultra processor, numeric keypad, and HP Wolf Security.',
    attributes: [
      { attributeCode: 'model', text: 'ProBook 450 G11' },
      { attributeCode: 'series', text: 'ProBook 400' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: 'PB450-U5-16-512', title: 'Core Ultra 5 / 16 GB / 512 GB SSD', attributes: [
        { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 5' },
        { attributeCode: 'cpu_model', text: 'Intel Core Ultra 5 135U' }, { attributeCode: 'cpu_cores', number: 12 }, { attributeCode: 'cpu_threads', number: 14 },
        { attributeCode: 'ram_capacity', number: 16 }, { attributeCode: 'ram_type', option: 'DDR5' },
        { attributeCode: 'storage_capacity', number: 512 }, { attributeCode: 'storage_type', option: 'NVMe SSD' },
        { attributeCode: 'display_size', number: 15.6 }, { attributeCode: 'resolution', option: '1920x1080 (FHD)' }, { attributeCode: 'panel_type', option: 'IPS' },
        { attributeCode: 'gpu_type', option: 'Integrated' }, { attributeCode: 'os', option: 'Windows 11 Pro' },
        { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'bluetooth_version', option: '5.3' },
        { attributeCode: 'usb_c_count', number: 2 }, { attributeCode: 'usb_a_count', number: 2 }, { attributeCode: 'hdmi_count', number: 1 }, { attributeCode: 'rj45', boolean: true },
        { attributeCode: 'battery_capacity', number: 45 }, { attributeCode: 'weight', number: 1.79 },
        { attributeCode: 'color', option: 'Silver' }, { attributeCode: 'chassis_material', option: 'Aluminium' },
        { attributeCode: 'backlit_keyboard', boolean: true }, { attributeCode: 'numeric_keypad', boolean: true },
        { attributeCode: 'fingerprint_reader', boolean: true }, { attributeCode: 'tpm', text: 'TPM 2.0' },
      ]},
    ],
  },
];

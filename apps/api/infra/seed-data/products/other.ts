/**
 * Production Catalog Seed — Non-laptop products.
 *
 * Covers monitors, components, networking, and peripherals with real
 * commercial products and verified specifications.
 */

import type { SeedProduct } from '../types';

// ═══ Monitors ══════════════════════════════════════════════════════════════

export const MONITOR_PRODUCTS: SeedProduct[] = [
  {
    slug: 'dell-u2723qe', title: 'Dell UltraSharp 27 4K (U2723QE)', brandSlug: 'dell',
    productTypeCode: 'monitor', categorySlug: 'monitors',
    mpn: 'U2723QE',
    description: '27-inch 4K USB-C hub monitor with IPS Black technology and 98% DCI-P3.',
    attributes: [
      { attributeCode: 'model', text: 'UltraSharp 27 4K U2723QE' },
      { attributeCode: 'series', text: 'UltraSharp' },
      { attributeCode: 'warranty', text: '3-year advanced exchange warranty' },
    ],
    variants: [
      { sku: 'U2723QE-STD', title: 'Standard', attributes: [
        { attributeCode: 'display_size', number: 27 }, { attributeCode: 'resolution', option: '3840x2160 (4K UHD)' },
        { attributeCode: 'panel_type', option: 'IPS' }, { attributeCode: 'refresh_rate', number: 60 }, { attributeCode: 'brightness', number: 400 },
        { attributeCode: 'hdmi_count', number: 1 }, { attributeCode: 'usb_c_count', number: 1 }, { attributeCode: 'usb_a_count', number: 5 },
        { attributeCode: 'weight', number: 6.3 }, { attributeCode: 'color', option: 'Silver' },
      ]},
    ],
  },
  {
    slug: 'lg-27up850', title: 'LG 27" 4K USB-C (27UP850-W)', brandSlug: 'lg',
    productTypeCode: 'monitor', categorySlug: 'monitors',
    mpn: '27UP850-W',
    description: '27-inch 4K monitor with USB-C 96W power delivery, HDR10, and DCI-P3 95%.',
    attributes: [
      { attributeCode: 'model', text: '27UP850-W' }, { attributeCode: 'series', text: 'UltraFine' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: '27UP850-STD', title: 'Standard', attributes: [
        { attributeCode: 'display_size', number: 27 }, { attributeCode: 'resolution', option: '3840x2160 (4K UHD)' },
        { attributeCode: 'panel_type', option: 'IPS' }, { attributeCode: 'refresh_rate', number: 60 }, { attributeCode: 'brightness', number: 400 },
        { attributeCode: 'hdmi_count', number: 2 }, { attributeCode: 'usb_c_count', number: 1 },
        { attributeCode: 'weight', number: 6.4 }, { attributeCode: 'color', option: 'White' },
      ]},
    ],
  },
  {
    slug: 'samsung-s34d', title: 'Samsung ViewFinity S9 34" (S34D)', brandSlug: 'samsung',
    productTypeCode: 'monitor', categorySlug: 'monitors',
    mpn: 'LS34D',
    description: '34-inch WQHD ultrawide monitor with Smart features and USB-C connectivity.',
    attributes: [
      { attributeCode: 'model', text: 'ViewFinity S9 S34D' }, { attributeCode: 'series', text: 'ViewFinity' },
      { attributeCode: 'warranty', text: '3-year limited warranty' },
    ],
    variants: [
      { sku: 'S34D-STD', title: 'Standard', attributes: [
        { attributeCode: 'display_size', number: 34 }, { attributeCode: 'resolution', option: '3440x1440 (UWQHD)' },
        { attributeCode: 'panel_type', option: 'IPS' }, { attributeCode: 'refresh_rate', number: 100 }, { attributeCode: 'brightness', number: 350 },
        { attributeCode: 'hdmi_count', number: 1 }, { attributeCode: 'usb_c_count', number: 1 },
        { attributeCode: 'weight', number: 7.2 }, { attributeCode: 'color', option: 'Silver' },
      ]},
    ],
  },
];

// ═══ Components ════════════════════════════════════════════════════════════

export const COMPONENT_PRODUCTS: SeedProduct[] = [
  // Processors
  {
    slug: 'intel-core-ultra-7-155h', title: 'Intel Core Ultra 7 155H', brandSlug: 'intel',
    productTypeCode: 'processor', categorySlug: 'processors',
    mpn: '155H',
    description: '16-core processor with 22 threads, up to 4.8 GHz, integrated Intel Arc graphics.',
    attributes: [
      { attributeCode: 'model', text: 'Core Ultra 7 155H' }, { attributeCode: 'series', text: 'Core Ultra 7' },
      { attributeCode: 'cpu_manufacturer', option: 'Intel' }, { attributeCode: 'cpu_family', option: 'Core Ultra 7' },
      { attributeCode: 'cpu_model', text: 'Intel Core Ultra 7 155H' },
      { attributeCode: 'cpu_cores', number: 16 }, { attributeCode: 'cpu_threads', number: 22 },
      { attributeCode: 'cpu_base_freq', number: 1.4 }, { attributeCode: 'cpu_turbo_freq', number: 4.8 },
      { attributeCode: 'warranty', text: '3-year limited warranty' },
    ],
    variants: [
      { sku: 'INT-U7-155H-TRAY', title: 'Tray', attributes: [] },
    ],
  },
  {
    slug: 'amd-ryzen-9-7950x', title: 'AMD Ryzen 9 7950X', brandSlug: 'amd',
    productTypeCode: 'processor', categorySlug: 'processors',
    mpn: '7950X',
    description: '16-core desktop processor with 32 threads, up to 5.7 GHz, AM5 socket.',
    attributes: [
      { attributeCode: 'model', text: 'Ryzen 9 7950X' }, { attributeCode: 'series', text: 'Ryzen 9' },
      { attributeCode: 'cpu_manufacturer', option: 'AMD' }, { attributeCode: 'cpu_family', option: 'Ryzen 9' },
      { attributeCode: 'cpu_model', text: 'AMD Ryzen 9 7950X' },
      { attributeCode: 'cpu_cores', number: 16 }, { attributeCode: 'cpu_threads', number: 32 },
      { attributeCode: 'cpu_base_freq', number: 4.5 }, { attributeCode: 'cpu_turbo_freq', number: 5.7 },
      { attributeCode: 'warranty', text: '3-year limited warranty' },
    ],
    variants: [
      { sku: 'AMD-R9-7950X', title: 'Boxed', attributes: [] },
    ],
  },

  // SSDs
  {
    slug: 'samsung-990-pro-1tb', title: 'Samsung 990 PRO 1TB', brandSlug: 'samsung',
    productTypeCode: 'ssd', categorySlug: 'internal-storage',
    mpn: 'MZ-V9P1T0',
    description: '1TB NVMe M.2 PCIe Gen4 SSD with up to 7,450 MB/s sequential read.',
    attributes: [
      { attributeCode: 'model', text: '990 PRO 1TB' }, { attributeCode: 'series', text: '990 PRO' },
      { attributeCode: 'storage_capacity', number: 1000 }, { attributeCode: 'storage_type', option: 'PCIe Gen4 NVMe' },
      { attributeCode: 'interface_type', text: 'M.2 2280' }, { attributeCode: 'form_factor', text: 'M.2 2280' },
      { attributeCode: 'warranty', text: '5-year limited warranty' },
    ],
    variants: [
      { sku: 'SAM-990PRO-1T', title: '1TB', attributes: [] },
    ],
  },
  {
    slug: 'wd-black-sn850x-2tb', title: 'Western Digital Black SN850X 2TB', brandSlug: 'western-digital',
    productTypeCode: 'ssd', categorySlug: 'internal-storage',
    mpn: 'WDS200T2X0E',
    description: '2TB NVMe M.2 PCIe Gen4 SSD with up to 7,300 MB/s sequential read.',
    attributes: [
      { attributeCode: 'model', text: 'Black SN850X 2TB' }, { attributeCode: 'series', text: 'Black SN850X' },
      { attributeCode: 'storage_capacity', number: 2000 }, { attributeCode: 'storage_type', option: 'PCIe Gen4 NVMe' },
      { attributeCode: 'interface_type', text: 'M.2 2280' }, { attributeCode: 'form_factor', text: 'M.2 2280' },
      { attributeCode: 'warranty', text: '5-year limited warranty' },
    ],
    variants: [
      { sku: 'WD-SN850X-2T', title: '2TB', attributes: [] },
    ],
  },

  // RAM
  {
    slug: 'kingston-fury-beast-ddr5-32gb', title: 'Kingston FURY Beast 32GB DDR5-5600', brandSlug: 'kingston',
    productTypeCode: 'ram-module', categorySlug: 'memory',
    mpn: 'KF556C36BB-32',
    description: '32GB DDR5-5600 DIMM module with XMP 3.0 support.',
    attributes: [
      { attributeCode: 'model', text: 'FURY Beast 32GB DDR5-5600' }, { attributeCode: 'series', text: 'FURY Beast' },
      { attributeCode: 'ram_capacity', number: 32 }, { attributeCode: 'ram_type', option: 'DDR5' }, { attributeCode: 'ram_speed', number: 5600 },
      { attributeCode: 'form_factor', text: 'DIMM' },
      { attributeCode: 'warranty', text: 'Limited lifetime warranty' },
    ],
    variants: [
      { sku: 'KNG-FB-DDR5-32', title: 'Single 32GB', attributes: [] },
    ],
  },

  // Graphics Cards
  {
    slug: 'nvidia-rtx-4070-super', title: 'NVIDIA GeForce RTX 4070 Super', brandSlug: 'nvidia',
    productTypeCode: 'graphics-card', categorySlug: 'graphics-cards',
    mpn: 'RTX 4070 Super',
    description: '12GB GDDR6X graphics card with Ada Lovelace architecture.',
    attributes: [
      { attributeCode: 'model', text: 'GeForce RTX 4070 Super' }, { attributeCode: 'series', text: 'GeForce RTX 40' },
      { attributeCode: 'gpu_model', text: 'GeForce RTX 4070 Super' }, { attributeCode: 'gpu_memory', number: 12 },
      { attributeCode: 'interface_type', text: 'PCIe 4.0 x16' }, { attributeCode: 'hdmi_count', number: 1 },
      { attributeCode: 'warranty', text: '3-year limited warranty' },
    ],
    variants: [
      { sku: 'NV-RTX4070S-FE', title: 'Founders Edition', attributes: [] },
    ],
  },
];

// ═══ Networking ════════════════════════════════════════════════════════════

export const NETWORKING_PRODUCTS: SeedProduct[] = [
  {
    slug: 'ubiquiti-unifi-ap-pro', title: 'Ubiquiti UniFi U7 Pro', brandSlug: 'ubiquiti',
    productTypeCode: 'wireless-ap', categorySlug: 'access-points',
    mpn: 'U7 Pro',
    description: 'Wi-Fi 7 access point with 6.9 Gbps aggregate throughput and 2.5GbE uplink.',
    attributes: [
      { attributeCode: 'model', text: 'UniFi U7 Pro' }, { attributeCode: 'series', text: 'UniFi' },
      { attributeCode: 'wifi_standard', option: 'Wi-Fi 7 (802.11be)' }, { attributeCode: 'throughput', text: '6.9 Gbps aggregate' },
      { attributeCode: 'port_count', number: 1 }, { attributeCode: 'port_speed', text: '2.5GbE' },
      { attributeCode: 'poe_support', boolean: true }, { attributeCode: 'frequency_band', text: 'Tri-band (2.4/5/6 GHz)' },
      { attributeCode: 'form_factor', text: 'Ceiling mount' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: 'UBNT-U7-PRO', title: 'Standard', attributes: [] },
    ],
  },
  {
    slug: 'tp-link-omada-eap670', title: 'TP-Link Omada EAP670', brandSlug: 'tp-link',
    productTypeCode: 'wireless-ap', categorySlug: 'access-points',
    mpn: 'EAP670',
    description: 'AX5400 Wi-Fi 6E access point with tri-band and 2.5GbE uplink.',
    attributes: [
      { attributeCode: 'model', text: 'Omada EAP670' }, { attributeCode: 'series', text: 'Omada' },
      { attributeCode: 'wifi_standard', option: 'Wi-Fi 6E (802.11ax)' }, { attributeCode: 'throughput', text: '5.4 Gbps aggregate' },
      { attributeCode: 'port_count', number: 1 }, { attributeCode: 'port_speed', text: '2.5GbE' },
      { attributeCode: 'poe_support', boolean: true }, { attributeCode: 'frequency_band', text: 'Tri-band (2.4/5/6 GHz)' },
      { attributeCode: 'form_factor', text: 'Ceiling mount' },
      { attributeCode: 'warranty', text: '2-year limited warranty' },
    ],
    variants: [
      { sku: 'TPL-EAP670', title: 'Standard', attributes: [] },
    ],
  },
  {
    slug: 'ubiquiti-unifi-switch-24', title: 'Ubiquiti UniFi Switch Pro 24 PoE', brandSlug: 'ubiquiti',
    productTypeCode: 'network-switch', categorySlug: 'switches',
    mpn: 'USW-Pro-24-PoE',
    description: '24-port managed PoE+ switch with 4x 10GbE SFP+ uplinks and 370W PoE budget.',
    attributes: [
      { attributeCode: 'model', text: 'UniFi Switch Pro 24 PoE' }, { attributeCode: 'series', text: 'UniFi Switch Pro' },
      { attributeCode: 'port_count', number: 24 }, { attributeCode: 'port_speed', text: '1GbE + 4x 10GbE SFP+' },
      { attributeCode: 'managed', boolean: true }, { attributeCode: 'poe_support', boolean: true },
      { attributeCode: 'form_factor', text: '1U rackmount' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: 'UBNT-USW-PRO-24-POE', title: 'Standard', attributes: [] },
    ],
  },
  {
    slug: 'tp-link-omada-sg3428x', title: 'TP-Link Omada SG3428X', brandSlug: 'tp-link',
    productTypeCode: 'network-switch', categorySlug: 'switches',
    mpn: 'SG3428X',
    description: '28-port managed switch with 24x 1GbE PoE+ ports and 4x 10GbE SFP+ uplinks.',
    attributes: [
      { attributeCode: 'model', text: 'Omada SG3428X' }, { attributeCode: 'series', text: 'Omada' },
      { attributeCode: 'port_count', number: 28 }, { attributeCode: 'port_speed', text: '1GbE + 4x 10GbE SFP+' },
      { attributeCode: 'managed', boolean: true }, { attributeCode: 'poe_support', boolean: true },
      { attributeCode: 'form_factor', text: '1U rackmount' },
      { attributeCode: 'warranty', text: '2-year limited warranty' },
    ],
    variants: [
      { sku: 'TPL-SG3428X', title: 'Standard', attributes: [] },
    ],
  },
];

// ═══ Peripherals ═══════════════════════════════════════════════════════════

export const PERIPHERAL_PRODUCTS: SeedProduct[] = [
  {
    slug: 'logitech-mx-keys-s', title: 'Logitech MX Keys S', brandSlug: 'logitech',
    productTypeCode: 'keyboard', categorySlug: 'keyboards',
    mpn: '920-011060',
    description: 'Wireless illuminated keyboard with smart backlighting and USB-C charging.',
    attributes: [
      { attributeCode: 'model', text: 'MX Keys S' }, { attributeCode: 'series', text: 'MX' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: 'LOG-MXKEYS-S-GRY', title: 'Graphite', attributes: [
        { attributeCode: 'connection_type', option: 'Wireless' }, { attributeCode: 'backlit_keyboard', boolean: true },
        { attributeCode: 'numeric_keypad', boolean: true }, { attributeCode: 'color', option: 'Black' },
        { attributeCode: 'bluetooth_version', option: '5.1' },
      ]},
    ],
  },
  {
    slug: 'logitech-mx-master-3s', title: 'Logitech MX Master 3S', brandSlug: 'logitech',
    productTypeCode: 'mouse', categorySlug: 'mice',
    mpn: '910-006556',
    description: 'Wireless performance mouse with 8K DPI sensor, MagSpeed scroll, and USB-C.',
    attributes: [
      { attributeCode: 'model', text: 'MX Master 3S' }, { attributeCode: 'series', text: 'MX' },
      { attributeCode: 'warranty', text: '1-year limited warranty' },
    ],
    variants: [
      { sku: 'LOG-MXM3S-GRY', title: 'Graphite', attributes: [
        { attributeCode: 'connection_type', option: 'Wireless' }, { attributeCode: 'dpi', number: 8000 },
        { attributeCode: 'color', option: 'Black' }, { attributeCode: 'bluetooth_version', option: '5.1' },
      ]},
    ],
  },
  {
    slug: 'logitech-mx-brio', title: 'Logitech MX Brio', brandSlug: 'logitech',
    productTypeCode: 'webcam', categorySlug: 'webcams',
    mpn: '960-001435',
    description: '4K Ultra HD webcam with dual microphones, USB-C, and Show Mode.',
    attributes: [
      { attributeCode: 'model', text: 'MX Brio' }, { attributeCode: 'series', text: 'MX' },
      { attributeCode: 'resolution_sensor', text: '4K Ultra HD' },
      { attributeCode: 'microphone', boolean: true }, { attributeCode: 'connection_type', option: 'USB' },
      { attributeCode: 'warranty', text: '2-year limited warranty' },
    ],
    variants: [
      { sku: 'LOG-MXBRO', title: 'Standard', attributes: [] },
    ],
  },
  {
    slug: 'logitech-zone-wireless-2', title: 'Logitech Zone Wireless 2', brandSlug: 'logitech',
    productTypeCode: 'headset', categorySlug: 'headsets',
    mpn: '981-001170',
    description: 'Wireless headset with active noise cancellation, multipoint, and USB-C.',
    attributes: [
      { attributeCode: 'model', text: 'Zone Wireless 2' }, { attributeCode: 'series', text: 'Zone' },
      { attributeCode: 'warranty', text: '2-year limited warranty' },
    ],
    variants: [
      { sku: 'LOG-ZW2-GRY', title: 'Graphite', attributes: [
        { attributeCode: 'connection_type', option: 'Wireless' }, { attributeCode: 'driver_size', number: 40 },
        { attributeCode: 'noise_cancellation', option: 'Active (ANC)' }, { attributeCode: 'microphone', boolean: true },
        { attributeCode: 'color', option: 'Black' }, { attributeCode: 'bluetooth_version', option: '5.2' },
      ]},
    ],
  },
];

// ═══ Combined export ═══════════════════════════════════════════════════════

export const OTHER_PRODUCTS: SeedProduct[] = [
  ...MONITOR_PRODUCTS,
  ...COMPONENT_PRODUCTS,
  ...NETWORKING_PRODUCTS,
  ...PERIPHERAL_PRODUCTS,
];

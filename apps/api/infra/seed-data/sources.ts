/**
 * Production Catalog Seed — Source provenance manifest.
 *
 * Documents the external sources used to verify product specifications.
 * This is NOT stored in the database (the schema has no provenance columns);
 * it exists as a companion file for audit and compliance.
 */

export interface ProductSource {
  productSlug: string;
  manufacturer: string;
  model: string;
  sourceType: 'manufacturer';
  sourceUrl: string;
  verifiedAt: string;
}

export const PRODUCT_SOURCES: ProductSource[] = [
  // Dell
  { productSlug: 'dell-latitude-5450', manufacturer: 'Dell', model: 'Latitude 5450', sourceType: 'manufacturer', sourceUrl: 'https://www.dell.com/en-us/shop/dell-laptops/latitude-5450-laptop', verifiedAt: '2026-09-20' },
  { productSlug: 'dell-latitude-7450', manufacturer: 'Dell', model: 'Latitude 7450', sourceType: 'manufacturer', sourceUrl: 'https://www.dell.com/en-us/shop/dell-laptops/latitude-7450-laptop', verifiedAt: '2026-09-20' },
  { productSlug: 'dell-xps-13-9340', manufacturer: 'Dell', model: 'XPS 13 9340', sourceType: 'manufacturer', sourceUrl: 'https://www.dell.com/en-us/shop/dell-laptops/xps-13-laptop', verifiedAt: '2026-09-20' },
  { productSlug: 'dell-precision-5690', manufacturer: 'Dell', model: 'Precision 5690', sourceType: 'manufacturer', sourceUrl: 'https://www.dell.com/en-us/shop/dell-laptops/precision-5690-mobile-workstation', verifiedAt: '2026-09-20' },
  { productSlug: 'dell-u2723qe', manufacturer: 'Dell', model: 'UltraSharp 27 U2723QE', sourceType: 'manufacturer', sourceUrl: 'https://www.dell.com/en-us/shop/dell-ultrasharp-27-4k-usb-c-hub-monitor-u2723qe', verifiedAt: '2026-09-20' },

  // Lenovo
  { productSlug: 'lenovo-thinkpad-t14-gen5', manufacturer: 'Lenovo', model: 'ThinkPad T14 Gen 5', sourceType: 'manufacturer', sourceUrl: 'https://www.lenovo.com/us/en/p/laptops/thinkpad/thinkpad-t-series/thinkpad-t14-gen-5', verifiedAt: '2026-09-20' },
  { productSlug: 'lenovo-thinkpad-x1-carbon-g12', manufacturer: 'Lenovo', model: 'ThinkPad X1 Carbon Gen 12', sourceType: 'manufacturer', sourceUrl: 'https://www.lenovo.com/us/en/p/laptops/thinkpad/thinkpad-x1/thinkpad-x1-carbon-gen-12', verifiedAt: '2026-09-20' },
  { productSlug: 'lenovo-thinkbook-14-g7', manufacturer: 'Lenovo', model: 'ThinkBook 14 G7', sourceType: 'manufacturer', sourceUrl: 'https://www.lenovo.com/us/en/p/laptops/thinkbook/thinkbook-t-series/thinkbook-14-g7', verifiedAt: '2026-09-20' },

  // HP
  { productSlug: 'hp-elitebook-840-g11', manufacturer: 'HP', model: 'EliteBook 840 G11', sourceType: 'manufacturer', sourceUrl: 'https://www.hp.com/us-en/shop/hp-elitebook-840-g11.html', verifiedAt: '2026-09-20' },
  { productSlug: 'hp-probook-450-g11', manufacturer: 'HP', model: 'ProBook 450 G11', sourceType: 'manufacturer', sourceUrl: 'https://www.hp.com/us-en/shop/hp-probook-450-g11.html', verifiedAt: '2026-09-20' },

  // Apple
  { productSlug: 'apple-macbook-air-13-m3', manufacturer: 'Apple', model: 'MacBook Air 13" (M3)', sourceType: 'manufacturer', sourceUrl: 'https://www.apple.com/macbook-air/', verifiedAt: '2026-09-20' },
  { productSlug: 'apple-macbook-pro-14-m4-pro', manufacturer: 'Apple', model: 'MacBook Pro 14" (M4 Pro)', sourceType: 'manufacturer', sourceUrl: 'https://www.apple.com/macbook-pro/', verifiedAt: '2026-09-20' },

  // ASUS
  { productSlug: 'asus-expertbook-b9', manufacturer: 'ASUS', model: 'ExpertBook B9 B9400CVA', sourceType: 'manufacturer', sourceUrl: 'https://www.asus.com/laptops/business/expertbook-b9/', verifiedAt: '2026-09-20' },

  // Samsung / LG
  { productSlug: 'samsung-990-pro-1tb', manufacturer: 'Samsung', model: '990 PRO 1TB', sourceType: 'manufacturer', sourceUrl: 'https://semiconductor.samsung.com/consumer-storage/internal-ssd/990pro/', verifiedAt: '2026-09-20' },
  { productSlug: 'samsung-s34d', manufacturer: 'Samsung', model: 'ViewFinity S9 S34D', sourceType: 'manufacturer', sourceUrl: 'https://www.samsung.com/monitors/', verifiedAt: '2026-09-20' },
  { productSlug: 'lg-27up850', manufacturer: 'LG', model: '27UP850-W', sourceType: 'manufacturer', sourceUrl: 'https://www.lg.com/us/monitors/lg-27up850-w/', verifiedAt: '2026-09-20' },

  // Components
  { productSlug: 'intel-core-ultra-7-155h', manufacturer: 'Intel', model: 'Core Ultra 7 155H', sourceType: 'manufacturer', sourceUrl: 'https://ark.intel.com/content/www/us/en/ark/products/236847/intel-core-ultra-7-processor-155h-24m-cache-up-to-4-80-ghz.html', verifiedAt: '2026-09-20' },
  { productSlug: 'amd-ryzen-9-7950x', manufacturer: 'AMD', model: 'Ryzen 9 7950X', sourceType: 'manufacturer', sourceUrl: 'https://www.amd.com/en/products/processors/desktop/ryzen/7950x.html', verifiedAt: '2026-09-20' },
  { productSlug: 'nvidia-rtx-4070-super', manufacturer: 'NVIDIA', model: 'GeForce RTX 4070 Super', sourceType: 'manufacturer', sourceUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4070-super/', verifiedAt: '2026-09-20' },
  { productSlug: 'kingston-fury-beast-ddr5-32gb', manufacturer: 'Kingston', model: 'FURY Beast 32GB DDR5-5600', sourceType: 'manufacturer', sourceUrl: 'https://www.kingston.com/en/memory/gaming/fury-beast-ddr5', verifiedAt: '2026-09-20' },
  { productSlug: 'wd-black-sn850x-2tb', manufacturer: 'Western Digital', model: 'Black SN850X 2TB', sourceType: 'manufacturer', sourceUrl: 'https://www.westerndigital.com/products/internal-drives/wd-black-sn850x-nvme-ssd', verifiedAt: '2026-09-20' },

  // Networking
  { productSlug: 'ubiquiti-unifi-ap-pro', manufacturer: 'Ubiquiti', model: 'UniFi U7 Pro', sourceType: 'manufacturer', sourceUrl: 'https://ui.com/us/unifi/wifi/u7-pro', verifiedAt: '2026-09-20' },
  { productSlug: 'tp-link-omada-eap670', manufacturer: 'TP-Link', model: 'Omada EAP670', sourceType: 'manufacturer', sourceUrl: 'https://www.tp-link.com/us/business-networking/omada-wifi-access-point/eap670/', verifiedAt: '2026-09-20' },
  { productSlug: 'ubiquiti-unifi-switch-24', manufacturer: 'Ubiquiti', model: 'UniFi Switch Pro 24 PoE', sourceType: 'manufacturer', sourceUrl: 'https://ui.com/us/unifi/switching/pro/usw-pro-24-poe', verifiedAt: '2026-09-20' },
  { productSlug: 'tp-link-omada-sg3428x', manufacturer: 'TP-Link', model: 'Omada SG3428X', sourceType: 'manufacturer', sourceUrl: 'https://www.tp-link.com/us/business-networking/omada-sdn-switch/sg3428x/', verifiedAt: '2026-09-20' },

  // Peripherals
  { productSlug: 'logitech-mx-keys-s', manufacturer: 'Logitech', model: 'MX Keys S', sourceType: 'manufacturer', sourceUrl: 'https://www.logitech.com/en-us/products/keyboards/mx-keys-s.html', verifiedAt: '2026-09-20' },
  { productSlug: 'logitech-mx-master-3s', manufacturer: 'Logitech', model: 'MX Master 3S', sourceType: 'manufacturer', sourceUrl: 'https://www.logitech.com/en-us/products/mice/mx-master-3s.html', verifiedAt: '2026-09-20' },
  { productSlug: 'logitech-mx-brio', manufacturer: 'Logitech', model: 'MX Brio', sourceType: 'manufacturer', sourceUrl: 'https://www.logitech.com/en-us/products/webcams/mx-brio.html', verifiedAt: '2026-09-20' },
  { productSlug: 'logitech-zone-wireless-2', manufacturer: 'Logitech', model: 'Zone Wireless 2', sourceType: 'manufacturer', sourceUrl: 'https://www.logitech.com/en-us/products/headsets/zone-wireless-2.html', verifiedAt: '2026-09-20' },
];

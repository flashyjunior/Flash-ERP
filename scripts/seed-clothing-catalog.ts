import "dotenv/config";

import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";

const datasourceUrl = process.env.DATABASE_URL;

if (!datasourceUrl) {
  throw new Error("DATABASE_URL must be set before seeding clothing catalog data.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMssql(datasourceUrl)
});

const now = new Date();

function json(value: unknown) {
  return JSON.stringify(value);
}

function money(value: number) {
  return value.toFixed(2);
}

function quantity(value: number) {
  return value.toFixed(3);
}

function code(value: string) {
  return value.trim().toUpperCase();
}

function barcodeFor(index: number) {
  return `899400${String(index).padStart(7, "0")}`;
}

const fallbackStoreSeeds = [
  {
    code: "accra-central",
    name: "Accra Central",
    city: "Accra",
    storeMode: "ONLINE_DIRECT",
    nodeCode: process.env.FLASH_ERP_STORE_NODE_CODE ?? "store-accra-central-01"
  },
  {
    code: "osu-fashion-circle",
    name: "Osu Fashion Circle",
    city: "Accra",
    storeMode: "OFFLINE_FIRST",
    nodeCode: "store-osu-fashion-circle-01"
  },
  {
    code: "kumasi-adum-fashion",
    name: "Kumasi Adum Fashion",
    city: "Kumasi",
    storeMode: "OFFLINE_FIRST",
    nodeCode: "store-kumasi-adum-fashion-01"
  }
] as const;

const departments = [
  {
    code: "APPAREL",
    name: "Apparel",
    description: "Men, women, and kids clothing styles.",
    sortOrder: 10
  },
  {
    code: "FOOTWEAR",
    name: "Footwear",
    description: "Shoes, sandals, and trainers.",
    sortOrder: 20
  },
  {
    code: "ACCESSORIES",
    name: "Accessories",
    description: "Belts, bags, scarves, socks, and add-ons.",
    sortOrder: 30
  }
] as const;

const categories = [
  ["APP-MENS-TOPS", "Men's Tops", "APPAREL", 10],
  ["APP-WOMENS-DRESSES", "Women's Dresses", "APPAREL", 20],
  ["APP-MENS-BOTTOMS", "Men's Bottoms", "APPAREL", 30],
  ["APP-DENIM", "Denim", "APPAREL", 40],
  ["APP-OUTERWEAR", "Outerwear", "APPAREL", 50],
  ["APP-KIDS", "Kids Clothing", "APPAREL", 60],
  ["APP-MODEST", "Modest Wear", "APPAREL", 70],
  ["APP-WOMENS-BOTTOMS", "Women's Bottoms", "APPAREL", 80],
  ["FTW-SANDALS", "Sandals", "FOOTWEAR", 10],
  ["FTW-SNEAKERS", "Sneakers", "FOOTWEAR", 20],
  ["ACC-BAGS", "Bags", "ACCESSORIES", 10],
  ["ACC-BELTS", "Belts", "ACCESSORIES", 20],
  ["ACC-SCARVES", "Scarves", "ACCESSORIES", 30],
  ["ACC-SOCKS", "Socks", "ACCESSORIES", 40],
  ["ACC-HEADWEAR", "Headwear", "ACCESSORIES", 50]
] as const;

const attributeSeeds = {
  SIZE: {
    name: "Size",
    values: [
      ["XS", "XS"],
      ["S", "S"],
      ["M", "M"],
      ["L", "L"],
      ["XL", "XL"],
      ["XXL", "XXL"]
    ]
  },
  WAIST: {
    name: "Waist",
    values: [
      ["W30", "W30"],
      ["W32", "W32"],
      ["W34", "W34"],
      ["W36", "W36"],
      ["W38", "W38"]
    ]
  },
  KIDS_SIZE: {
    name: "Kids Size",
    values: [
      ["2Y", "2Y"],
      ["4Y", "4Y"],
      ["6Y", "6Y"],
      ["8Y", "8Y"],
      ["10Y", "10Y"]
    ]
  },
  SHOE_SIZE: {
    name: "Shoe Size",
    values: [
      ["40", "40"],
      ["41", "41"],
      ["42", "42"],
      ["43", "43"],
      ["44", "44"],
      ["45", "45"]
    ]
  },
  COLOR: {
    name: "Colour",
    values: [
      ["BLACK", "Black"],
      ["WHITE", "White"],
      ["NAVY", "Navy"],
      ["RED", "Red"],
      ["OLIVE", "Olive"],
      ["CHARCOAL", "Charcoal"],
      ["BEIGE", "Beige"],
      ["BLUE", "Blue"],
      ["BROWN", "Brown"]
    ]
  },
  FABRIC: {
    name: "Fabric",
    values: [
      ["COTTON", "Cotton"],
      ["LINEN", "Linen"],
      ["SILK", "Silk"],
      ["VISCOSE", "Viscose"],
      ["DENIM", "Denim"],
      ["LEATHER", "Leather"],
      ["POLYESTER", "Polyester"]
    ]
  },
  FIT: {
    name: "Fit",
    values: [
      ["SLIM", "Slim"],
      ["REGULAR", "Regular"],
      ["RELAXED", "Relaxed"],
      ["TAPERED", "Tapered"]
    ]
  }
} as const;

type AttributeCode = keyof typeof attributeSeeds;

type MatrixVariantSeed = {
  sku: string;
  price: number;
  cost: number;
  stock: number;
  attributes: Partial<Record<AttributeCode, string>>;
};

type MatrixProductSeed = {
  code: string;
  name: string;
  category: string;
  subcategory: string;
  brand: string;
  description: string;
  attributes: AttributeCode[];
  variants: MatrixVariantSeed[];
};

type StandardProductSeed = {
  code: string;
  name: string;
  category: string;
  subcategory: string;
  brand: string;
  price: number;
  cost: number;
  stock: number;
  barcode: string;
  description: string;
};

const matrixProducts: MatrixProductSeed[] = [
  {
    code: "APP-POLO-CORE",
    name: "Core Cotton Polo Shirt",
    category: "APP-MENS-TOPS",
    subcategory: "Polo Shirts",
    brand: "Sheval Classics",
    description: "Everyday cotton polo style with configurable size, colour, and fabric.",
    attributes: ["SIZE", "COLOR", "FABRIC"],
    variants: [
      { sku: "APP-POLO-CORE-S-BLK-COT", price: 75, cost: 38, stock: 18, attributes: { SIZE: "S", COLOR: "BLACK", FABRIC: "COTTON" } },
      { sku: "APP-POLO-CORE-M-BLK-COT", price: 75, cost: 38, stock: 24, attributes: { SIZE: "M", COLOR: "BLACK", FABRIC: "COTTON" } },
      { sku: "APP-POLO-CORE-L-NAV-COT", price: 78, cost: 40, stock: 21, attributes: { SIZE: "L", COLOR: "NAVY", FABRIC: "COTTON" } },
      { sku: "APP-POLO-CORE-XL-WHT-COT", price: 78, cost: 40, stock: 12, attributes: { SIZE: "XL", COLOR: "WHITE", FABRIC: "COTTON" } },
      { sku: "APP-POLO-CORE-M-RED-COT", price: 82, cost: 42, stock: 15, attributes: { SIZE: "M", COLOR: "RED", FABRIC: "COTTON" } },
      { sku: "APP-POLO-CORE-L-OLV-LIN", price: 92, cost: 51, stock: 10, attributes: { SIZE: "L", COLOR: "OLIVE", FABRIC: "LINEN" } }
    ]
  },
  {
    code: "APP-DRESS-AMARA-MIDI",
    name: "Amara Midi Dress",
    category: "APP-WOMENS-DRESSES",
    subcategory: "Midi Dresses",
    brand: "Sheval Studio",
    description: "Boutique midi dress with separate pricing by fabric and colour.",
    attributes: ["SIZE", "COLOR", "FABRIC"],
    variants: [
      { sku: "APP-DRESS-AMARA-S-RED-VIS", price: 185, cost: 96, stock: 8, attributes: { SIZE: "S", COLOR: "RED", FABRIC: "VISCOSE" } },
      { sku: "APP-DRESS-AMARA-M-RED-VIS", price: 185, cost: 96, stock: 13, attributes: { SIZE: "M", COLOR: "RED", FABRIC: "VISCOSE" } },
      { sku: "APP-DRESS-AMARA-L-BLK-VIS", price: 190, cost: 99, stock: 11, attributes: { SIZE: "L", COLOR: "BLACK", FABRIC: "VISCOSE" } },
      { sku: "APP-DRESS-AMARA-M-NAV-SLK", price: 245, cost: 140, stock: 6, attributes: { SIZE: "M", COLOR: "NAVY", FABRIC: "SILK" } },
      { sku: "APP-DRESS-AMARA-L-BGE-SLK", price: 255, cost: 146, stock: 5, attributes: { SIZE: "L", COLOR: "BEIGE", FABRIC: "SILK" } }
    ]
  },
  {
    code: "APP-CHINO-SLIM",
    name: "Slim Chino Trousers",
    category: "APP-MENS-BOTTOMS",
    subcategory: "Chinos",
    brand: "Sheval Tailored",
    description: "Slim chino trousers configurable by waist, colour, and fit.",
    attributes: ["WAIST", "COLOR", "FIT"],
    variants: [
      { sku: "APP-CHINO-SLIM-W30-BGE-SLM", price: 145, cost: 78, stock: 10, attributes: { WAIST: "W30", COLOR: "BEIGE", FIT: "SLIM" } },
      { sku: "APP-CHINO-SLIM-W32-BGE-SLM", price: 145, cost: 78, stock: 15, attributes: { WAIST: "W32", COLOR: "BEIGE", FIT: "SLIM" } },
      { sku: "APP-CHINO-SLIM-W34-NAV-SLM", price: 150, cost: 82, stock: 12, attributes: { WAIST: "W34", COLOR: "NAVY", FIT: "SLIM" } },
      { sku: "APP-CHINO-SLIM-W36-BLK-REG", price: 150, cost: 82, stock: 9, attributes: { WAIST: "W36", COLOR: "BLACK", FIT: "REGULAR" } },
      { sku: "APP-CHINO-SLIM-W38-OLV-REG", price: 155, cost: 84, stock: 7, attributes: { WAIST: "W38", COLOR: "OLIVE", FIT: "REGULAR" } }
    ]
  },
  {
    code: "APP-DENIM-STRAIGHT",
    name: "Heritage Straight Denim Jeans",
    category: "APP-DENIM",
    subcategory: "Jeans",
    brand: "Sheval Denim",
    description: "Straight-cut denim with waist, wash colour, and fit combinations.",
    attributes: ["WAIST", "COLOR", "FIT", "FABRIC"],
    variants: [
      { sku: "APP-DENIM-STR-W30-BLU-REG-DEN", price: 165, cost: 92, stock: 13, attributes: { WAIST: "W30", COLOR: "BLUE", FIT: "REGULAR", FABRIC: "DENIM" } },
      { sku: "APP-DENIM-STR-W32-BLU-REG-DEN", price: 165, cost: 92, stock: 18, attributes: { WAIST: "W32", COLOR: "BLUE", FIT: "REGULAR", FABRIC: "DENIM" } },
      { sku: "APP-DENIM-STR-W34-CHR-REG-DEN", price: 175, cost: 98, stock: 12, attributes: { WAIST: "W34", COLOR: "CHARCOAL", FIT: "REGULAR", FABRIC: "DENIM" } },
      { sku: "APP-DENIM-STR-W36-BLK-REL-DEN", price: 178, cost: 100, stock: 10, attributes: { WAIST: "W36", COLOR: "BLACK", FIT: "RELAXED", FABRIC: "DENIM" } }
    ]
  },
  {
    code: "APP-BLAZER-LINEN",
    name: "Linen Blend Blazer",
    category: "APP-OUTERWEAR",
    subcategory: "Blazers",
    brand: "Sheval Tailored",
    description: "Lightweight blazer with linen and cotton-rich combinations.",
    attributes: ["SIZE", "COLOR", "FABRIC"],
    variants: [
      { sku: "APP-BLAZER-LIN-S-BGE-LIN", price: 320, cost: 182, stock: 5, attributes: { SIZE: "S", COLOR: "BEIGE", FABRIC: "LINEN" } },
      { sku: "APP-BLAZER-LIN-M-BGE-LIN", price: 320, cost: 182, stock: 7, attributes: { SIZE: "M", COLOR: "BEIGE", FABRIC: "LINEN" } },
      { sku: "APP-BLAZER-LIN-L-NAV-LIN", price: 335, cost: 190, stock: 5, attributes: { SIZE: "L", COLOR: "NAVY", FABRIC: "LINEN" } },
      { sku: "APP-BLAZER-LIN-XL-BLK-COT", price: 310, cost: 176, stock: 4, attributes: { SIZE: "XL", COLOR: "BLACK", FABRIC: "COTTON" } }
    ]
  },
  {
    code: "APP-KIDS-TEE-GRAPHIC",
    name: "Kids Graphic T-Shirt",
    category: "APP-KIDS",
    subcategory: "T-Shirts",
    brand: "Sheval Kids",
    description: "Kids tee with age-size and colour combinations.",
    attributes: ["KIDS_SIZE", "COLOR"],
    variants: [
      { sku: "APP-KIDS-TEE-2Y-RED", price: 45, cost: 22, stock: 18, attributes: { KIDS_SIZE: "2Y", COLOR: "RED" } },
      { sku: "APP-KIDS-TEE-4Y-BLU", price: 45, cost: 22, stock: 24, attributes: { KIDS_SIZE: "4Y", COLOR: "BLUE" } },
      { sku: "APP-KIDS-TEE-6Y-BLK", price: 48, cost: 24, stock: 21, attributes: { KIDS_SIZE: "6Y", COLOR: "BLACK" } },
      { sku: "APP-KIDS-TEE-8Y-WHT", price: 48, cost: 24, stock: 19, attributes: { KIDS_SIZE: "8Y", COLOR: "WHITE" } },
      { sku: "APP-KIDS-TEE-10Y-NAV", price: 52, cost: 26, stock: 13, attributes: { KIDS_SIZE: "10Y", COLOR: "NAVY" } }
    ]
  },
  {
    code: "APP-ABAYA-MODERN",
    name: "Modern Abaya",
    category: "APP-MODEST",
    subcategory: "Abaya",
    brand: "Sheval Modest",
    description: "Modest-wear style configurable by size, colour, and fabric.",
    attributes: ["SIZE", "COLOR", "FABRIC"],
    variants: [
      { sku: "APP-ABAYA-MOD-S-BLK-POL", price: 210, cost: 118, stock: 9, attributes: { SIZE: "S", COLOR: "BLACK", FABRIC: "POLYESTER" } },
      { sku: "APP-ABAYA-MOD-M-BLK-POL", price: 210, cost: 118, stock: 14, attributes: { SIZE: "M", COLOR: "BLACK", FABRIC: "POLYESTER" } },
      { sku: "APP-ABAYA-MOD-L-NAV-VIS", price: 235, cost: 132, stock: 10, attributes: { SIZE: "L", COLOR: "NAVY", FABRIC: "VISCOSE" } },
      { sku: "APP-ABAYA-MOD-XL-BGE-VIS", price: 240, cost: 136, stock: 7, attributes: { SIZE: "XL", COLOR: "BEIGE", FABRIC: "VISCOSE" } }
    ]
  },
  {
    code: "FTW-LEATHER-SANDAL",
    name: "Leather Strap Sandal",
    category: "FTW-SANDALS",
    subcategory: "Leather Sandals",
    brand: "Sheval Footwear",
    description: "Leather sandals with shoe-size and colour combinations.",
    attributes: ["SHOE_SIZE", "COLOR", "FABRIC"],
    variants: [
      { sku: "FTW-SANDAL-40-BRN-LTH", price: 125, cost: 68, stock: 8, attributes: { SHOE_SIZE: "40", COLOR: "BROWN", FABRIC: "LEATHER" } },
      { sku: "FTW-SANDAL-41-BRN-LTH", price: 125, cost: 68, stock: 12, attributes: { SHOE_SIZE: "41", COLOR: "BROWN", FABRIC: "LEATHER" } },
      { sku: "FTW-SANDAL-42-BLK-LTH", price: 130, cost: 72, stock: 11, attributes: { SHOE_SIZE: "42", COLOR: "BLACK", FABRIC: "LEATHER" } },
      { sku: "FTW-SANDAL-43-BLK-LTH", price: 130, cost: 72, stock: 9, attributes: { SHOE_SIZE: "43", COLOR: "BLACK", FABRIC: "LEATHER" } }
    ]
  },
  {
    code: "FTW-SNEAKER-LOW",
    name: "Low Top Canvas Sneaker",
    category: "FTW-SNEAKERS",
    subcategory: "Canvas Sneakers",
    brand: "Sheval Footwear",
    description: "Casual canvas sneaker with shoe-size and colour combinations.",
    attributes: ["SHOE_SIZE", "COLOR", "FABRIC"],
    variants: [
      { sku: "FTW-SNEAKER-41-WHT-COT", price: 155, cost: 84, stock: 14, attributes: { SHOE_SIZE: "41", COLOR: "WHITE", FABRIC: "COTTON" } },
      { sku: "FTW-SNEAKER-42-WHT-COT", price: 155, cost: 84, stock: 18, attributes: { SHOE_SIZE: "42", COLOR: "WHITE", FABRIC: "COTTON" } },
      { sku: "FTW-SNEAKER-43-BLK-COT", price: 160, cost: 88, stock: 16, attributes: { SHOE_SIZE: "43", COLOR: "BLACK", FABRIC: "COTTON" } },
      { sku: "FTW-SNEAKER-44-NAV-COT", price: 160, cost: 88, stock: 11, attributes: { SHOE_SIZE: "44", COLOR: "NAVY", FABRIC: "COTTON" } },
      { sku: "FTW-SNEAKER-45-OLV-COT", price: 165, cost: 90, stock: 7, attributes: { SHOE_SIZE: "45", COLOR: "OLIVE", FABRIC: "COTTON" } }
    ]
  },
  {
    code: "APP-SKIRT-PENCIL",
    name: "Pencil Skirt",
    category: "APP-WOMENS-BOTTOMS",
    subcategory: "Skirts",
    brand: "Sheval Studio",
    description: "Office pencil skirt with size, colour, and fabric options.",
    attributes: ["SIZE", "COLOR", "FABRIC"],
    variants: [
      { sku: "APP-SKIRT-PEN-S-BLK-COT", price: 125, cost: 67, stock: 9, attributes: { SIZE: "S", COLOR: "BLACK", FABRIC: "COTTON" } },
      { sku: "APP-SKIRT-PEN-M-BLK-COT", price: 125, cost: 67, stock: 14, attributes: { SIZE: "M", COLOR: "BLACK", FABRIC: "COTTON" } },
      { sku: "APP-SKIRT-PEN-L-NAV-VIS", price: 135, cost: 74, stock: 10, attributes: { SIZE: "L", COLOR: "NAVY", FABRIC: "VISCOSE" } },
      { sku: "APP-SKIRT-PEN-XL-CHR-VIS", price: 138, cost: 76, stock: 7, attributes: { SIZE: "XL", COLOR: "CHARCOAL", FABRIC: "VISCOSE" } }
    ]
  }
];

const standardProducts: StandardProductSeed[] = [
  { code: "ACC-BELT-LEATHER-BLK", name: "Black Leather Belt", category: "ACC-BELTS", subcategory: "Belts", brand: "Sheval Accessories", price: 85, cost: 42, stock: 35, barcode: barcodeFor(701), description: "Genuine leather black belt." },
  { code: "ACC-BELT-LEATHER-BRN", name: "Brown Leather Belt", category: "ACC-BELTS", subcategory: "Belts", brand: "Sheval Accessories", price: 85, cost: 42, stock: 28, barcode: barcodeFor(702), description: "Genuine leather brown belt." },
  { code: "ACC-CANVAS-TOTE", name: "Canvas Tote Bag", category: "ACC-BAGS", subcategory: "Tote Bags", brand: "Sheval Accessories", price: 65, cost: 28, stock: 42, barcode: barcodeFor(703), description: "Everyday cotton canvas tote." },
  { code: "ACC-MINI-CROSSBODY", name: "Mini Crossbody Bag", category: "ACC-BAGS", subcategory: "Crossbody Bags", brand: "Sheval Accessories", price: 145, cost: 80, stock: 18, barcode: barcodeFor(704), description: "Compact crossbody bag for daily use." },
  { code: "ACC-SCARF-SILK-PRINT", name: "Printed Silk Scarf", category: "ACC-SCARVES", subcategory: "Scarves", brand: "Sheval Studio", price: 95, cost: 46, stock: 22, barcode: barcodeFor(705), description: "Printed silk scarf accessory." },
  { code: "ACC-CAP-LOGO", name: "Logo Baseball Cap", category: "ACC-HEADWEAR", subcategory: "Caps", brand: "Sheval Accessories", price: 55, cost: 22, stock: 46, barcode: barcodeFor(706), description: "Cotton logo baseball cap." },
  { code: "ACC-SOCKS-3PK", name: "Cotton Socks 3 Pack", category: "ACC-SOCKS", subcategory: "Socks", brand: "Sheval Basics", price: 35, cost: 14, stock: 72, barcode: barcodeFor(707), description: "Three-pack cotton socks." },
  { code: "APP-TIE-SILK-NAVY", name: "Navy Silk Tie", category: "ACC-SCARVES", subcategory: "Ties", brand: "Sheval Tailored", price: 70, cost: 31, stock: 24, barcode: barcodeFor(708), description: "Navy silk tie." },
  { code: "APP-HIJAB-CHIFFON-BLK", name: "Black Chiffon Hijab", category: "APP-MODEST", subcategory: "Hijabs", brand: "Sheval Modest", price: 60, cost: 26, stock: 33, barcode: barcodeFor(709), description: "Soft black chiffon hijab." },
  { code: "APP-HIJAB-CHIFFON-BGE", name: "Beige Chiffon Hijab", category: "APP-MODEST", subcategory: "Hijabs", brand: "Sheval Modest", price: 60, cost: 26, stock: 29, barcode: barcodeFor(710), description: "Soft beige chiffon hijab." },
  { code: "ACC-GARMENT-BAG", name: "Suit Garment Bag", category: "ACC-BAGS", subcategory: "Garment Care", brand: "Sheval Accessories", price: 40, cost: 16, stock: 40, barcode: barcodeFor(711), description: "Protective garment bag for suits and dresses." },
  { code: "ACC-LINT-ROLLER", name: "Travel Lint Roller", category: "ACC-BAGS", subcategory: "Garment Care", brand: "Sheval Basics", price: 18, cost: 6, stock: 80, barcode: barcodeFor(712), description: "Travel lint roller for clothing care." }
];

const supplierSeeds = [
  {
    supplierNo: "SUP-FABRIC-001",
    name: "Accra Textile Mills",
    city: "Accra",
    leadTimeDays: 7,
    categories: ["APP-MENS-TOPS", "APP-WOMENS-DRESSES", "APP-MENS-BOTTOMS", "APP-OUTERWEAR", "APP-KIDS", "APP-MODEST", "APP-WOMENS-BOTTOMS"]
  },
  {
    supplierNo: "SUP-DENIM-001",
    name: "Tema Denim Works",
    city: "Tema",
    leadTimeDays: 10,
    categories: ["APP-DENIM"]
  },
  {
    supplierNo: "SUP-FOOTWEAR-001",
    name: "Kumasi Footwear Co.",
    city: "Kumasi",
    leadTimeDays: 12,
    categories: ["FTW-SANDALS", "FTW-SNEAKERS"]
  },
  {
    supplierNo: "SUP-ACCESS-001",
    name: "Sheval Accessories Wholesale",
    city: "Accra",
    leadTimeDays: 5,
    categories: ["ACC-BAGS", "ACC-BELTS", "ACC-SCARVES", "ACC-SOCKS", "ACC-HEADWEAR"]
  }
] as const;

const tenderMethodSeeds = [
  {
    code: "CASH",
    name: "Cash",
    paymentMethod: "CASH",
    description: "Cash tender with change and drawer support.",
    requiresReference: false,
    allowChange: true,
    allowRefund: true,
    allowOpenCashDrawer: true,
    sortOrder: 10
  },
  {
    code: "VISA-MASTERCARD",
    name: "Visa / Mastercard",
    paymentMethod: "CARD",
    description: "Card terminal tender for Visa and Mastercard settlements.",
    requiresReference: true,
    allowChange: false,
    allowRefund: true,
    allowOpenCashDrawer: false,
    sortOrder: 20
  },
  {
    code: "MOMO-MTN",
    name: "MTN Mobile Money",
    paymentMethod: "MOBILE_MONEY",
    description: "MTN MoMo tender requiring transaction reference capture.",
    requiresReference: true,
    allowChange: false,
    allowRefund: true,
    allowOpenCashDrawer: false,
    sortOrder: 30
  },
  {
    code: "MOMO-TELECEL",
    name: "Telecel Cash",
    paymentMethod: "MOBILE_MONEY",
    description: "Telecel Cash tender requiring transaction reference capture.",
    requiresReference: true,
    allowChange: false,
    allowRefund: true,
    allowOpenCashDrawer: false,
    sortOrder: 40
  },
  {
    code: "MOMO-AT",
    name: "AT Money",
    paymentMethod: "MOBILE_MONEY",
    description: "AirtelTigo Money tender requiring transaction reference capture.",
    requiresReference: true,
    allowChange: false,
    allowRefund: true,
    allowOpenCashDrawer: false,
    sortOrder: 50
  },
  {
    code: "BANK-TRANSFER",
    name: "Bank Transfer",
    paymentMethod: "BANK_TRANSFER",
    description: "Direct bank transfer tender requiring payment reference.",
    requiresReference: true,
    allowChange: false,
    allowRefund: true,
    allowOpenCashDrawer: false,
    sortOrder: 60
  },
  {
    code: "STORE-CREDIT",
    name: "Customer Account",
    paymentMethod: "STORE_CREDIT",
    description: "Customer receivable account tender for approved credit customers.",
    requiresReference: false,
    allowChange: false,
    allowRefund: true,
    allowOpenCashDrawer: false,
    sortOrder: 70
  },
  {
    code: "GIFT-CARD",
    name: "Gift Card",
    paymentMethod: "GIFT_CARD",
    description: "Gift card or voucher redemption tender.",
    requiresReference: true,
    allowChange: false,
    allowRefund: true,
    allowOpenCashDrawer: false,
    sortOrder: 80
  }
] as const;

const obsoleteTenderMethodCodes = ["CARD-VISA-MC", "MOMO"] as const;

const bankSeeds = [
  {
    bankCode: "GCB",
    bankName: "GCB Bank",
    description: "Primary cash banking partner.",
    branchCode: "GCB-ACCRA-CENTRAL",
    branchName: "Accra Central Branch",
    addressLine1: "High Street, Accra",
    accountNumber: "103000445501",
    accountName: "Sheval Fashion - Cash Clearing"
  },
  {
    bankCode: "ECOBANK",
    bankName: "Ecobank Ghana",
    description: "Mobile money and transfer settlement bank.",
    branchCode: "ECO-OSU",
    branchName: "Osu Oxford Street Branch",
    addressLine1: "Oxford Street, Osu",
    accountNumber: "144200118899",
    accountName: "Sheval Fashion - Digital Receipts"
  },
  {
    bankCode: "ABSA",
    bankName: "Absa Bank Ghana",
    description: "Card settlement bank.",
    branchCode: "ABSA-RINGWAY",
    branchName: "Ringway Branch",
    addressLine1: "Ringway Estates, Accra",
    accountNumber: "220010334455",
    accountName: "Sheval Fashion - Card Settlement"
  },
  {
    bankCode: "STANBIC",
    bankName: "Stanbic Bank Ghana",
    description: "Operations reserve bank account.",
    branchCode: "STB-AIRPORT",
    branchName: "Airport Branch",
    addressLine1: "Airport City, Accra",
    accountNumber: "770045560012",
    accountName: "Sheval Fashion - Operations"
  }
] as const;

const customerSeeds = [
  {
    customerNo: "CUST-FASHION-001",
    fullName: "Akosua Mensah",
    customerType: "INDIVIDUAL",
    phone: "0244001001",
    email: "akosua.mensah@example.com",
    city: "Accra",
    loyaltyTier: "Gold",
    loyaltyPointsBalance: 420,
    allowCreditSales: false,
    creditLimitAmount: null,
    note: "Prefers silk dresses and modest wear."
  },
  {
    customerNo: "CUST-FASHION-002",
    fullName: "Kwame Boateng",
    customerType: "INDIVIDUAL",
    phone: "0244001002",
    email: "kwame.boateng@example.com",
    city: "Accra",
    loyaltyTier: "Silver",
    loyaltyPointsBalance: 185,
    allowCreditSales: false,
    creditLimitAmount: null,
    note: "Regular menswear customer."
  },
  {
    customerNo: "CUST-FASHION-003",
    fullName: "Ama Serwaa",
    customerType: "INDIVIDUAL",
    phone: "0244001003",
    email: "ama.serwaa@example.com",
    city: "Kumasi",
    loyaltyTier: "Platinum",
    loyaltyPointsBalance: 760,
    allowCreditSales: true,
    creditLimitAmount: 1500,
    note: "VIP customer for dresses and accessories."
  },
  {
    customerNo: "CUST-FASHION-004",
    fullName: "Nana Yaw Osei",
    customerType: "INDIVIDUAL",
    phone: "0244001004",
    email: "nana.osei@example.com",
    city: "Kumasi",
    loyaltyTier: "Bronze",
    loyaltyPointsBalance: 90,
    allowCreditSales: false,
    creditLimitAmount: null,
    note: "Buys denim and footwear."
  },
  {
    customerNo: "CUST-FASHION-005",
    fullName: "Esi Owusu",
    customerType: "INDIVIDUAL",
    phone: "0244001005",
    email: "esi.owusu@example.com",
    city: "Tema",
    loyaltyTier: "Gold",
    loyaltyPointsBalance: 515,
    allowCreditSales: false,
    creditLimitAmount: null,
    note: "Often buys kids clothing."
  },
  {
    customerNo: "CUST-FASHION-006",
    fullName: "Michael Ampofo",
    customerType: "INDIVIDUAL",
    phone: "0244055490",
    email: "michael.ampofo@example.com",
    city: "Accra",
    loyaltyTier: "Silver",
    loyaltyPointsBalance: 260,
    allowCreditSales: false,
    creditLimitAmount: null,
    note: "Sample walk-in customer used for POS receipt checks."
  },
  {
    customerNo: "CUST-FASHION-007",
    fullName: "Afia Adjei",
    customerType: "INDIVIDUAL",
    phone: "0244001007",
    email: "afia.adjei@example.com",
    city: "Accra",
    loyaltyTier: "Silver",
    loyaltyPointsBalance: 310,
    allowCreditSales: false,
    creditLimitAmount: null,
    note: "Prefers workwear and blazers."
  },
  {
    customerNo: "CUST-FASHION-008",
    fullName: "Kojo Frimpong",
    customerType: "INDIVIDUAL",
    phone: "0244001008",
    email: "kojo.frimpong@example.com",
    city: "Cape Coast",
    loyaltyTier: "Bronze",
    loyaltyPointsBalance: 65,
    allowCreditSales: false,
    creditLimitAmount: null,
    note: "Footwear and accessories buyer."
  },
  {
    customerNo: "CUST-FASHION-009",
    fullName: "Grace Badu",
    customerType: "INDIVIDUAL",
    phone: "0244001009",
    email: "grace.badu@example.com",
    city: "Takoradi",
    loyaltyTier: "Gold",
    loyaltyPointsBalance: 480,
    allowCreditSales: true,
    creditLimitAmount: 1000,
    note: "Remote customer for online orders."
  },
  {
    customerNo: "CUST-FASHION-010",
    fullName: "Yaw Fashion House",
    customerType: "BUSINESS",
    phone: "0244001010",
    email: "orders@yawfashion.example.com",
    city: "Accra",
    loyaltyTier: "Wholesale",
    loyaltyPointsBalance: 1200,
    allowCreditSales: true,
    creditLimitAmount: 5000,
    note: "Small boutique buying accessories and basics."
  },
  {
    customerNo: "CUST-FASHION-011",
    fullName: "Sheila Quartey",
    customerType: "INDIVIDUAL",
    phone: "0244001011",
    email: "sheila.quartey@example.com",
    city: "Accra",
    loyaltyTier: "Silver",
    loyaltyPointsBalance: 235,
    allowCreditSales: false,
    creditLimitAmount: null,
    note: "Modest-wear customer."
  },
  {
    customerNo: "CUST-FASHION-012",
    fullName: "Kofi Annan",
    customerType: "INDIVIDUAL",
    phone: "0244001012",
    email: "kofi.annan@example.com",
    city: "Koforidua",
    loyaltyTier: "Bronze",
    loyaltyPointsBalance: 120,
    allowCreditSales: false,
    creditLimitAmount: null,
    note: "Casual menswear customer."
  }
] as const;

function categoryDepartment(categoryCode: string) {
  const category = categories.find(([candidate]) => candidate === categoryCode);

  if (!category) {
    throw new Error(`Missing clothing category ${categoryCode}.`);
  }

  return category[2];
}

function categoryName(categoryCode: string) {
  const category = categories.find(([candidate]) => candidate === categoryCode);

  if (!category) {
    throw new Error(`Missing clothing category ${categoryCode}.`);
  }

  return category[1];
}

function variantLabel(seed: MatrixVariantSeed, productAttributes: AttributeCode[]) {
  return productAttributes
    .map((attributeCode) => {
      const valueCode = seed.attributes[attributeCode];
      const value = valueCode
        ? attributeSeeds[attributeCode].values.find(([candidate]) => candidate === valueCode)
        : null;

      return value?.[1] ?? valueCode;
    })
    .filter(Boolean)
    .join(" / ");
}

function distribute(total: number, buckets: number) {
  const safeBuckets = Math.max(1, buckets);
  const base = Math.floor(total / safeBuckets);
  let remainder = total - base * safeBuckets;

  return Array.from({ length: safeBuckets }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    remainder -= 1;
    return value;
  });
}

async function ensureEnterpriseNode() {
  const existing = await prisma.syncNode.findFirst({
    where: {
      nodeType: "ENTERPRISE",
      isPrimary: true,
      status: "ACTIVE"
    },
    select: {
      id: true,
      code: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          id: true,
          code: true,
          name: true,
          baseCurrencyCode: true,
          timezone: true
        }
      }
    }
  });

  if (existing) {
    return existing;
  }

  const retailOrg = await prisma.retailOrg.upsert({
    where: {
      code: "flash-retail"
    },
    update: {
      name: "Flash Retail",
      baseCurrencyCode: process.env.FLASH_ERP_DEFAULT_CURRENCY ?? "GHS",
      timezone: process.env.FLASH_ERP_DEFAULT_TIMEZONE ?? "Africa/Accra",
      status: "ACTIVE"
    },
    create: {
      code: "flash-retail",
      name: "Flash Retail",
      baseCurrencyCode: process.env.FLASH_ERP_DEFAULT_CURRENCY ?? "GHS",
      timezone: process.env.FLASH_ERP_DEFAULT_TIMEZONE ?? "Africa/Accra",
      status: "ACTIVE"
    },
    select: {
      id: true,
      code: true,
      name: true,
      baseCurrencyCode: true,
      timezone: true
    }
  });

  const enterpriseNode = await prisma.syncNode.upsert({
    where: {
      code: "enterprise-primary"
    },
    update: {
      retailOrgId: retailOrg.id,
      nodeType: "ENTERPRISE",
      direction: "BIDIRECTIONAL",
      isPrimary: true,
      status: "ACTIVE",
      lastHeartbeatAt: now
    },
    create: {
      retailOrgId: retailOrg.id,
      code: "enterprise-primary",
      name: "Enterprise Primary",
      nodeType: "ENTERPRISE",
      direction: "BIDIRECTIONAL",
      isPrimary: true,
      status: "ACTIVE",
      lastHeartbeatAt: now
    },
    select: {
      id: true,
      code: true,
      retailOrgId: true
    }
  });

  return {
    ...enterpriseNode,
    retailOrg
  };
}

async function ensureStoreBundle(input: {
  retailOrgId: string;
  currencyCode: string;
  timezone: string;
  storeCode: string;
  storeName: string;
  city: string;
  storeMode: string;
  nodeCode: string;
}) {
  const store = await prisma.store.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: input.retailOrgId,
        code: input.storeCode
      }
    },
    update: {
      name: input.storeName,
      city: input.city,
      currencyCode: input.currencyCode,
      timezone: input.timezone,
      salesEnabled: true,
      warehouseEnabled: true,
      storeMode: input.storeMode,
      status: "ACTIVE",
      licenseStatus: "LICENSED",
      receiptFooter: "Thank you for shopping Sheval Fashion."
    },
    create: {
      retailOrgId: input.retailOrgId,
      code: input.storeCode,
      name: input.storeName,
      shortName: input.storeName,
      currencyCode: input.currencyCode,
      timezone: input.timezone,
      salesEnabled: true,
      warehouseEnabled: true,
      city: input.city,
      countryCode: "GH",
      storeMode: input.storeMode,
      status: "ACTIVE",
      licenseStatus: "LICENSED",
      receiptFooter: "Thank you for shopping Sheval Fashion."
    },
    select: {
      id: true,
      code: true,
      name: true,
      currencyCode: true,
      timezone: true
    }
  });
  const warehouse = await prisma.warehouse.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: input.retailOrgId,
        code: `${store.code}-wh`
      }
    },
    update: {
      storeId: store.id,
      name: `${store.name} Warehouse`,
      status: "ACTIVE",
      licenseStatus: "LICENSED"
    },
    create: {
      retailOrgId: input.retailOrgId,
      storeId: store.id,
      code: `${store.code}-wh`,
      name: `${store.name} Warehouse`,
      status: "ACTIVE",
      licenseStatus: "LICENSED"
    },
    select: {
      id: true,
      code: true,
      name: true
    }
  });
  const salesLocation = await prisma.inventoryLocation.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: input.retailOrgId,
        code: `${store.code}-sales-floor`
      }
    },
    update: {
      storeId: store.id,
      warehouseId: warehouse.id,
      name: `${store.name} Sales Floor`,
      locationType: "SALES_FLOOR",
      status: "ACTIVE",
      useForSalesDefault: true,
      useForSalesOrderDefault: true,
      useForReceivingDefault: true
    },
    create: {
      retailOrgId: input.retailOrgId,
      storeId: store.id,
      warehouseId: warehouse.id,
      code: `${store.code}-sales-floor`,
      name: `${store.name} Sales Floor`,
      locationType: "SALES_FLOOR",
      status: "ACTIVE",
      useForSalesDefault: true,
      useForSalesOrderDefault: true,
      useForReceivingDefault: true
    },
    select: {
      id: true,
      code: true,
      name: true,
      locationType: true,
      status: true,
      useForSalesDefault: true,
      useForSalesOrderDefault: true,
      useForReceivingDefault: true,
      updatedAt: true
    }
  });
  const terminal = await prisma.terminal.upsert({
    where: {
      storeId_code: {
        storeId: store.id,
        code: "front-01"
      }
    },
    update: {
      name: "Front Counter 01",
      status: "ACTIVE",
      licenseStatus: "LICENSED",
      lastHeartbeatAt: now
    },
    create: {
      retailOrgId: input.retailOrgId,
      storeId: store.id,
      code: "front-01",
      name: "Front Counter 01",
      status: "ACTIVE",
      licenseStatus: "LICENSED",
      lastHeartbeatAt: now
    },
    select: {
      id: true,
      code: true,
      name: true
    }
  });
  const syncNode = await prisma.syncNode.upsert({
    where: {
      code: input.nodeCode
    },
    update: {
      retailOrgId: input.retailOrgId,
      storeId: store.id,
      terminalId: terminal.id,
      nodeType: "STORE",
      direction: "BIDIRECTIONAL",
      status: "ACTIVE",
      lastHeartbeatAt: now,
      lastTelemetryAt: now
    },
    create: {
      retailOrgId: input.retailOrgId,
      storeId: store.id,
      terminalId: terminal.id,
      code: input.nodeCode,
      name: `${store.name} Store Node`,
      nodeType: "STORE",
      direction: "BIDIRECTIONAL",
      status: "ACTIVE",
      lastHeartbeatAt: now,
      lastTelemetryAt: now
    },
    select: {
      id: true,
      code: true
    }
  });

  return {
    store,
    warehouse,
    salesLocation,
    terminal,
    syncNode
  };
}

async function ensureStoreBundles(retailOrg: {
  id: string;
  baseCurrencyCode: string;
  timezone: string;
}) {
  const existingStores = await prisma.store.findMany({
    where: {
      retailOrgId: retailOrg.id,
      status: "ACTIVE"
    },
    select: {
      code: true,
      name: true,
      city: true,
      storeMode: true
    }
  });
  const storeSeeds = [...fallbackStoreSeeds];

  for (const existing of existingStores) {
    if (!storeSeeds.some((seed) => seed.code === existing.code)) {
      storeSeeds.push({
        code: existing.code,
        name: existing.name,
        city: existing.city ?? "Accra",
        storeMode: existing.storeMode,
        nodeCode: `store-${existing.code}-01`
      });
    }
  }

  const bundles = [];

  for (const seed of storeSeeds) {
    bundles.push(
      await ensureStoreBundle({
        retailOrgId: retailOrg.id,
        currencyCode: retailOrg.baseCurrencyCode,
        timezone: retailOrg.timezone,
        storeCode: seed.code,
        storeName: seed.name,
        city: seed.city,
        storeMode: seed.storeMode,
        nodeCode: seed.nodeCode
      })
    );
  }

  return bundles;
}

async function upsertOutboxEvent(input: {
  syncNodeId: string;
  targetNodeCode: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  idempotencyKey: string;
  payload: unknown;
}) {
  await prisma.syncOutboxEvent.upsert({
    where: {
      idempotencyKey: input.idempotencyKey
    },
    update: {
      syncNodeId: input.syncNodeId,
      targetNodeCode: input.targetNodeCode,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: json(input.payload),
      status: "PENDING",
      attemptCount: 0,
      lastAttemptAt: null,
      acknowledgedAt: null
    },
    create: {
      syncNodeId: input.syncNodeId,
      targetNodeCode: input.targetNodeCode,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      idempotencyKey: input.idempotencyKey,
      payload: json(input.payload),
      status: "PENDING"
    }
  });
}

async function main() {
  const enterpriseNode = await ensureEnterpriseNode();
  const retailOrg = enterpriseNode.retailOrg;
  const storeBundles = await ensureStoreBundles(retailOrg);
  const taxProfile = await prisma.taxProfile.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: retailOrg.id,
        code: "VAT_STD"
      }
    },
    update: {
      name: "VAT Standard",
      ratePercent: "15.00",
      isDefault: true,
      isTaxInclusive: false,
      status: "ACTIVE",
      lastModifiedByNodeCode: enterpriseNode.code
    },
    create: {
      retailOrgId: retailOrg.id,
      code: "VAT_STD",
      name: "VAT Standard",
      ratePercent: "15.00",
      isDefault: true,
      isTaxInclusive: false,
      status: "ACTIVE",
      originNodeCode: enterpriseNode.code,
      lastModifiedByNodeCode: enterpriseNode.code
    }
  });
  const eachUnit = await prisma.unitOfMeasure.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: retailOrg.id,
        code: "EA"
      }
    },
    update: {
      name: "Each",
      decimalPrecision: 0,
      allowFractionalSale: false,
      status: "ACTIVE",
      lastModifiedByNodeCode: enterpriseNode.code
    },
    create: {
      retailOrgId: retailOrg.id,
      code: "EA",
      name: "Each",
      decimalPrecision: 0,
      allowFractionalSale: false,
      status: "ACTIVE",
      originNodeCode: enterpriseNode.code,
      lastModifiedByNodeCode: enterpriseNode.code
    }
  });
  const priceList = await prisma.priceList.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: retailOrg.id,
        code: "default-sell"
      }
    },
    update: {
      name: "Default Sell Price",
      currencyCode: retailOrg.baseCurrencyCode,
      isDefault: true,
      status: "ACTIVE"
    },
    create: {
      retailOrgId: retailOrg.id,
      code: "default-sell",
      name: "Default Sell Price",
      currencyCode: retailOrg.baseCurrencyCode,
      isDefault: true,
      status: "ACTIVE"
    }
  });

  const tenderMethods = [];

  for (const seed of tenderMethodSeeds) {
    const tenderMethod = await prisma.tenderMethod.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: seed.code
        }
      },
      update: {
        name: seed.name,
        paymentMethod: seed.paymentMethod,
        description: seed.description,
        requiresReference: seed.requiresReference,
        allowChange: seed.allowChange,
        allowRefund: seed.allowRefund,
        allowOpenCashDrawer: seed.allowOpenCashDrawer,
        sortOrder: seed.sortOrder,
        status: "ACTIVE",
        gatewayActive: false,
        gatewayStatus: "DISABLED",
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        code: seed.code,
        name: seed.name,
        paymentMethod: seed.paymentMethod,
        description: seed.description,
        requiresReference: seed.requiresReference,
        allowChange: seed.allowChange,
        allowRefund: seed.allowRefund,
        allowOpenCashDrawer: seed.allowOpenCashDrawer,
        sortOrder: seed.sortOrder,
        status: "ACTIVE",
        gatewayActive: false,
        gatewayStatus: "DISABLED",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true,
        code: true,
        name: true,
        paymentMethod: true,
        gatewayProvider: true,
        gatewayMode: true,
        gatewayMerchantId: true,
        gatewayPublicKey: true,
        gatewayCallbackUrl: true,
        gatewayActive: true,
        gatewayStatus: true,
        description: true,
        requiresReference: true,
        allowChange: true,
        allowRefund: true,
        allowOpenCashDrawer: true,
        status: true,
        sortOrder: true
      }
    });
    tenderMethods.push(tenderMethod);
  }

  const obsoleteTenderMethods = [];

  for (const tenderCode of obsoleteTenderMethodCodes) {
    const existingTenderMethod = await prisma.tenderMethod.findUnique({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: tenderCode
        }
      },
      select: {
        id: true
      }
    });

    if (!existingTenderMethod) {
      continue;
    }

    const obsoleteTenderMethod = await prisma.tenderMethod.update({
      where: {
        id: existingTenderMethod.id
      },
      data: {
        status: "INACTIVE",
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true,
        code: true,
        name: true,
        paymentMethod: true,
        gatewayProvider: true,
        gatewayMode: true,
        gatewayMerchantId: true,
        gatewayPublicKey: true,
        gatewayCallbackUrl: true,
        gatewayActive: true,
        gatewayStatus: true,
        description: true,
        requiresReference: true,
        allowChange: true,
        allowRefund: true,
        allowOpenCashDrawer: true,
        status: true,
        sortOrder: true
      }
    });

    obsoleteTenderMethods.push(obsoleteTenderMethod);
  }

  const tenderMethodsForPublication = [...tenderMethods, ...obsoleteTenderMethods];

  const bankAccounts = [];

  for (const seed of bankSeeds) {
    const bank = await prisma.bank.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: seed.bankCode
        }
      },
      update: {
        name: seed.bankName,
        description: seed.description,
        status: "ACTIVE",
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        code: seed.bankCode,
        name: seed.bankName,
        description: seed.description,
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true,
        code: true,
        name: true
      }
    });
    const branch = await prisma.bankBranch.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: seed.branchCode
        }
      },
      update: {
        bankId: bank.id,
        name: seed.branchName,
        addressLine1: seed.addressLine1,
        status: "ACTIVE",
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        bankId: bank.id,
        code: seed.branchCode,
        name: seed.branchName,
        addressLine1: seed.addressLine1,
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true,
        code: true,
        name: true
      }
    });
    const bankAccount = await prisma.bankAccount.upsert({
      where: {
        retailOrgId_accountNumber: {
          retailOrgId: retailOrg.id,
          accountNumber: seed.accountNumber
        }
      },
      update: {
        branchId: branch.id,
        accountName: seed.accountName,
        currencyCode: retailOrg.baseCurrencyCode,
        status: "ACTIVE",
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        branchId: branch.id,
        accountNumber: seed.accountNumber,
        accountName: seed.accountName,
        currencyCode: retailOrg.baseCurrencyCode,
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true,
        accountNumber: true,
        accountName: true,
        currencyCode: true,
        status: true,
        branch: {
          select: {
            code: true,
            name: true,
            status: true,
            bank: {
              select: {
                code: true,
                name: true,
                status: true
              }
            }
          }
        }
      }
    });
    bankAccounts.push(bankAccount);
  }
  const departmentByCode = new Map<string, { id: string; code: string; name: string; updatedAt: Date; sortOrder: number; description: string | null; status: string }>();
  const categoryByCode = new Map<string, { id: string; code: string; name: string; department: { code: string; name: string }; updatedAt: Date; sortOrder: number; description: string | null; status: string }>();

  for (const seed of departments) {
    const department = await prisma.productDepartment.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: seed.code
        }
      },
      update: {
        name: seed.name,
        description: seed.description,
        sortOrder: seed.sortOrder,
        status: "ACTIVE",
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        code: seed.code,
        name: seed.name,
        description: seed.description,
        sortOrder: seed.sortOrder,
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        sortOrder: true,
        status: true,
        updatedAt: true
      }
    });
    departmentByCode.set(department.code, department);
  }

  for (const [categoryCode, name, departmentCode, sortOrder] of categories) {
    const department = departmentByCode.get(departmentCode);

    if (!department) {
      throw new Error(`Missing department ${departmentCode}.`);
    }

    const category = await prisma.productCategory.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: categoryCode
        }
      },
      update: {
        departmentId: department.id,
        name,
        description: `${name} for clothing retail operations.`,
        sortOrder,
        status: "ACTIVE",
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        departmentId: department.id,
        code: categoryCode,
        name,
        description: `${name} for clothing retail operations.`,
        sortOrder,
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        sortOrder: true,
        status: true,
        updatedAt: true,
        department: {
          select: {
            code: true,
            name: true
          }
        }
      }
    });
    categoryByCode.set(category.code, category);
  }

  const attributeByCode = new Map<string, { id: string; code: string; name: string }>();
  const attributeValueByKey = new Map<string, { id: string; code: string; label: string }>();

  for (const [attributeCode, seed] of Object.entries(attributeSeeds) as Array<[AttributeCode, typeof attributeSeeds[AttributeCode]]>) {
    const attribute = await prisma.productAttributeDefinition.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: attributeCode
        }
      },
      update: {
        name: seed.name,
        status: "ACTIVE"
      },
      create: {
        retailOrgId: retailOrg.id,
        code: attributeCode,
        name: seed.name,
        status: "ACTIVE"
      },
      select: {
        id: true,
        code: true,
        name: true
      }
    });
    attributeByCode.set(attributeCode, attribute);

    for (const [valueCode, label] of seed.values) {
      const value = await prisma.productAttributeValue.upsert({
        where: {
          attributeId_code: {
            attributeId: attribute.id,
            code: valueCode
          }
        },
        update: {
          label,
          status: "ACTIVE"
        },
        create: {
          attributeId: attribute.id,
          code: valueCode,
          label,
          status: "ACTIVE"
        },
        select: {
          id: true,
          code: true,
          label: true
        }
      });
      attributeValueByKey.set(`${attributeCode}:${valueCode}`, value);
    }
  }

  const supplierByCategory = new Map<string, { id: string; leadTimeDays: number }>();

  for (const seed of supplierSeeds) {
    const supplier = await prisma.supplier.upsert({
      where: {
        retailOrgId_supplierNo: {
          retailOrgId: retailOrg.id,
          supplierNo: seed.supplierNo
        }
      },
      update: {
        name: seed.name,
        city: seed.city,
        countryCode: "GH",
        leadTimeDays: seed.leadTimeDays,
        status: "ACTIVE",
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        supplierNo: seed.supplierNo,
        name: seed.name,
        city: seed.city,
        countryCode: "GH",
        leadTimeDays: seed.leadTimeDays,
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true
      }
    });

    for (const categoryCode of seed.categories) {
      supplierByCategory.set(categoryCode, {
        id: supplier.id,
        leadTimeDays: seed.leadTimeDays
      });
    }
  }

  const customers = [];

  for (const [index, seed] of customerSeeds.entries()) {
    const homeStore = storeBundles[index % storeBundles.length]?.store ?? null;
    const customer = await prisma.customer.upsert({
      where: {
        retailOrgId_customerNo: {
          retailOrgId: retailOrg.id,
          customerNo: seed.customerNo
        }
      },
      update: {
        storeId: homeStore?.id ?? null,
        customerType: seed.customerType,
        fullName: seed.fullName,
        phone: seed.phone,
        email: seed.email,
        city: seed.city,
        countryCode: "GH",
        loyaltyEnrolled: true,
        loyaltyTier: seed.loyaltyTier,
        loyaltyPointsBalance: seed.loyaltyPointsBalance,
        allowCreditSales: seed.allowCreditSales,
        creditLimitAmount: seed.creditLimitAmount === null ? null : money(seed.creditLimitAmount),
        receivableBalanceAmount: "0.00",
        note: seed.note,
        status: "ACTIVE",
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        storeId: homeStore?.id ?? null,
        customerNo: seed.customerNo,
        customerType: seed.customerType,
        fullName: seed.fullName,
        phone: seed.phone,
        email: seed.email,
        city: seed.city,
        countryCode: "GH",
        loyaltyEnrolled: true,
        loyaltyTier: seed.loyaltyTier,
        loyaltyPointsBalance: seed.loyaltyPointsBalance,
        allowCreditSales: seed.allowCreditSales,
        creditLimitAmount: seed.creditLimitAmount === null ? null : money(seed.creditLimitAmount),
        receivableBalanceAmount: "0.00",
        note: seed.note,
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true,
        customerNo: true,
        customerType: true,
        fullName: true,
        phone: true,
        email: true,
        addressLine1: true,
        city: true,
        countryCode: true,
        loyaltyEnrolled: true,
        loyaltyTier: true,
        loyaltyPointsBalance: true,
        allowCreditSales: true,
        creditLimitAmount: true,
        receivableBalanceAmount: true,
        note: true,
        status: true,
        store: {
          select: {
            code: true,
            name: true
          }
        }
      }
    });
    customers.push(customer);
  }

  const products = [];
  let variantBarcodeIndex = 1;

  for (const seed of matrixProducts) {
    const lowestPrice = Math.min(...seed.variants.map((variant) => variant.price));
    const lowestCost = Math.min(...seed.variants.map((variant) => variant.cost));
    const product = await prisma.product.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: seed.code
        }
      },
      update: {
        taxProfileId: taxProfile.id,
        baseUnitOfMeasureId: eachUnit.id,
        code: seed.code,
        sku: seed.code,
        name: seed.name,
        description: seed.description,
        productType: "MATRIX",
        department: categoryDepartment(seed.category),
        category: seed.category,
        subcategory: seed.subcategory,
        brand: seed.brand,
        unitOfMeasure: "EA",
        taxable: true,
        trackInventory: true,
        isSerialized: false,
        trackSize: seed.attributes.includes("SIZE") || seed.attributes.includes("WAIST") || seed.attributes.includes("KIDS_SIZE") || seed.attributes.includes("SHOE_SIZE"),
        trackColor: seed.attributes.includes("COLOR"),
        baseUnitPrice: money(lowestPrice),
        baseCostPrice: money(lowestCost),
        minStockLevel: "5.000",
        reorderPoint: "10.000",
        reorderQuantity: "24.000",
        safetyStockLevel: "8.000",
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        taxProfileId: taxProfile.id,
        baseUnitOfMeasureId: eachUnit.id,
        code: seed.code,
        sku: seed.code,
        name: seed.name,
        description: seed.description,
        productType: "MATRIX",
        department: categoryDepartment(seed.category),
        category: seed.category,
        subcategory: seed.subcategory,
        brand: seed.brand,
        unitOfMeasure: "EA",
        taxable: true,
        trackInventory: true,
        isSerialized: false,
        trackSize: seed.attributes.includes("SIZE") || seed.attributes.includes("WAIST") || seed.attributes.includes("KIDS_SIZE") || seed.attributes.includes("SHOE_SIZE"),
        trackColor: seed.attributes.includes("COLOR"),
        baseUnitPrice: money(lowestPrice),
        baseCostPrice: money(lowestCost),
        minStockLevel: "5.000",
        reorderPoint: "10.000",
        reorderQuantity: "24.000",
        safetyStockLevel: "8.000",
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true,
        code: true,
        sku: true,
        name: true,
        productType: true,
        description: true,
        shortName: true,
        department: true,
        category: true,
        subcategory: true,
        brand: true,
        unitOfMeasure: true,
        taxable: true,
        trackInventory: true,
        isSerialized: true,
        trackSize: true,
        trackColor: true,
        allowPriceOverride: true,
        mustEnterPriceAtPos: true,
        minStockLevel: true,
        reorderPoint: true,
        reorderQuantity: true,
        safetyStockLevel: true,
        baseUnitPrice: true,
        baseCostPrice: true,
        updatedAt: true
      }
    });
    const attributeIds = [];

    for (const [index, attributeCode] of seed.attributes.entries()) {
      const attribute = attributeByCode.get(attributeCode);

      if (!attribute) {
        throw new Error(`Missing attribute ${attributeCode}.`);
      }

      attributeIds.push(attribute.id);
      await prisma.productMatrixAttribute.upsert({
        where: {
          productId_attributeId: {
            productId: product.id,
            attributeId: attribute.id
          }
        },
        update: {
          sortOrder: index + 1,
          isRequired: true
        },
        create: {
          productId: product.id,
          attributeId: attribute.id,
          sortOrder: index + 1,
          isRequired: true
        }
      });
    }

    await prisma.productMatrixAttribute.deleteMany({
      where: {
        productId: product.id,
        attributeId: {
          notIn: attributeIds
        }
      }
    });

    const activeVariantCodes = [];
    const variants = [];

    for (const [index, variantSeed] of seed.variants.entries()) {
      const variantCode = code(variantSeed.sku);
      const variantBarcode = barcodeFor(variantBarcodeIndex++);
      activeVariantCodes.push(variantCode);
      const variant = await prisma.productMatrixVariant.upsert({
        where: {
          retailOrgId_code: {
            retailOrgId: retailOrg.id,
            code: variantCode
          }
        },
        update: {
          productId: product.id,
          sku: variantCode,
          displayName: variantLabel(variantSeed, seed.attributes),
          unitPrice: money(variantSeed.price),
          costPrice: money(variantSeed.cost),
          quantityOnHand: quantity(variantSeed.stock),
          barcode: variantBarcode,
          status: "ACTIVE",
          sortOrder: index + 1
        },
        create: {
          retailOrgId: retailOrg.id,
          productId: product.id,
          code: variantCode,
          sku: variantCode,
          displayName: variantLabel(variantSeed, seed.attributes),
          unitPrice: money(variantSeed.price),
          costPrice: money(variantSeed.cost),
          quantityOnHand: quantity(variantSeed.stock),
          barcode: variantBarcode,
          status: "ACTIVE",
          sortOrder: index + 1
        },
        select: {
          id: true,
          code: true,
          sku: true,
          displayName: true,
          unitPrice: true,
          quantityOnHand: true,
          barcode: true,
          status: true,
          sortOrder: true
        }
      });

      await prisma.barcode.upsert({
        where: {
          code: variantBarcode
        },
        update: {
          productId: product.id,
          productVariantId: variant.id,
          barcodeType: "EAN13"
        },
        create: {
          productId: product.id,
          productVariantId: variant.id,
          code: variantBarcode,
          barcodeType: "EAN13"
        }
      });

      for (const [sortOrder, attributeCode] of seed.attributes.entries()) {
        const valueCode = variantSeed.attributes[attributeCode];
        const attribute = attributeByCode.get(attributeCode);
        const attributeValue = valueCode ? attributeValueByKey.get(`${attributeCode}:${valueCode}`) : null;

        if (!attribute || !attributeValue) {
          throw new Error(`Missing ${attributeCode} value ${valueCode ?? ""} for ${variantCode}.`);
        }

        await prisma.productMatrixVariantValue.upsert({
          where: {
            variantId_attributeId: {
              variantId: variant.id,
              attributeId: attribute.id
            }
          },
          update: {
            attributeValueId: attributeValue.id,
            valueLabelSnapshot: attributeValue.label,
            sortOrder: sortOrder + 1
          },
          create: {
            variantId: variant.id,
            attributeId: attribute.id,
            attributeValueId: attributeValue.id,
            valueLabelSnapshot: attributeValue.label,
            sortOrder: sortOrder + 1
          }
        });
      }

      await prisma.productMatrixVariantValue.deleteMany({
        where: {
          variantId: variant.id,
          attributeId: {
            notIn: attributeIds
          }
        }
      });

      variants.push({
        ...variant,
        seed: variantSeed,
        attributes: seed.attributes.map((attributeCode) => {
          const attribute = attributeByCode.get(attributeCode);
          const valueCode = variantSeed.attributes[attributeCode];
          const attributeValue = valueCode ? attributeValueByKey.get(`${attributeCode}:${valueCode}`) : null;

          if (!attribute || !attributeValue) {
            throw new Error(`Missing ${attributeCode} value ${valueCode ?? ""} for ${variantCode}.`);
          }

          return {
            attributeCode,
            attributeName: attribute.name,
            valueCode: attributeValue.code,
            valueLabel: attributeValue.label
          };
        })
      });
    }

    await prisma.productMatrixVariant.updateMany({
      where: {
        productId: product.id,
        code: {
          notIn: activeVariantCodes
        }
      },
      data: {
        status: "ARCHIVED",
        quantityOnHand: "0.000"
      }
    });

    await prisma.priceListEntry.upsert({
      where: {
        priceListId_productId: {
          priceListId: priceList.id,
          productId: product.id
        }
      },
      update: {
        unitPrice: money(lowestPrice)
      },
      create: {
        priceListId: priceList.id,
        productId: product.id,
        unitPrice: money(lowestPrice)
      }
    });

    const supplier = supplierByCategory.get(seed.category);

    if (supplier) {
      await prisma.productSupplier.upsert({
        where: {
          productId_supplierId: {
            productId: product.id,
            supplierId: supplier.id
          }
        },
        update: {
          packCostPrice: money(lowestCost),
          leadTimeDays: supplier.leadTimeDays,
          minimumOrderQuantity: "6.000",
          isPrimary: true
        },
        create: {
          productId: product.id,
          supplierId: supplier.id,
          supplierSku: product.code,
          supplierProductName: product.name,
          packCostPrice: money(lowestCost),
          leadTimeDays: supplier.leadTimeDays,
          minimumOrderQuantity: "6.000",
          isPrimary: true
        }
      });
    }

    products.push({
      product,
      variants,
      standardStock: 0,
      unitPrice: lowestPrice
    });
  }

  for (const seed of standardProducts) {
    const product = await prisma.product.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: retailOrg.id,
          code: seed.code
        }
      },
      update: {
        taxProfileId: taxProfile.id,
        baseUnitOfMeasureId: eachUnit.id,
        sku: seed.code,
        name: seed.name,
        description: seed.description,
        productType: "STOCK",
        department: categoryDepartment(seed.category),
        category: seed.category,
        subcategory: seed.subcategory,
        brand: seed.brand,
        unitOfMeasure: "EA",
        taxable: true,
        trackInventory: true,
        isSerialized: false,
        trackSize: false,
        trackColor: false,
        baseUnitPrice: money(seed.price),
        baseCostPrice: money(seed.cost),
        minStockLevel: "8.000",
        reorderPoint: "16.000",
        reorderQuantity: "48.000",
        safetyStockLevel: "12.000",
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      create: {
        retailOrgId: retailOrg.id,
        taxProfileId: taxProfile.id,
        baseUnitOfMeasureId: eachUnit.id,
        code: seed.code,
        sku: seed.code,
        name: seed.name,
        description: seed.description,
        productType: "STOCK",
        department: categoryDepartment(seed.category),
        category: seed.category,
        subcategory: seed.subcategory,
        brand: seed.brand,
        unitOfMeasure: "EA",
        taxable: true,
        trackInventory: true,
        isSerialized: false,
        trackSize: false,
        trackColor: false,
        baseUnitPrice: money(seed.price),
        baseCostPrice: money(seed.cost),
        minStockLevel: "8.000",
        reorderPoint: "16.000",
        reorderQuantity: "48.000",
        safetyStockLevel: "12.000",
        status: "ACTIVE",
        originNodeCode: enterpriseNode.code,
        lastModifiedByNodeCode: enterpriseNode.code
      },
      select: {
        id: true,
        code: true,
        sku: true,
        name: true,
        productType: true,
        description: true,
        shortName: true,
        department: true,
        category: true,
        subcategory: true,
        brand: true,
        unitOfMeasure: true,
        taxable: true,
        trackInventory: true,
        isSerialized: true,
        trackSize: true,
        trackColor: true,
        allowPriceOverride: true,
        mustEnterPriceAtPos: true,
        minStockLevel: true,
        reorderPoint: true,
        reorderQuantity: true,
        safetyStockLevel: true,
        baseUnitPrice: true,
        baseCostPrice: true,
        updatedAt: true
      }
    });

    await prisma.productMatrixVariant.updateMany({
      where: {
        productId: product.id
      },
      data: {
        status: "ARCHIVED",
        quantityOnHand: "0.000"
      }
    });

    await prisma.barcode.upsert({
      where: {
        code: seed.barcode
      },
      update: {
        productId: product.id,
        productVariantId: null,
        barcodeType: "EAN13"
      },
      create: {
        productId: product.id,
        productVariantId: null,
        code: seed.barcode,
        barcodeType: "EAN13"
      }
    });

    await prisma.priceListEntry.upsert({
      where: {
        priceListId_productId: {
          priceListId: priceList.id,
          productId: product.id
        }
      },
      update: {
        unitPrice: money(seed.price)
      },
      create: {
        priceListId: priceList.id,
        productId: product.id,
        unitPrice: money(seed.price)
      }
    });

    const supplier = supplierByCategory.get(seed.category);

    if (supplier) {
      await prisma.productSupplier.upsert({
        where: {
          productId_supplierId: {
            productId: product.id,
            supplierId: supplier.id
          }
        },
        update: {
          packCostPrice: money(seed.cost),
          leadTimeDays: supplier.leadTimeDays,
          minimumOrderQuantity: "12.000",
          isPrimary: true
        },
        create: {
          productId: product.id,
          supplierId: supplier.id,
          supplierSku: product.code,
          supplierProductName: product.name,
          packCostPrice: money(seed.cost),
          leadTimeDays: supplier.leadTimeDays,
          minimumOrderQuantity: "12.000",
          isPrimary: true
        }
      });
    }

    products.push({
      product,
      variants: [],
      standardStock: seed.stock,
      unitPrice: seed.price
    });
  }

  await prisma.inventoryLedgerEntry.deleteMany({
    where: {
      retailOrgId: retailOrg.id,
      referenceType: "clothing-seed",
      sourceNodeCode: enterpriseNode.code
    }
  });

  const storeQuantityByProduct = new Map<string, Map<string, number>>();

  for (const item of products) {
    for (const bundle of storeBundles) {
      if (!storeQuantityByProduct.has(bundle.store.id)) {
        storeQuantityByProduct.set(bundle.store.id, new Map());
      }
      storeQuantityByProduct.get(bundle.store.id)?.set(item.product.id, 0);
    }

    if (item.variants.length > 0) {
      for (const variant of item.variants) {
        const distribution = distribute(variant.seed.stock, storeBundles.length);

        for (const [index, bundle] of storeBundles.entries()) {
          const storeQuantity = distribution[index] ?? 0;

          if (storeQuantity <= 0) {
            continue;
          }

          const storeQuantities = storeQuantityByProduct.get(bundle.store.id);
          storeQuantities?.set(item.product.id, (storeQuantities.get(item.product.id) ?? 0) + storeQuantity);

          await prisma.inventoryLedgerEntry.create({
            data: {
              retailOrgId: retailOrg.id,
              storeId: bundle.store.id,
              warehouseId: bundle.warehouse.id,
              inventoryLocationId: bundle.salesLocation.id,
              productId: item.product.id,
              productVariantId: variant.id,
              movementType: "OPENING_BALANCE",
              quantity: quantity(storeQuantity),
              unitCost: money(variant.seed.cost),
              referenceType: "clothing-seed",
              referenceId: `clothing-opening-${bundle.store.code}-${variant.code}`,
              externalReference: variant.code,
              sourceNodeCode: enterpriseNode.code,
              occurredAt: now
            }
          });
        }
      }
    } else {
      const distribution = distribute(item.standardStock, storeBundles.length);

      for (const [index, bundle] of storeBundles.entries()) {
        const storeQuantity = distribution[index] ?? 0;

        if (storeQuantity <= 0) {
          continue;
        }

        const storeQuantities = storeQuantityByProduct.get(bundle.store.id);
        storeQuantities?.set(item.product.id, (storeQuantities.get(item.product.id) ?? 0) + storeQuantity);

        await prisma.inventoryLedgerEntry.create({
          data: {
            retailOrgId: retailOrg.id,
            storeId: bundle.store.id,
            warehouseId: bundle.warehouse.id,
            inventoryLocationId: bundle.salesLocation.id,
            productId: item.product.id,
            movementType: "OPENING_BALANCE",
            quantity: quantity(storeQuantity),
            unitCost: money(Number(item.product.baseCostPrice ?? 0)),
            referenceType: "clothing-seed",
            referenceId: `clothing-opening-${bundle.store.code}-${item.product.code}`,
            externalReference: item.product.code,
            sourceNodeCode: enterpriseNode.code,
            occurredAt: now
          }
        });
      }
    }
  }

  const catalog = await prisma.inventoryCatalog.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: retailOrg.id,
        code: "CLOTHING-CORE"
      }
    },
    update: {
      name: "Clothing Core Assortment",
      description: "Seeded clothing assortment with matrix products and accessories.",
      status: "ACTIVE",
      lastModifiedByNodeCode: enterpriseNode.code
    },
    create: {
      retailOrgId: retailOrg.id,
      code: "CLOTHING-CORE",
      name: "Clothing Core Assortment",
      description: "Seeded clothing assortment with matrix products and accessories.",
      status: "ACTIVE",
      originNodeCode: enterpriseNode.code,
      lastModifiedByNodeCode: enterpriseNode.code
    }
  });

  for (const [index, item] of products.entries()) {
    await prisma.inventoryCatalogProduct.upsert({
      where: {
        catalogId_productId: {
          catalogId: catalog.id,
          productId: item.product.id
        }
      },
      update: {
        sortOrder: index + 1
      },
      create: {
        retailOrgId: retailOrg.id,
        catalogId: catalog.id,
        productId: item.product.id,
        sortOrder: index + 1
      }
    });
  }

  for (const bundle of storeBundles) {
    await prisma.inventoryCatalogStore.upsert({
      where: {
        catalogId_storeId: {
          catalogId: catalog.id,
          storeId: bundle.store.id
        }
      },
      update: {},
      create: {
        retailOrgId: retailOrg.id,
        catalogId: catalog.id,
        storeId: bundle.store.id
      }
    });
  }

  for (const bundle of storeBundles) {
    for (const tenderMethod of tenderMethodsForPublication) {
      await upsertOutboxEvent({
        syncNodeId: enterpriseNode.id,
        targetNodeCode: bundle.syncNode.code,
        aggregateType: "tenderMethod",
        aggregateId: tenderMethod.id,
        eventType: "setup.tender-method.published",
        idempotencyKey: `clothing-seed:${bundle.syncNode.code}:tender:${tenderMethod.code}`,
        payload: {
          storeCode: bundle.store.code,
          tenderMethodCode: tenderMethod.code,
          tenderMethodName: tenderMethod.name,
          paymentMethod: tenderMethod.paymentMethod,
          gatewayProvider: tenderMethod.gatewayProvider,
          gatewayMode: tenderMethod.gatewayMode,
          gatewayMerchantId: tenderMethod.gatewayMerchantId,
          gatewayPublicKey: tenderMethod.gatewayPublicKey,
          gatewayCallbackUrl: tenderMethod.gatewayCallbackUrl,
          gatewayActive: tenderMethod.gatewayActive,
          gatewayStatus: tenderMethod.gatewayStatus,
          description: tenderMethod.description,
          requiresReference: tenderMethod.requiresReference,
          allowChange: tenderMethod.allowChange,
          allowRefund: tenderMethod.allowRefund,
          allowOpenCashDrawer: tenderMethod.allowOpenCashDrawer,
          status: tenderMethod.status,
          sortOrder: tenderMethod.sortOrder,
          publishedAt: now.toISOString()
        }
      });
    }

    for (const bankAccount of bankAccounts) {
      await upsertOutboxEvent({
        syncNodeId: enterpriseNode.id,
        targetNodeCode: bundle.syncNode.code,
        aggregateType: "bankAccount",
        aggregateId: bankAccount.id,
        eventType: "setup.bank-account.published",
        idempotencyKey: `clothing-seed:${bundle.syncNode.code}:bank-account:${bankAccount.id}`,
        payload: {
          storeCode: bundle.store.code,
          bankAccountId: bankAccount.id,
          bankCode: bankAccount.branch.bank.code,
          bankName: bankAccount.branch.bank.name,
          branchCode: bankAccount.branch.code,
          branchName: bankAccount.branch.name,
          accountNumber: bankAccount.accountNumber,
          accountName: bankAccount.accountName,
          currencyCode: bankAccount.currencyCode,
          status:
            bankAccount.status === "ACTIVE" &&
            bankAccount.branch.status === "ACTIVE" &&
            bankAccount.branch.bank.status === "ACTIVE"
              ? "ACTIVE"
              : "INACTIVE",
          publishedAt: now.toISOString()
        }
      });
    }

    for (const customer of customers) {
      await upsertOutboxEvent({
        syncNodeId: enterpriseNode.id,
        targetNodeCode: bundle.syncNode.code,
        aggregateType: "customer",
        aggregateId: customer.id,
        eventType: "customer.published",
        idempotencyKey: `clothing-seed:${bundle.syncNode.code}:customer:${customer.customerNo}`,
        payload: {
          storeCode: bundle.store.code,
          customerId: customer.id,
          customerNo: customer.customerNo,
          fullName: customer.fullName,
          customerType: customer.customerType,
          phone: customer.phone,
          email: customer.email,
          addressLine1: customer.addressLine1,
          city: customer.city,
          countryCode: customer.countryCode,
          homeStoreCode: customer.store?.code ?? null,
          homeStoreName: customer.store?.name ?? null,
          loyaltyEnrolled: customer.loyaltyEnrolled,
          loyaltyTier: customer.loyaltyTier,
          loyaltyPointsBalance: customer.loyaltyPointsBalance,
          allowCreditSales: customer.allowCreditSales,
          creditLimitAmount: customer.creditLimitAmount === null ? null : Number(customer.creditLimitAmount),
          receivableBalanceAmount: Number(customer.receivableBalanceAmount),
          note: customer.note,
          status: customer.status,
          publishedAt: now.toISOString()
        }
      });
    }

    for (const department of departmentByCode.values()) {
      await upsertOutboxEvent({
        syncNodeId: enterpriseNode.id,
        targetNodeCode: bundle.syncNode.code,
        aggregateType: "productDepartment",
        aggregateId: department.id,
        eventType: "setup.product-department.published",
        idempotencyKey: `clothing-seed:${bundle.syncNode.code}:department:${department.code}`,
        payload: {
          storeCode: bundle.store.code,
          departmentCode: department.code,
          departmentName: department.name,
          description: department.description,
          status: department.status,
          sortOrder: department.sortOrder,
          publishedAt: now.toISOString()
        }
      });
    }

    for (const category of categoryByCode.values()) {
      await upsertOutboxEvent({
        syncNodeId: enterpriseNode.id,
        targetNodeCode: bundle.syncNode.code,
        aggregateType: "productCategory",
        aggregateId: category.id,
        eventType: "setup.product-category.published",
        idempotencyKey: `clothing-seed:${bundle.syncNode.code}:category:${category.code}`,
        payload: {
          storeCode: bundle.store.code,
          categoryCode: category.code,
          categoryName: category.name,
          departmentCode: category.department.code,
          departmentName: category.department.name,
          description: category.description,
          status: category.status,
          sortOrder: category.sortOrder,
          publishedAt: now.toISOString()
        }
      });
    }

    await upsertOutboxEvent({
      syncNodeId: enterpriseNode.id,
      targetNodeCode: bundle.syncNode.code,
      aggregateType: "inventoryLocation",
      aggregateId: bundle.salesLocation.id,
      eventType: "inventory.location.published",
      idempotencyKey: `clothing-seed:${bundle.syncNode.code}:location:${bundle.salesLocation.code}`,
      payload: {
        storeCode: bundle.store.code,
        locationCode: bundle.salesLocation.code,
        locationName: bundle.salesLocation.name,
        locationType: bundle.salesLocation.locationType,
        status: bundle.salesLocation.status,
        defaults: "Sales default, Sales order default, Receiving default",
        useForSalesDefault: bundle.salesLocation.useForSalesDefault,
        useForSalesOrderDefault: bundle.salesLocation.useForSalesOrderDefault,
        useForReceivingDefault: bundle.salesLocation.useForReceivingDefault,
        warehouseCode: bundle.warehouse.code,
        warehouseName: bundle.warehouse.name,
        publishedAt: now.toISOString()
      }
    });

    for (const item of products) {
      const storeQuantity = storeQuantityByProduct.get(bundle.store.id)?.get(item.product.id) ?? 0;
      const matrixVariants = item.variants.map((variant) => ({
        variantId: variant.id,
        variantCode: variant.code,
        sku: variant.sku,
        displayName: variant.displayName,
        unitPrice: Number(variant.unitPrice),
        quantityOnHand: Number(variant.quantityOnHand),
        barcode: variant.barcode,
        status: variant.status,
        attributes: variant.attributes
      }));

      await upsertOutboxEvent({
        syncNodeId: enterpriseNode.id,
        targetNodeCode: bundle.syncNode.code,
        aggregateType: "product",
        aggregateId: item.product.id,
        eventType: "catalog.product.published",
        idempotencyKey: `clothing-seed:${bundle.syncNode.code}:product:${item.product.code}`,
        payload: {
          storeCode: bundle.store.code,
          productCode: item.product.code,
          productName: item.product.name,
          sku: item.product.sku,
          shortName: item.product.shortName,
          description: item.product.description,
          productType: item.product.productType,
          department: item.product.department,
          category: item.product.category,
          subcategory: item.product.subcategory,
          brand: item.product.brand,
          seasonCode: null,
          unitOfMeasure: item.product.unitOfMeasure,
          baseUnitOfMeasure: "EA",
          uomScheduleCode: null,
          uomScheduleName: null,
          uomScheduleBaseUnit: null,
          uomConversions: [],
          packSize: null,
          countryOfOrigin: "GH",
          primaryImageUrl: null,
          notes: null,
          taxable: item.product.taxable,
          taxProfileCode: taxProfile.code,
          taxProfileName: taxProfile.name,
          taxRatePercent: Number(taxProfile.ratePercent),
          taxInclusive: taxProfile.isTaxInclusive,
          trackInventory: item.product.trackInventory,
          isSerialized: item.product.isSerialized,
          trackSize: item.product.trackSize,
          trackColor: item.product.trackColor,
          allowPriceOverride: item.product.allowPriceOverride,
          mustEnterPriceAtPos: item.product.mustEnterPriceAtPos,
          minStockLevel: item.product.minStockLevel === null ? null : Number(item.product.minStockLevel),
          reorderPoint: item.product.reorderPoint === null ? null : Number(item.product.reorderPoint),
          reorderQuantity: item.product.reorderQuantity === null ? null : Number(item.product.reorderQuantity),
          safetyStockLevel: item.product.safetyStockLevel === null ? null : Number(item.product.safetyStockLevel),
          shelfLifeDays: null,
          weightKg: null,
          volumeLitres: null,
          unitPrice: item.unitPrice,
          quantityOnHand: storeQuantity,
          catalogSortOrder: products.findIndex((product) => product.product.id === item.product.id) + 1,
          matrixVariants,
          publishedAt: now.toISOString()
        }
      });
    }
  }

  console.log("Seeded clothing catalog data.");
  console.log(`Retail org: ${retailOrg.name} (${retailOrg.code})`);
  console.log(`Stores prepared: ${storeBundles.length}`);
  console.log(`Customers: ${customers.length}`);
  console.log(`Tender methods: ${tenderMethods.length}`);
  console.log(`Archived tender methods: ${obsoleteTenderMethods.length}`);
  console.log(`Bank accounts: ${bankAccounts.length}`);
  console.log(`Matrix products: ${matrixProducts.length}`);
  console.log(`Matrix variants: ${matrixProducts.reduce((sum, product) => sum + product.variants.length, 0)}`);
  console.log(`Standard products: ${standardProducts.length}`);
  console.log(`Catalog: CLOTHING-CORE`);
  console.log(`Pending sync publications refreshed: ${storeBundles.length} store node(s)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

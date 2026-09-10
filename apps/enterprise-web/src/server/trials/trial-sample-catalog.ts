export const trialBusinessTypes = [
  "RETAIL",
  "SUPERMARKET_GROCERY",
  "WHOLESALE_DISTRIBUTION",
  "PHARMACY_HEALTH",
  "FASHION",
  "FUEL_STATION",
  "HOSPITALITY",
  "OTHER",
] as const;

export type TrialBusinessType = (typeof trialBusinessTypes)[number];

type TrialSampleProductDefinition = {
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  brand: string;
  unitCode?: "EA" | "L";
};

export type TrialSampleProduct = TrialSampleProductDefinition & {
  code: string;
  sku: string;
  barcode: string;
  sortOrder: number;
};

type ProductTuple = readonly [
  name: string,
  category: string,
  price: number,
  stock: number,
  brand: string,
  unitCode?: "EA" | "L",
];

const productTuples: Record<TrialBusinessType, readonly ProductTuple[]> = {
  RETAIL: [
    ["Wireless Bluetooth Headphones", "Electronics", 245, 36, "SoundWave"],
    ["USB-C Fast Charger 25W", "Electronics", 95, 50, "VoltEdge"],
    ["10,000mAh Power Bank", "Electronics", 185, 42, "PowerGo"],
    ["LED Desk Lamp", "Home & Office", 135, 34, "BrightHome"],
    ["Stainless Steel Water Bottle", "Home & Office", 78, 60, "DailyLiving"],
    ["A5 Hardcover Notebook", "Stationery", 32, 80, "NoteCraft"],
    ["Ballpoint Pen 10 Pack", "Stationery", 25, 100, "WriteWell"],
    ["Scientific Calculator", "Stationery", 88, 35, "StudyPro"],
    ["Microfiber Bath Towel", "Home & Office", 72, 48, "SoftNest"],
    ["Electric Kettle 1.7L", "Home Appliances", 210, 28, "HomeEase"],
    ["Non-Stick Frying Pan 28cm", "Home Appliances", 165, 30, "CookRight"],
    ["Storage Container Set", "Home Appliances", 120, 40, "FreshKeep"],
    ["Unisex Digital Wristwatch", "Accessories", 150, 32, "UrbanTime"],
    ["Classic Sunglasses", "Accessories", 85, 45, "SunStreet"],
    ["Compact Travel Umbrella", "Accessories", 70, 55, "RainReady"],
    ["Body Lotion 400ml", "Personal Care", 58, 64, "PureGlow"],
    ["Shower Gel 500ml", "Personal Care", 48, 70, "FreshDay"],
    ["Hair Clipper Set", "Personal Care", 260, 24, "TrimPro"],
    ["Extension Board 4-Way", "Electronics", 110, 40, "SafePlug"],
    ["Rechargeable Emergency Lamp", "Home Appliances", 195, 26, "BrightHome"],
  ],
  SUPERMARKET_GROCERY: [
    ["Premium Jasmine Rice 5kg", "Pantry", 155, 45, "Harvest Gold"],
    ["Vegetable Cooking Oil 1L", "Pantry", 42, 80, "Kitchen Choice"],
    ["Tomato Paste 400g", "Pantry", 24, 95, "Red Garden"],
    ["Spaghetti 500g", "Pantry", 18, 110, "Bella Pasta"],
    ["Evaporated Milk 400g", "Breakfast", 22, 100, "Morning Farm"],
    ["Corn Flakes 500g", "Breakfast", 65, 55, "Sunrise"],
    ["Chocolate Drink 400g", "Breakfast", 58, 60, "Cocoa Plus"],
    ["White Sugar 1kg", "Pantry", 26, 90, "Sweet Cane"],
    ["Mineral Water 1.5L", "Beverages", 8, 160, "Clear Spring"],
    ["Orange Juice 1L", "Beverages", 28, 75, "Fruit Valley"],
    ["Cola Soft Drink 500ml", "Beverages", 12, 140, "FizzUp"],
    ["Malted Drink 330ml", "Beverages", 15, 120, "Malt House"],
    ["Cream Crackers 200g", "Snacks", 20, 90, "Crisp Bite"],
    ["Potato Crisps 150g", "Snacks", 30, 70, "Crunch Time"],
    ["Milk Chocolate Bar 100g", "Snacks", 25, 85, "Cocoa Treat"],
    ["Laundry Detergent 1kg", "Household", 48, 65, "CleanBright"],
    ["Dishwashing Liquid 750ml", "Household", 32, 70, "Sparkle"],
    ["Toilet Tissue 10 Pack", "Household", 55, 60, "SoftCare"],
    ["Bathing Soap 4 Pack", "Personal Care", 38, 80, "FreshCare"],
    ["Toothpaste 140g", "Personal Care", 25, 90, "BrightSmile"],
  ],
  WHOLESALE_DISTRIBUTION: [
    ["Jasmine Rice 5kg Case of 4", "Food Cases", 580, 30, "Harvest Gold"],
    ["Cooking Oil 1L Case of 12", "Food Cases", 470, 35, "Kitchen Choice"],
    ["Tomato Paste 400g Case of 24", "Food Cases", 525, 40, "Red Garden"],
    ["Spaghetti 500g Case of 20", "Food Cases", 330, 45, "Bella Pasta"],
    ["Evaporated Milk Case of 24", "Food Cases", 490, 40, "Morning Farm"],
    ["Mineral Water 1.5L Pack of 12", "Beverage Cases", 82, 70, "Clear Spring"],
    ["Cola 500ml Crate of 24", "Beverage Cases", 265, 60, "FizzUp"],
    ["Orange Juice 1L Case of 12", "Beverage Cases", 315, 35, "Fruit Valley"],
    ["Malted Drink Crate of 24", "Beverage Cases", 330, 45, "Malt House"],
    ["Energy Drink Case of 24", "Beverage Cases", 450, 38, "Active Rush"],
    ["Laundry Detergent 1kg Case of 12", "Household Cases", 540, 32, "CleanBright"],
    ["Dishwashing Liquid Case of 12", "Household Cases", 350, 36, "Sparkle"],
    ["Toilet Tissue 10 Pack Bale", "Household Cases", 510, 30, "SoftCare"],
    ["Bathing Soap Case of 48", "Personal Care Cases", 420, 40, "FreshCare"],
    ["Toothpaste Case of 24", "Personal Care Cases", 560, 34, "BrightSmile"],
    ["A4 Copy Paper Carton", "Office Supplies", 385, 28, "OfficePro"],
    ["Ballpoint Pens Box of 50", "Office Supplies", 95, 50, "WriteWell"],
    ["Disposable Cups Carton", "Catering Supplies", 220, 42, "ServeRight"],
    ["Food Takeaway Packs Carton", "Catering Supplies", 310, 36, "PackFresh"],
    ["Black Refuse Bags Bale", "Household Cases", 275, 38, "CleanHome"],
  ],
  PHARMACY_HEALTH: [
    ["Paracetamol 500mg 20 Tablets", "Pain Relief", 18, 90, "WellCare"],
    ["Ibuprofen 200mg 20 Tablets", "Pain Relief", 24, 75, "HealthFirst"],
    ["Oral Rehydration Salts 10 Sachets", "First Aid", 22, 80, "Rehydrate"],
    ["Vitamin C 1000mg 20 Tablets", "Vitamins", 48, 60, "VitaPlus"],
    ["Daily Multivitamin 30 Tablets", "Vitamins", 75, 50, "VitaPlus"],
    ["Zinc 20mg 30 Tablets", "Vitamins", 42, 55, "VitaPlus"],
    ["Digital Thermometer", "Health Devices", 55, 45, "MediCheck"],
    ["Automatic Blood Pressure Monitor", "Health Devices", 420, 20, "MediCheck"],
    ["First Aid Kit", "First Aid", 145, 30, "SafeAid"],
    ["Adhesive Plasters 40 Pack", "First Aid", 28, 70, "SafeAid"],
    ["Antiseptic Liquid 500ml", "First Aid", 65, 60, "CleanGuard"],
    ["Hand Sanitizer 500ml", "Personal Care", 38, 75, "CleanGuard"],
    ["Disposable Face Masks 50 Pack", "Personal Care", 52, 65, "MediSafe"],
    ["Cotton Wool 200g", "Personal Care", 25, 70, "SoftMed"],
    ["Baby Diapers Medium 40 Pack", "Mother & Baby", 135, 38, "LittleCare"],
    ["Baby Wipes 80 Pack", "Mother & Baby", 32, 60, "LittleCare"],
    ["Pregnancy Test Kit", "Women Health", 20, 85, "SureCheck"],
    ["Cough Syrup 100ml", "Cold & Flu", 42, 55, "WellCare"],
    ["Saline Nasal Spray 30ml", "Cold & Flu", 35, 50, "BreatheWell"],
    ["Glucose Test Strips 50 Pack", "Health Devices", 155, 28, "MediCheck"],
  ],
  FASHION: [
    ["Classic Crew Neck T-Shirt", "Tops", 85, 48, "Urban Thread"],
    ["Premium Polo Shirt", "Tops", 135, 42, "Urban Thread"],
    ["Long Sleeve Oxford Shirt", "Tops", 185, 34, "City Form"],
    ["Slim Fit Denim Jeans", "Bottoms", 210, 36, "Blue Street"],
    ["Chino Trousers", "Bottoms", 195, 32, "City Form"],
    ["Casual Shorts", "Bottoms", 120, 40, "Weekend Co"],
    ["Floral Midi Dress", "Dresses", 245, 30, "Bloom Style"],
    ["Wrap Office Dress", "Dresses", 265, 28, "Form & Grace"],
    ["Denim Jacket", "Outerwear", 295, 24, "Blue Street"],
    ["Lightweight Hoodie", "Outerwear", 225, 30, "Urban Thread"],
    ["Everyday Sneakers", "Footwear", 280, 26, "StepOne"],
    ["Leather Office Shoes", "Footwear", 360, 22, "Formal Step"],
    ["Comfort Sandals", "Footwear", 145, 34, "StepOne"],
    ["Structured Handbag", "Accessories", 230, 25, "Mode Carry"],
    ["Canvas Backpack", "Accessories", 190, 30, "Route Pack"],
    ["Leather Belt", "Accessories", 95, 42, "Formal Step"],
    ["Classic Wristwatch", "Accessories", 210, 28, "UrbanTime"],
    ["Fashion Sunglasses", "Accessories", 90, 40, "SunStreet"],
    ["Cotton Baseball Cap", "Accessories", 70, 45, "Weekend Co"],
    ["Patterned Scarf", "Accessories", 65, 44, "Bloom Style"],
  ],
  FUEL_STATION: [
    ["Premium Petrol", "Fuel", 15.5, 1200, "Flash Fuels", "L"],
    ["Regular Petrol", "Fuel", 14.8, 1400, "Flash Fuels", "L"],
    ["Automotive Diesel", "Fuel", 15.2, 1500, "Flash Fuels", "L"],
    ["Kerosene", "Fuel", 13.5, 700, "Flash Fuels", "L"],
    ["Engine Oil 5W-30 4L", "Lubricants", 285, 35, "DriveGuard"],
    ["Engine Oil 20W-50 4L", "Lubricants", 245, 38, "DriveGuard"],
    ["Automatic Transmission Fluid 1L", "Lubricants", 95, 45, "DriveGuard"],
    ["Brake Fluid 500ml", "Vehicle Care", 48, 60, "AutoSafe"],
    ["Coolant 1L", "Vehicle Care", 55, 55, "AutoSafe"],
    ["Windscreen Washer Fluid 1L", "Vehicle Care", 32, 65, "ClearView"],
    ["Car Shampoo 1L", "Vehicle Care", 58, 50, "ShineRide"],
    ["Microfiber Car Cloth 3 Pack", "Vehicle Care", 42, 55, "ShineRide"],
    ["Tyre Inflator", "Vehicle Accessories", 260, 20, "RoadReady"],
    ["Emergency Warning Triangle", "Vehicle Accessories", 75, 32, "RoadReady"],
    ["USB Car Charger", "Vehicle Accessories", 65, 40, "VoltEdge"],
    ["Mineral Water 1.5L", "Convenience", 8, 120, "Clear Spring"],
    ["Energy Drink 330ml", "Convenience", 18, 90, "Active Rush"],
    ["Potato Crisps 150g", "Convenience", 30, 75, "Crunch Time"],
    ["Mint Chewing Gum", "Convenience", 10, 110, "FreshMint"],
    ["Facial Tissue Box", "Convenience", 22, 70, "SoftCare"],
  ],
  HOSPITALITY: [
    ["Bottled Water 500ml", "Beverages", 6, 160, "Clear Spring"],
    ["Orange Juice 300ml", "Beverages", 15, 100, "Fruit Valley"],
    ["Cola Soft Drink 330ml", "Beverages", 12, 120, "FizzUp"],
    ["Malted Drink 330ml", "Beverages", 15, 100, "Malt House"],
    ["Ground Coffee 500g", "Hot Beverages", 85, 40, "Roast House"],
    ["Black Tea 100 Bags", "Hot Beverages", 55, 50, "Highland Tea"],
    ["Hot Chocolate 500g", "Hot Beverages", 72, 42, "Cocoa Treat"],
    ["White Sugar 1kg", "Kitchen Supplies", 26, 80, "Sweet Cane"],
    ["Jasmine Rice 5kg", "Kitchen Supplies", 155, 50, "Harvest Gold"],
    ["Vegetable Cooking Oil 5L", "Kitchen Supplies", 190, 45, "Kitchen Choice"],
    ["Tomato Paste 2.2kg", "Kitchen Supplies", 95, 38, "Red Garden"],
    ["Spaghetti 500g", "Kitchen Supplies", 18, 90, "Bella Pasta"],
    ["Table Napkins 100 Pack", "Guest Supplies", 30, 70, "ServeRight"],
    ["Disposable Cups 50 Pack", "Guest Supplies", 38, 65, "ServeRight"],
    ["Takeaway Food Packs 50 Pack", "Guest Supplies", 75, 55, "PackFresh"],
    ["Guest Bath Soap 50 Pack", "Guest Amenities", 120, 40, "StayFresh"],
    ["Guest Shampoo 50 Pack", "Guest Amenities", 145, 35, "StayFresh"],
    ["White Bath Towel", "Guest Amenities", 85, 36, "SoftNest"],
    ["Laundry Detergent 5kg", "Housekeeping", 210, 32, "CleanBright"],
    ["Multipurpose Cleaner 5L", "Housekeeping", 145, 36, "Sparkle"],
  ],
  OTHER: [
    ["Everyday Notebook", "Office", 30, 70, "NoteCraft"],
    ["Ballpoint Pen 10 Pack", "Office", 25, 90, "WriteWell"],
    ["A4 Copy Paper Ream", "Office", 55, 50, "OfficePro"],
    ["USB Flash Drive 32GB", "Technology", 75, 45, "DataGo"],
    ["USB-C Charging Cable", "Technology", 45, 60, "VoltEdge"],
    ["Wireless Mouse", "Technology", 95, 40, "ClickPro"],
    ["Stainless Steel Water Bottle", "Home", 78, 55, "DailyLiving"],
    ["Storage Container Set", "Home", 120, 38, "FreshKeep"],
    ["LED Desk Lamp", "Home", 135, 32, "BrightHome"],
    ["Bathing Soap 4 Pack", "Personal Care", 38, 70, "FreshCare"],
    ["Body Lotion 400ml", "Personal Care", 58, 60, "PureGlow"],
    ["Hand Sanitizer 500ml", "Personal Care", 38, 65, "CleanGuard"],
    ["Mineral Water 1.5L", "Refreshments", 8, 120, "Clear Spring"],
    ["Orange Juice 1L", "Refreshments", 28, 65, "Fruit Valley"],
    ["Cream Crackers 200g", "Refreshments", 20, 75, "Crisp Bite"],
    ["Laundry Detergent 1kg", "Household", 48, 55, "CleanBright"],
    ["Dishwashing Liquid 750ml", "Household", 32, 60, "Sparkle"],
    ["Toilet Tissue 10 Pack", "Household", 55, 50, "SoftCare"],
    ["Compact Travel Umbrella", "Accessories", 70, 45, "RainReady"],
    ["Canvas Backpack", "Accessories", 190, 28, "Route Pack"],
  ],
};

const businessTypeLabels: Record<TrialBusinessType, string> = {
  RETAIL: "Retail",
  SUPERMARKET_GROCERY: "Supermarket & Grocery",
  WHOLESALE_DISTRIBUTION: "Wholesale & Distribution",
  PHARMACY_HEALTH: "Pharmacy & Health",
  FASHION: "Fashion",
  FUEL_STATION: "Fuel Station",
  HOSPITALITY: "Hospitality",
  OTHER: "General Business",
};

const businessTypeCodes: Record<TrialBusinessType, string> = {
  RETAIL: "RET",
  SUPERMARKET_GROCERY: "GRO",
  WHOLESALE_DISTRIBUTION: "WHO",
  PHARMACY_HEALTH: "PHA",
  FASHION: "FAS",
  FUEL_STATION: "FUE",
  HOSPITALITY: "HOS",
  OTHER: "GEN",
};

export function normalizeTrialBusinessType(value: string | null | undefined): TrialBusinessType {
  const normalized = value?.trim().toUpperCase() ?? "";
  return trialBusinessTypes.includes(normalized as TrialBusinessType)
    ? (normalized as TrialBusinessType)
    : "OTHER";
}

export function trialBusinessTypeLabel(value: string | null | undefined) {
  return businessTypeLabels[normalizeTrialBusinessType(value)];
}

export function trialSampleCatalog(value: string | null | undefined): TrialSampleProduct[] {
  const businessType = normalizeTrialBusinessType(value);
  const tuples = productTuples[businessType];
  if (tuples.length !== 20) {
    throw new Error(`Trial sample catalogue ${businessType} must contain exactly 20 products.`);
  }

  return tuples.map(([name, category, price, stock, brand, unitCode], index) => {
    const sortOrder = index + 1;
    const code = `TRIAL-${String(sortOrder).padStart(3, "0")}`;
    return {
      code,
      sku: code,
      barcode: String(6299000000000 + sortOrder),
      name,
      category,
      price,
      cost: Number((price * 0.62).toFixed(2)),
      stock,
      brand,
      unitCode: unitCode ?? "EA",
      sortOrder,
    };
  });
}

export function trialSampleDepartment(value: string | null | undefined) {
  const businessType = normalizeTrialBusinessType(value);
  return {
    code: `TRIAL-${businessTypeCodes[businessType]}`,
    name: businessTypeLabels[businessType],
  };
}

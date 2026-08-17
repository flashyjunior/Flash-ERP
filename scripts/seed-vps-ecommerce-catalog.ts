import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";

const datasourceUrl = process.env.DATABASE_URL;

if (!datasourceUrl) {
  throw new Error("DATABASE_URL must be set before seeding the VPS ecommerce catalog.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMssql(datasourceUrl)
});

const RETAIL_ORG_CODE = "flash-erp";
const STORE_CODE = "accra-central";
const STOCK_REFERENCE_TYPE = "VPS_ECOMMERCE_CATALOG_SEED";

type ProductSeed = {
  name: string;
  brand: string;
  price: number;
  stock: number;
};

type CategorySeed = {
  code: string;
  name: string;
  products: ProductSeed[];
};

type DepartmentSeed = {
  code: string;
  name: string;
  imageUrl: string;
  categories: CategorySeed[];
};

const catalog: DepartmentSeed[] = [
  {
    code: "ELECTRONICS",
    name: "Electronics",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
    categories: [
      { code: "TELEVISIONS", name: "Televisions", products: [
        { name: "Samsung 43-inch Crystal UHD 4K Smart TV", brand: "Samsung", price: 4999, stock: 18 },
        { name: "LG 50-inch NanoCell 4K Smart TV", brand: "LG", price: 6899, stock: 14 },
        { name: "Hisense 55-inch 4K VIDAA Smart TV", brand: "Hisense", price: 7450, stock: 12 },
        { name: "TCL 65-inch QLED Google TV", brand: "TCL", price: 10999, stock: 8 },
        { name: "Sony 55-inch Bravia 4K Google TV", brand: "Sony", price: 12999, stock: 7 }
      ] },
      { code: "AUDIO", name: "Audio", products: [
        { name: "JBL Charge 5 Portable Bluetooth Speaker", brand: "JBL", price: 1899, stock: 25 },
        { name: "Sony WH-CH720N Wireless Noise Cancelling Headphones", brand: "Sony", price: 2299, stock: 20 },
        { name: "Bose SoundLink Flex Bluetooth Speaker", brand: "Bose", price: 2499, stock: 16 },
        { name: "Samsung HW-B550 Soundbar", brand: "Samsung", price: 2899, stock: 11 },
        { name: "Anker Soundcore Liberty 4 NC Earbuds", brand: "Anker", price: 1299, stock: 28 }
      ] },
      { code: "SMALL-APPLIANCES", name: "Small Appliances", products: [
        { name: "Philips Essential Air Fryer 4.1L", brand: "Philips", price: 1599, stock: 22 },
        { name: "Ninja Foodi Dual Zone Air Fryer", brand: "Ninja", price: 3699, stock: 10 },
        { name: "Kenwood 2L Blender", brand: "Kenwood", price: 799, stock: 30 },
        { name: "Russell Hobbs Digital Microwave 20L", brand: "Russell Hobbs", price: 1450, stock: 15 },
        { name: "Tefal Steam Iron FV1711", brand: "Tefal", price: 499, stock: 34 }
      ] },
      { code: "POWER-AND-HOME", name: "Power and Home", products: [
        { name: "APC Back-UPS 650VA", brand: "APC", price: 1299, stock: 20 },
        { name: "Oraimo Smart Surge Protector 4 Way", brand: "Oraimo", price: 249, stock: 50 },
        { name: "Xiaomi Mi Smart LED Desk Lamp", brand: "Xiaomi", price: 699, stock: 21 },
        { name: "TP-Link Tapo Smart Wi-Fi Plug", brand: "TP-Link", price: 199, stock: 44 },
        { name: "Google Chromecast with Google TV", brand: "Google", price: 999, stock: 18 }
      ] },
      { code: "CAMERAS", name: "Cameras", products: [
        { name: "Canon EOS R50 Mirrorless Camera Kit", brand: "Canon", price: 11999, stock: 6 },
        { name: "Nikon Z30 Creator Kit", brand: "Nikon", price: 9999, stock: 7 },
        { name: "GoPro HERO12 Black", brand: "GoPro", price: 6499, stock: 12 },
        { name: "DJI Osmo Action 4", brand: "DJI", price: 5899, stock: 10 },
        { name: "Ring Video Doorbell 2nd Generation", brand: "Ring", price: 1499, stock: 20 }
      ] }
    ]
  },
  {
    code: "FASHION",
    name: "Fashion",
    imageUrl: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=900&q=80",
    categories: [
      { code: "MENS-CLOTHING", name: "Men's Clothing", products: [
        { name: "Levi's 511 Slim Fit Jeans", brand: "Levi's", price: 799, stock: 35 },
        { name: "Polo Ralph Lauren Classic Fit Polo Shirt", brand: "Polo Ralph Lauren", price: 699, stock: 30 },
        { name: "Tommy Hilfiger Oxford Cotton Shirt", brand: "Tommy Hilfiger", price: 649, stock: 28 },
        { name: "Nike Club Fleece Hoodie", brand: "Nike", price: 849, stock: 25 },
        { name: "Adidas Essentials 3-Stripes Track Pants", brand: "Adidas", price: 599, stock: 32 }
      ] },
      { code: "WOMENS-CLOTHING", name: "Women's Clothing", products: [
        { name: "Zara Satin Effect Midi Dress", brand: "Zara", price: 749, stock: 24 },
        { name: "Mango Linen Blend Blazer", brand: "Mango", price: 899, stock: 20 },
        { name: "H and M Ribbed Knit Cardigan", brand: "H and M", price: 429, stock: 34 },
        { name: "Nike Sportswear Essential T-Shirt", brand: "Nike", price: 349, stock: 40 },
        { name: "Marks and Spencer Wide Leg Trousers", brand: "M and S", price: 649, stock: 26 }
      ] },
      { code: "FOOTWEAR", name: "Footwear", products: [
        { name: "Nike Air Force 1 '07 Sneakers", brand: "Nike", price: 1699, stock: 22 },
        { name: "Adidas Stan Smith Shoes", brand: "Adidas", price: 1399, stock: 25 },
        { name: "Puma RS-X Trainers", brand: "Puma", price: 1299, stock: 19 },
        { name: "Clarks Desert Boot", brand: "Clarks", price: 1199, stock: 16 },
        { name: "Skechers Go Walk Comfort Shoes", brand: "Skechers", price: 999, stock: 24 }
      ] },
      { code: "BAGS-AND-ACCESSORIES", name: "Bags and Accessories", products: [
        { name: "Samsonite Litepoint Laptop Backpack", brand: "Samsonite", price: 1099, stock: 18 },
        { name: "American Tourister Hardside Cabin Case", brand: "American Tourister", price: 1399, stock: 14 },
        { name: "Fossil Leather Bifold Wallet", brand: "Fossil", price: 599, stock: 30 },
        { name: "Ray-Ban Wayfarer Classic Sunglasses", brand: "Ray-Ban", price: 1199, stock: 18 },
        { name: "Casio Vintage Digital Watch", brand: "Casio", price: 449, stock: 40 }
      ] },
      { code: "KIDS-FASHION", name: "Kids Fashion", products: [
        { name: "Nike Kids Air Max Trainers", brand: "Nike", price: 899, stock: 24 },
        { name: "Adidas Kids Logo Hoodie", brand: "Adidas", price: 449, stock: 28 },
        { name: "Carter's Baby Cotton Bodysuit Set", brand: "Carter's", price: 299, stock: 45 },
        { name: "Gap Kids Denim Jacket", brand: "Gap", price: 549, stock: 20 },
        { name: "Crocs Kids Classic Clogs", brand: "Crocs", price: 399, stock: 32 }
      ] }
    ]
  },
  {
    code: "FURNITURE",
    name: "Furniture",
    imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=900&q=80",
    categories: [
      { code: "LIVING-ROOM", name: "Living Room", products: [
        { name: "IKEA KIVIK Three Seat Sofa", brand: "IKEA", price: 8999, stock: 6 },
        { name: "Ashley Furniture Accent Armchair", brand: "Ashley", price: 3499, stock: 10 },
        { name: "Modern Nesting Coffee Table Set", brand: "HomeCraft", price: 1899, stock: 14 },
        { name: "TV Stand with Storage 180cm", brand: "HomeCraft", price: 2799, stock: 12 },
        { name: "Handwoven Area Rug 160 x 230cm", brand: "HomeStyle", price: 1299, stock: 18 }
      ] },
      { code: "BEDROOM", name: "Bedroom", products: [
        { name: "Queen Size Upholstered Bed Frame", brand: "HomeCraft", price: 6499, stock: 8 },
        { name: "Sleepwell Orthopedic Queen Mattress", brand: "Sleepwell", price: 4899, stock: 10 },
        { name: "Six Drawer Wooden Dresser", brand: "HomeCraft", price: 3299, stock: 9 },
        { name: "Two Door Wardrobe with Mirror", brand: "HomeCraft", price: 4599, stock: 7 },
        { name: "Bedside Table with Drawer", brand: "HomeStyle", price: 799, stock: 22 }
      ] },
      { code: "DINING", name: "Dining", products: [
        { name: "Six Seater Solid Wood Dining Set", brand: "HomeCraft", price: 7999, stock: 6 },
        { name: "Round Marble Top Dining Table", brand: "HomeStyle", price: 4999, stock: 8 },
        { name: "Velvet Dining Chair Set of Two", brand: "HomeStyle", price: 1999, stock: 16 },
        { name: "Kitchen Bar Stool Set of Two", brand: "HomeStyle", price: 1599, stock: 18 },
        { name: "Bamboo Serving Trolley", brand: "HomeCraft", price: 1099, stock: 14 }
      ] },
      { code: "OFFICE-FURNITURE", name: "Office Furniture", products: [
        { name: "Ergonomic Mesh Office Chair", brand: "ErgoSeat", price: 2399, stock: 15 },
        { name: "Adjustable Standing Desk 140cm", brand: "WorkSpace", price: 3799, stock: 10 },
        { name: "Mobile Pedestal Filing Cabinet", brand: "WorkSpace", price: 1199, stock: 17 },
        { name: "Bookcase with Five Shelves", brand: "HomeCraft", price: 1499, stock: 18 },
        { name: "Executive Desk with Cable Management", brand: "WorkSpace", price: 4599, stock: 8 }
      ] },
      { code: "OUTDOOR-FURNITURE", name: "Outdoor Furniture", products: [
        { name: "Rattan Patio Conversation Set", brand: "GardenLife", price: 6999, stock: 5 },
        { name: "Outdoor Folding Dining Table", brand: "GardenLife", price: 1699, stock: 12 },
        { name: "Zero Gravity Recliner Chair", brand: "GardenLife", price: 1299, stock: 16 },
        { name: "Cantilever Garden Umbrella", brand: "GardenLife", price: 2199, stock: 10 },
        { name: "Wooden Outdoor Bench", brand: "GardenLife", price: 1799, stock: 11 }
      ] }
    ]
  },
  {
    code: "COMPUTERS",
    name: "Computers",
    imageUrl: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80",
    categories: [
      { code: "LAPTOPS", name: "Laptops", products: [
        { name: "Apple MacBook Air 13-inch M3 8GB 256GB", brand: "Apple", price: 18499, stock: 10 },
        { name: "HP Pavilion 15 Core i5 8GB 512GB SSD", brand: "HP", price: 8999, stock: 16 },
        { name: "Lenovo ThinkPad E14 Gen 5 Core i7", brand: "Lenovo", price: 11299, stock: 12 },
        { name: "Dell Inspiron 15 Core i5 16GB 512GB", brand: "Dell", price: 9799, stock: 14 },
        { name: "ASUS VivoBook 15 Ryzen 5 512GB", brand: "ASUS", price: 8199, stock: 15 }
      ] },
      { code: "DESKTOPS", name: "Desktops", products: [
        { name: "HP ProDesk 400 G9 Desktop Bundle", brand: "HP", price: 10499, stock: 10 },
        { name: "Dell OptiPlex 7010 Core i5 Desktop", brand: "Dell", price: 9999, stock: 11 },
        { name: "Apple Mac mini M2 8GB 256GB", brand: "Apple", price: 11999, stock: 8 },
        { name: "Lenovo IdeaCentre AIO 24-inch", brand: "Lenovo", price: 10499, stock: 9 },
        { name: "ASUS ROG Gaming Desktop Ryzen 7", brand: "ASUS", price: 18499, stock: 6 }
      ] },
      { code: "MONITORS", name: "Monitors", products: [
        { name: "Samsung 27-inch FHD IPS Monitor", brand: "Samsung", price: 2299, stock: 22 },
        { name: "LG 24-inch UltraGear Gaming Monitor", brand: "LG", price: 2599, stock: 18 },
        { name: "Dell P2422H 24-inch USB-C Monitor", brand: "Dell", price: 2799, stock: 15 },
        { name: "AOC 34-inch Curved Ultrawide Monitor", brand: "AOC", price: 5399, stock: 10 },
        { name: "BenQ GW2780 27-inch Eye Care Monitor", brand: "BenQ", price: 2499, stock: 17 }
      ] },
      { code: "COMPUTER-ACCESSORIES", name: "Computer Accessories", products: [
        { name: "Logitech MX Keys S Wireless Keyboard", brand: "Logitech", price: 1599, stock: 24 },
        { name: "Logitech MX Master 3S Mouse", brand: "Logitech", price: 1399, stock: 28 },
        { name: "Samsung T7 1TB Portable SSD", brand: "Samsung", price: 1199, stock: 25 },
        { name: "SanDisk Extreme 1TB Portable SSD", brand: "SanDisk", price: 1099, stock: 24 },
        { name: "HP 65W USB-C Laptop Charger", brand: "HP", price: 499, stock: 38 }
      ] },
      { code: "NETWORKING", name: "Networking", products: [
        { name: "TP-Link Archer AX55 Wi-Fi 6 Router", brand: "TP-Link", price: 1399, stock: 20 },
        { name: "TP-Link Deco X20 Mesh Wi-Fi Two Pack", brand: "TP-Link", price: 2399, stock: 13 },
        { name: "Ubiquiti UniFi U6 Lite Access Point", brand: "Ubiquiti", price: 1799, stock: 14 },
        { name: "D-Link 8 Port Gigabit Switch", brand: "D-Link", price: 399, stock: 30 },
        { name: "APC Essential SurgeArrest 6 Outlet", brand: "APC", price: 299, stock: 35 }
      ] }
    ]
  },
  {
    code: "PHONES",
    name: "Phones",
    imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80",
    categories: [
      { code: "APPLE-PHONES", name: "Apple Phones", products: [
        { name: "Apple iPhone 15 128GB", brand: "Apple", price: 11899, stock: 14 },
        { name: "Apple iPhone 15 Plus 128GB", brand: "Apple", price: 13799, stock: 12 },
        { name: "Apple iPhone 15 Pro 128GB", brand: "Apple", price: 15999, stock: 10 },
        { name: "Apple iPhone 15 Pro Max 256GB", brand: "Apple", price: 19999, stock: 8 },
        { name: "Apple iPhone 14 128GB", brand: "Apple", price: 9899, stock: 16 }
      ] },
      { code: "SAMSUNG-PHONES", name: "Samsung Phones", products: [
        { name: "Samsung Galaxy S24 128GB", brand: "Samsung", price: 10599, stock: 15 },
        { name: "Samsung Galaxy S24 Ultra 256GB", brand: "Samsung", price: 16999, stock: 10 },
        { name: "Samsung Galaxy A55 5G 256GB", brand: "Samsung", price: 6299, stock: 22 },
        { name: "Samsung Galaxy A35 5G 128GB", brand: "Samsung", price: 4799, stock: 25 },
        { name: "Samsung Galaxy Z Flip5 256GB", brand: "Samsung", price: 12799, stock: 7 }
      ] },
      { code: "GOOGLE-PHONES", name: "Google Phones", products: [
        { name: "Google Pixel 8 128GB", brand: "Google", price: 8999, stock: 12 },
        { name: "Google Pixel 8 Pro 128GB", brand: "Google", price: 11999, stock: 9 },
        { name: "Google Pixel 7a 128GB", brand: "Google", price: 5799, stock: 18 },
        { name: "Google Pixel Fold 256GB", brand: "Google", price: 18999, stock: 5 },
        { name: "Google Pixel 8a 128GB", brand: "Google", price: 6999, stock: 16 }
      ] },
      { code: "XIAOMI-PHONES", name: "Xiaomi Phones", products: [
        { name: "Xiaomi 14 256GB", brand: "Xiaomi", price: 9199, stock: 13 },
        { name: "Xiaomi Redmi Note 13 Pro 256GB", brand: "Xiaomi", price: 4199, stock: 25 },
        { name: "Xiaomi Redmi 13C 128GB", brand: "Xiaomi", price: 2199, stock: 35 },
        { name: "POCO X6 Pro 512GB", brand: "POCO", price: 4699, stock: 20 },
        { name: "Xiaomi Redmi A3 64GB", brand: "Xiaomi", price: 1399, stock: 38 }
      ] },
      { code: "OTHER-PHONES", name: "Other Phones", products: [
        { name: "OnePlus 12R 256GB", brand: "OnePlus", price: 8799, stock: 11 },
        { name: "Nothing Phone 2a 256GB", brand: "Nothing", price: 5599, stock: 16 },
        { name: "Tecno Camon 30 Premier 512GB", brand: "Tecno", price: 5299, stock: 20 },
        { name: "Infinix Note 40 Pro 256GB", brand: "Infinix", price: 3699, stock: 24 },
        { name: "Nokia G42 128GB", brand: "Nokia", price: 2499, stock: 22 }
      ] }
    ]
  },
  {
    code: "PHONE-ACCESSORIES",
    name: "Phone Accessories",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
    categories: [
      { code: "CHARGERS", name: "Chargers", products: [
        { name: "Apple 20W USB-C Power Adapter", brand: "Apple", price: 299, stock: 50 },
        { name: "Samsung 25W USB-C Fast Charger", brand: "Samsung", price: 249, stock: 60 },
        { name: "Anker Nano II 65W USB-C Charger", brand: "Anker", price: 599, stock: 35 },
        { name: "Oraimo 45W Super Fast Charger", brand: "Oraimo", price: 199, stock: 70 },
        { name: "Belkin BoostCharge Dual USB-C Charger", brand: "Belkin", price: 699, stock: 26 }
      ] },
      { code: "CABLES", name: "Cables", products: [
        { name: "Anker PowerLine USB-C to USB-C Cable 1.8m", brand: "Anker", price: 169, stock: 80 },
        { name: "Apple USB-C to Lightning Cable 1m", brand: "Apple", price: 229, stock: 65 },
        { name: "Samsung USB-C Data Cable 1m", brand: "Samsung", price: 99, stock: 90 },
        { name: "Belkin Braided USB-C Cable 2m", brand: "Belkin", price: 189, stock: 60 },
        { name: "UGREEN USB-C to HDMI Cable", brand: "UGREEN", price: 299, stock: 42 }
      ] },
      { code: "CASES-AND-PROTECTION", name: "Cases and Protection", products: [
        { name: "Spigen Tough Armor iPhone 15 Case", brand: "Spigen", price: 249, stock: 42 },
        { name: "Samsung Galaxy S24 Clear Case", brand: "Samsung", price: 179, stock: 48 },
        { name: "Nillkin CamShield Redmi Note 13 Case", brand: "Nillkin", price: 159, stock: 54 },
        { name: "Tempered Glass Screen Protector iPhone 15", brand: "Baseus", price: 89, stock: 100 },
        { name: "Privacy Screen Protector Samsung S24", brand: "Baseus", price: 119, stock: 75 }
      ] },
      { code: "POWER-BANKS", name: "Power Banks", products: [
        { name: "Anker PowerCore 10000mAh Power Bank", brand: "Anker", price: 499, stock: 38 },
        { name: "Xiaomi 20000mAh Redmi Power Bank", brand: "Xiaomi", price: 399, stock: 45 },
        { name: "Oraimo 27000mAh Traveller Power Bank", brand: "Oraimo", price: 599, stock: 36 },
        { name: "Baseus 65W 20000mAh Laptop Power Bank", brand: "Baseus", price: 999, stock: 22 },
        { name: "Belkin 10000mAh Magnetic Power Bank", brand: "Belkin", price: 799, stock: 26 }
      ] },
      { code: "AUDIO-ACCESSORIES", name: "Audio Accessories", products: [
        { name: "Apple AirPods Pro 2nd Generation", brand: "Apple", price: 2899, stock: 20 },
        { name: "Samsung Galaxy Buds2 Pro", brand: "Samsung", price: 1999, stock: 24 },
        { name: "JBL Tune 520BT Wireless Headphones", brand: "JBL", price: 599, stock: 38 },
        { name: "Oraimo FreePods 4", brand: "Oraimo", price: 349, stock: 50 },
        { name: "Xiaomi Redmi Buds 5", brand: "Xiaomi", price: 299, stock: 45 }
      ] }
    ]
  },
  {
    code: "HEALTH-BEAUTY",
    name: "Health and Beauty",
    imageUrl: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80",
    categories: [
      { code: "SKINCARE", name: "Skincare", products: [
        { name: "CeraVe Hydrating Facial Cleanser 473ml", brand: "CeraVe", price: 259, stock: 45 },
        { name: "The Ordinary Niacinamide 10 Percent Serum", brand: "The Ordinary", price: 189, stock: 52 },
        { name: "La Roche-Posay Anthelios SPF50 Sunscreen", brand: "La Roche-Posay", price: 329, stock: 36 },
        { name: "Neutrogena Hydro Boost Water Gel", brand: "Neutrogena", price: 239, stock: 40 },
        { name: "Nivea Radiant and Beauty Lotion 400ml", brand: "Nivea", price: 79, stock: 75 }
      ] },
      { code: "HAIRCARE", name: "Haircare", products: [
        { name: "L'Oreal Elvive Dream Lengths Shampoo", brand: "L'Oreal", price: 89, stock: 65 },
        { name: "SheaMoisture Curl and Shine Conditioner", brand: "SheaMoisture", price: 149, stock: 42 },
        { name: "Cantu Shea Butter Leave-In Conditioner", brand: "Cantu", price: 119, stock: 50 },
        { name: "Mielle Rosemary Mint Scalp Oil", brand: "Mielle", price: 169, stock: 38 },
        { name: "ORS Olive Oil Relaxer Kit", brand: "ORS", price: 99, stock: 55 }
      ] },
      { code: "FRAGRANCES", name: "Fragrances", products: [
        { name: "Davidoff Cool Water Eau de Toilette 125ml", brand: "Davidoff", price: 449, stock: 28 },
        { name: "Calvin Klein Euphoria Eau de Parfum 100ml", brand: "Calvin Klein", price: 599, stock: 24 },
        { name: "Lattafa Khamrah Eau de Parfum 100ml", brand: "Lattafa", price: 399, stock: 32 },
        { name: "Versace Bright Crystal Eau de Toilette 90ml", brand: "Versace", price: 799, stock: 18 },
        { name: "Nivea Fresh Active Deodorant 150ml", brand: "Nivea", price: 49, stock: 85 }
      ] },
      { code: "PERSONAL-CARE", name: "Personal Care", products: [
        { name: "Oral-B Pro Expert Toothpaste 75ml", brand: "Oral-B", price: 39, stock: 90 },
        { name: "Colgate Extra Clean Toothbrush Twin Pack", brand: "Colgate", price: 29, stock: 100 },
        { name: "Dove Deeply Nourishing Body Wash 500ml", brand: "Dove", price: 89, stock: 62 },
        { name: "Vaseline Intensive Care Cocoa Glow 400ml", brand: "Vaseline", price: 69, stock: 70 },
        { name: "Gillette Blue II Disposable Razors 10 Pack", brand: "Gillette", price: 79, stock: 58 }
      ] },
      { code: "WELLNESS", name: "Wellness", products: [
        { name: "Centrum Adults Multivitamin 100 Tablets", brand: "Centrum", price: 249, stock: 30 },
        { name: "Seven Seas Cod Liver Oil 1000mg", brand: "Seven Seas", price: 129, stock: 40 },
        { name: "Himalaya Ashwagandha Tablets 60 Count", brand: "Himalaya", price: 159, stock: 33 },
        { name: "Omron M2 Basic Blood Pressure Monitor", brand: "Omron", price: 799, stock: 20 },
        { name: "Braun ThermoScan Ear Thermometer", brand: "Braun", price: 699, stock: 18 }
      ] }
    ]
  },
  {
    code: "SUPERMARKET",
    name: "Supermarket",
    imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
    categories: [
      { code: "BEVERAGES", name: "Beverages", products: [
        { name: "Coca-Cola Original Taste 500ml", brand: "Coca-Cola", price: 12, stock: 160 },
        { name: "Pepsi Cola 500ml", brand: "Pepsi", price: 12, stock: 150 },
        { name: "Milo Active Go 400g", brand: "Nestle", price: 89, stock: 65 },
        { name: "Nescafe Gold Blend Coffee 100g", brand: "Nescafe", price: 119, stock: 42 },
        { name: "Voltic Natural Mineral Water 1.5L", brand: "Voltic", price: 8, stock: 180 }
      ] },
      { code: "PANTRY", name: "Pantry", products: [
        { name: "Tilda Pure Basmati Rice 5kg", brand: "Tilda", price: 249, stock: 45 },
        { name: "Indomie Chicken Flavour Noodles 70g Pack", brand: "Indomie", price: 9, stock: 200 },
        { name: "Gino Tomato Paste 400g", brand: "Gino", price: 28, stock: 90 },
        { name: "Golden Tree Cocoa Powder 500g", brand: "Golden Tree", price: 79, stock: 55 },
        { name: "Blue Band Original Margarine 500g", brand: "Blue Band", price: 45, stock: 70 }
      ] },
      { code: "BREAKFAST", name: "Breakfast", products: [
        { name: "Kellogg's Corn Flakes 500g", brand: "Kellogg's", price: 89, stock: 50 },
        { name: "Quaker Oats 500g", brand: "Quaker", price: 59, stock: 62 },
        { name: "Nutella Hazelnut Spread 350g", brand: "Nutella", price: 119, stock: 38 },
        { name: "Cadbury Drinking Chocolate 500g", brand: "Cadbury", price: 99, stock: 46 },
        { name: "Lurpak Slightly Salted Butter 200g", brand: "Lurpak", price: 69, stock: 40 }
      ] },
      { code: "HOUSEHOLD", name: "Household", products: [
        { name: "Dettol Antiseptic Liquid 500ml", brand: "Dettol", price: 69, stock: 65 },
        { name: "Omo Fast Action Laundry Detergent 1kg", brand: "Omo", price: 55, stock: 70 },
        { name: "Fairy Lemon Dishwashing Liquid 900ml", brand: "Fairy", price: 59, stock: 55 },
        { name: "Kleenex Ultra Soft Tissue 3 Pack", brand: "Kleenex", price: 39, stock: 80 },
        { name: "Vim Cream Surface Cleaner 500ml", brand: "Vim", price: 35, stock: 68 }
      ] },
      { code: "SNACKS", name: "Snacks", products: [
        { name: "Pringles Original Crisps 165g", brand: "Pringles", price: 49, stock: 70 },
        { name: "Oreo Original Cookies 154g", brand: "Oreo", price: 29, stock: 85 },
        { name: "Cadbury Dairy Milk Chocolate 110g", brand: "Cadbury", price: 35, stock: 76 },
        { name: "Lays Salted Potato Chips 170g", brand: "Lays", price: 39, stock: 70 },
        { name: "Tuc Original Crackers 100g", brand: "Tuc", price: 25, stock: 82 }
      ] }
    ]
  }
];

function productCode(departmentCode: string, categoryCode: string, index: number) {
  return `VPS-${departmentCode.slice(0, 3)}-${categoryCode.slice(0, 3)}-${String(index).padStart(3, "0")}`;
}

function description(seed: ProductSeed, categoryName: string) {
  return `<p>${seed.name} from ${seed.brand}. A quality ${categoryName.toLowerCase()} product available for delivery or pickup.</p>`;
}

async function main() {
  const productCount = catalog.reduce(
    (count, department) => count + department.categories.reduce((subtotal, category) => subtotal + category.products.length, 0),
    0
  );
  if (productCount !== 200) throw new Error(`Expected 200 catalog products but found ${productCount}.`);

  const retailOrg = await prisma.retailOrg.findUnique({
    where: { code: RETAIL_ORG_CODE },
    select: { id: true, baseCurrencyCode: true }
  });
  if (!retailOrg) throw new Error(`Retail organization ${RETAIL_ORG_CODE} was not found.`);

  const store = await prisma.store.findUnique({
    where: { retailOrgId_code: { retailOrgId: retailOrg.id, code: STORE_CODE } },
    select: { id: true, name: true, ecommerceEnabled: true, ecommerceSlug: true }
  });
  if (!store) throw new Error(`Store ${STORE_CODE} was not found.`);
  if (!store.ecommerceEnabled) throw new Error(`Store ${STORE_CODE} is not ecommerce enabled.`);

  const salesLocation = await prisma.inventoryLocation.findFirst({
    where: { retailOrgId: retailOrg.id, storeId: store.id, status: "ACTIVE" },
    orderBy: [{ useForSalesDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true }
  });
  if (!salesLocation) throw new Error(`Store ${STORE_CODE} has no active inventory location.`);

  const [unit, taxProfile] = await Promise.all([
    prisma.unitOfMeasure.findFirst({
      where: { retailOrgId: retailOrg.id, code: "EA", status: "ACTIVE" },
      select: { id: true }
    }),
    prisma.taxProfile.findFirst({
      where: { retailOrgId: retailOrg.id, code: "VAT", status: "ACTIVE" },
      select: { id: true }
    })
  ]);
  if (!unit) throw new Error("Active EA unit of measure was not found.");
  if (!taxProfile) throw new Error("Active VAT tax profile was not found.");

  const existingDepartments = await prisma.productDepartment.findMany({
    where: { retailOrgId: retailOrg.id, code: { in: catalog.map((department) => department.code) } },
    select: { id: true, code: true }
  });
  const existingDepartmentCodes = new Set(existingDepartments.map((department) => department.code));
  const missingDepartments = catalog.filter((department) => !existingDepartmentCodes.has(department.code));
  if (missingDepartments.length > 0) {
    await prisma.productDepartment.createMany({
      data: missingDepartments.map((department) => ({
        retailOrgId: retailOrg.id,
        code: department.code,
        name: department.name,
        status: "ACTIVE"
      }))
    });
  }
  const departments = await prisma.productDepartment.findMany({
    where: { retailOrgId: retailOrg.id, code: { in: catalog.map((department) => department.code) } },
    select: { id: true, code: true }
  });
  const departmentIdByCode = new Map(departments.map((department) => [department.code, department.id]));

  const categoryDefinitions = catalog.flatMap((department) =>
    department.categories.map((category) => ({
      code: `${department.code}-${category.code}`,
      name: category.name,
      departmentId: departmentIdByCode.get(department.code)!
    }))
  );
  const existingCategories = await prisma.productCategory.findMany({
    where: { retailOrgId: retailOrg.id, code: { in: categoryDefinitions.map((category) => category.code) } },
    select: { code: true }
  });
  const existingCategoryCodes = new Set(existingCategories.map((category) => category.code));
  const missingCategories = categoryDefinitions.filter((category) => !existingCategoryCodes.has(category.code));
  if (missingCategories.length > 0) {
    await prisma.productCategory.createMany({
      data: missingCategories.map((category) => ({ retailOrgId: retailOrg.id, ...category, status: "ACTIVE" }))
    });
  }

  const productDefinitions: Array<{
    code: string;
    barcode: string;
    stock: number;
    cost: number;
    price: number;
    data: Record<string, unknown>;
  }> = [];
  let productIndex = 0;

  for (const departmentSeed of catalog) {
    for (const categorySeed of departmentSeed.categories) {
      for (const seed of categorySeed.products) {
        productIndex += 1;
        const code = productCode(departmentSeed.code, categorySeed.code, productIndex);
        const price = seed.price.toFixed(2);
        const cost = (seed.price * 0.62).toFixed(2);
        const barcode = String(6200000000000 + productIndex);
        const productData = {
          taxProfileId: taxProfile.id,
          baseUnitOfMeasureId: unit.id,
          sku: code,
          name: seed.name,
          shortName: seed.name.slice(0, 80),
          description: description(seed, categorySeed.name),
          ecommerceDescription: description(seed, categorySeed.name),
          productType: "STOCK",
          department: departmentSeed.name,
          category: categorySeed.name,
          subcategory: categorySeed.name,
          brand: seed.brand,
          unitOfMeasure: "EA",
          primaryImageUrl: departmentSeed.imageUrl,
          ecommerceGalleryJson: JSON.stringify([departmentSeed.imageUrl]),
          ecommercePublished: true,
          ecommerceFeatured: productIndex <= 24,
          ecommerceSortOrder: productIndex,
          ecommerceCompareAtPrice: null,
          ecommerceSpecificationsJson: JSON.stringify([
            { name: "Brand", value: seed.brand },
            { name: "Category", value: categorySeed.name },
            { name: "Availability", value: "In stock" }
          ]),
          taxable: true,
          trackInventory: true,
          isSerialized: false,
          trackExpiry: false,
          trackSize: false,
          trackColor: false,
          mustEnterPriceAtPos: false,
          baseUnitPrice: price,
          baseCostPrice: cost,
          minStockLevel: "5.000",
          reorderPoint: "10.000",
          reorderQuantity: "20.000",
          safetyStockLevel: "5.000",
          status: "ACTIVE"
        };
        productDefinitions.push({ code, barcode, stock: seed.stock, cost: Number(cost), price: seed.price, data: productData });
      }
    }
  }

  const existingProducts = await prisma.product.findMany({
    where: { retailOrgId: retailOrg.id, code: { in: productDefinitions.map((product) => product.code) } },
    select: { id: true, code: true }
  });
  const existingProductCodes = new Set(existingProducts.map((product) => product.code));
  const missingProducts = productDefinitions.filter((product) => !existingProductCodes.has(product.code));
  if (missingProducts.length > 0) {
    await prisma.product.createMany({
      data: missingProducts.map((product) => ({
        retailOrgId: retailOrg.id,
        code: product.code,
        ...product.data
      }))
    });
  }

  const storedProducts = await prisma.product.findMany({
    where: { retailOrgId: retailOrg.id, code: { in: productDefinitions.map((product) => product.code) } },
    select: { id: true, code: true }
  });
  if (storedProducts.length !== productDefinitions.length) {
    throw new Error(`Expected ${productDefinitions.length} seeded products but found ${storedProducts.length}.`);
  }
  const storedProductIdByCode = new Map(storedProducts.map((product) => [product.code, product.id]));
  const products = productDefinitions.map((product) => ({
    ...product,
    id: storedProductIdByCode.get(product.code)!
  }));

  const existingBarcodes = await prisma.barcode.findMany({
    where: { code: { in: products.map((product) => product.barcode) } },
    select: { code: true }
  });
  const existingBarcodeCodes = new Set(existingBarcodes.map((barcode) => barcode.code));
  const missingBarcodes = products.filter((product) => !existingBarcodeCodes.has(product.barcode));
  if (missingBarcodes.length > 0) {
    await prisma.barcode.createMany({
      data: missingBarcodes.map((product) => ({
        productId: product.id,
        productVariantId: null,
        code: product.barcode,
        barcodeType: "EAN13"
      }))
    });
  }

  await prisma.storeProductPrice.deleteMany({
    where: { storeId: store.id, productId: { in: products.map((product) => product.id) }, productVariantId: null }
  });
  await prisma.storeProductPrice.createMany({
    data: products.map((product) => ({
      retailOrgId: retailOrg.id,
      storeId: store.id,
      productId: product.id,
      productVariantId: null,
      unitPrice: product.price.toFixed(2),
      status: "ACTIVE"
    }))
  });

  await prisma.inventoryLedgerEntry.deleteMany({
    where: {
      retailOrgId: retailOrg.id,
      storeId: store.id,
      inventoryLocationId: salesLocation.id,
      referenceType: STOCK_REFERENCE_TYPE
    }
  });
  await prisma.inventoryLedgerEntry.createMany({
    data: products.map((product) => ({
      retailOrgId: retailOrg.id,
      storeId: store.id,
      inventoryLocationId: salesLocation.id,
      productId: product.id,
      movementType: "OPENING_BALANCE",
      quantity: product.stock.toFixed(3),
      unitCost: product.cost.toFixed(2),
      referenceType: STOCK_REFERENCE_TYPE,
      referenceId: product.code,
      externalReference: "VPS ecommerce storefront catalog",
      occurredAt: new Date()
    }))
  });

  const summary = await prisma.product.groupBy({
    by: ["department"],
    where: { retailOrgId: retailOrg.id, code: { startsWith: "VPS-" }, ecommercePublished: true, status: "ACTIVE" },
    _count: { _all: true }
  });
  console.log(JSON.stringify({
    store: { code: STORE_CODE, name: store.name, publicUrl: `/shop/${store.ecommerceSlug ?? STORE_CODE}` },
    salesLocation: salesLocation.name,
    seededProducts: products.length,
    departments: summary.map((row) => ({ department: row.department, count: row._count._all }))
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

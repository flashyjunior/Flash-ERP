import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";

const datasourceUrl = process.env.DATABASE_URL;

if (!datasourceUrl) {
  throw new Error("DATABASE_URL must be set before assigning catalog images.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMssql(datasourceUrl)
});

const RETAIL_ORG_CODE = "flash-erp";
const SEEDED_PRODUCT_CODE_PREFIX = "VPS-";

type ImageProduct = {
  category: string;
  images: string[];
};

function uniqueImages(products: ImageProduct[], categories: string[]) {
  const allowedCategories = new Set(categories);
  return products
    .filter((product) => allowedCategories.has(product.category))
    .flatMap((product) => product.images)
    .filter((image, index, images) => image.startsWith("https://") && images.indexOf(image) === index);
}

function takeImages(pool: string[], count: number, used: Set<string>) {
  const result: string[] = [];
  for (const image of pool) {
    if (used.has(image)) continue;
    used.add(image);
    result.push(image);
    if (result.length === count) return result;
  }
  throw new Error(`Image source contained only ${result.length} unique image(s); ${count} are required.`);
}

async function main() {
  const response = await fetch("https://dummyjson.com/products?limit=0&select=id,title,category,images");
  if (!response.ok) throw new Error(`Could not load catalog images: HTTP ${response.status}.`);
  const payload = await response.json() as { products?: ImageProduct[] };
  const imageProducts = payload.products ?? [];
  if (imageProducts.length === 0) throw new Error("The catalog image source returned no products.");

  const used = new Set<string>();
  const imagesByDepartment = new Map<string, string[]>([
    ["Phones", takeImages(uniqueImages(imageProducts, ["smartphones"]), 25, used)],
    ["Phone Accessories", takeImages(uniqueImages(imageProducts, ["mobile-accessories"]), 25, used)],
    ["Computers", takeImages(uniqueImages(imageProducts, ["laptops", "tablets"]), 25, used)],
    ["Electronics", takeImages(uniqueImages(imageProducts, ["smartphones", "kitchen-accessories"]), 25, used)],
    ["Furniture", takeImages(uniqueImages(imageProducts, ["furniture", "home-decoration"]), 25, used)],
    ["Fashion", takeImages(uniqueImages(imageProducts, [
      "mens-shirts", "mens-shoes", "mens-watches", "sunglasses", "tops",
      "womens-bags", "womens-dresses", "womens-jewellery", "womens-shoes", "womens-watches"
    ]), 25, used)],
    ["Health and Beauty", takeImages(uniqueImages(imageProducts, ["beauty", "fragrances", "skin-care"]), 25, used)],
    ["Supermarket", takeImages(uniqueImages(imageProducts, ["groceries"]), 25, used)]
  ]);

  const retailOrg = await prisma.retailOrg.findUnique({
    where: { code: RETAIL_ORG_CODE },
    select: { id: true }
  });
  if (!retailOrg) throw new Error(`Retail organization ${RETAIL_ORG_CODE} was not found.`);

  const products = await prisma.product.findMany({
    where: {
      retailOrgId: retailOrg.id,
      code: { startsWith: SEEDED_PRODUCT_CODE_PREFIX },
      ecommercePublished: true,
      status: "ACTIVE"
    },
    orderBy: [{ department: "asc" }, { code: "asc" }],
    select: { id: true, code: true, department: true }
  });
  if (products.length !== 200) throw new Error(`Expected 200 seeded products but found ${products.length}.`);

  const assignments = products.map((product) => {
    const images = imagesByDepartment.get(product.department ?? "");
    if (!images || images.length === 0) throw new Error(`No image pool was prepared for ${product.department ?? "an uncategorized product"}.`);
    const imageUrl = images.shift();
    if (!imageUrl) throw new Error(`No image remained for ${product.department}.`);
    return { id: product.id, imageUrl };
  });
  if (new Set(assignments.map((assignment) => assignment.imageUrl)).size !== assignments.length) {
    throw new Error("Catalog image assignment contains duplicates.");
  }

  const batchSize = 16;
  for (let index = 0; index < assignments.length; index += batchSize) {
    const batch = assignments.slice(index, index + batchSize);
    await Promise.all(batch.map((assignment) => prisma.product.update({
      where: { id: assignment.id },
      data: {
        primaryImageUrl: assignment.imageUrl,
        ecommerceGalleryJson: JSON.stringify([])
      }
    })));
  }

  const verified = await prisma.product.findMany({
    where: { id: { in: assignments.map((assignment) => assignment.id) } },
    select: { primaryImageUrl: true }
  });
  const distinctImages = new Set(verified.map((product) => product.primaryImageUrl).filter(Boolean));
  if (verified.length !== 200 || distinctImages.size !== 200) {
    throw new Error(`Image verification failed: ${verified.length} product(s), ${distinctImages.size} unique image(s).`);
  }
  console.log(JSON.stringify({ updatedProducts: verified.length, distinctPrimaryImages: distinctImages.size }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

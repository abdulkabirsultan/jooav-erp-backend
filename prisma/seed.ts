import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Argon2 options - same as auth service
const argonOptions = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16, // 64 MB
  timeCost: 3,
  parallelism: 1,
};

// Hash password using Argon2
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, argonOptions);
}

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create Super Admin user
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@jooav.com' },
    update: {},
    create: {
      email: 'superadmin@jooav.com',
      firstName: 'Super',
      lastName: 'Admin',
      password: await hashPassword('password123'), // Argon2 hashed
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      profile: {
        create: {
          country: 'Nigeria',
        },
      },
      adminProfile: {
        create: {
          // Super Admin has full platform control
          canModifySystemConfig: true,
          canSuspendAdmins: true,
          canChangeUserRoles: true,
          canChangeUserEmails: true,
        },
      },
    },
  });

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@jooav.com' },
    update: {},
    create: {
      email: 'admin@jooav.com',
      firstName: 'Platform',
      lastName: 'Admin',
      password: await hashPassword('password123'), // Argon2 hashed
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      profile: {
        create: {
          country: 'Nigeria',
        },
      },
      adminProfile: {
        create: {
          assignedRegions: ['Lagos', 'Abuja'], // Regional assignment
          canModifySystemConfig: false, // Limited - cannot modify system config
          canSuspendAdmins: false, // Limited - cannot suspend other admins
          canChangeUserRoles: false, // Limited - cannot change user roles
          canChangeUserEmails: false, // Limited - cannot change user emails
        },
      },
    },
  });

  // Create sample users
  const subAdmin = await prisma.user.upsert({
    where: { email: 'subadmin@jooav.com' },
    update: {},
    create: {
      email: 'subadmin@jooav.com',
      firstName: 'Procurement',
      lastName: 'Officer',
      password: await hashPassword('password123'), // Argon2 hashed
      role: UserRole.PROCUREMENT_OFFICER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      profile: {
        create: {
          country: 'Nigeria',
        },
      },
      procurementOfficerProfile: {
        create: {
          employeeId: 'SUB001',
          // regionId: undefined, // Optional - can be assigned later for scalability
          specializations: ['Electronics', 'Industrial Equipment'],
          maxOrderValue: 50000.0,
        },
      },
    },
  });

  // Create regions
  const regions = await Promise.all([
    prisma.region.upsert({
      where: { code: 'NG-LA' },
      update: {},
      create: {
        name: 'Lagos',
        code: 'NG-LA',
        country: 'Nigeria',
        state: 'Lagos State',
        isActive: true,
      },
    }),
    prisma.region.upsert({
      where: { code: 'NG-AB' },
      update: {},
      create: {
        name: 'Abuja',
        code: 'NG-AB',
        country: 'Nigeria',
        state: 'FCT',
        isActive: true,
      },
    }),
    prisma.region.upsert({
      where: { code: 'NG-KA' },
      update: {},
      create: {
        name: 'Kano',
        code: 'NG-KA',
        country: 'Nigeria',
        state: 'Kano State',
        isActive: true,
      },
    }),
  ]);

  // Create Wholesaler user
  const wholesalerUser = await prisma.user.upsert({
    where: { email: 'wholesaler@jooav.com' },
    update: {},
    create: {
      email: 'wholesaler@jooav.com',
      firstName: 'Wholesale Business',
      lastName: 'Owner',
      password: await hashPassword('password123'), // Argon2 hashed
      role: UserRole.WHOLESALER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      profile: {
        create: {
          country: 'Nigeria',
        },
      },
    },
  });

  // Collect users for easy reference
  const users = [superAdmin, admin, subAdmin, wholesalerUser];

  // Create sample manufacturers
  const manufacturers = await Promise.all([
    prisma.manufacturer.create({
      data: {
        name: 'Nestle Nigeria Plc',
        description: 'Leading food and beverage company',
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.manufacturer.create({
      data: {
        name: 'Coca-Cola Nigeria Limited',
        description: 'The Coca-Cola System in Nigeria',
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
  ]);

  // Create sample categories
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Food & Beverages',
        description: 'Food and beverage products',
        slug: 'food-beverages',
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Personal Care',
        description: 'Personal care and hygiene products',
        slug: 'personal-care',
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Household Items',
        description: 'Household and cleaning products',
        slug: 'household-items',
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
  ]);

  // Create subcategories
  const subcategories = await Promise.all([
    prisma.subcategory.create({
      data: {
        name: 'Instant Noodles',
        description: 'Quick cooking noodles',
        slug: 'instant-noodles',
        categoryId: categories[0].id, // Food & Beverages
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.subcategory.create({
      data: {
        name: 'Soft Drinks',
        description: 'Carbonated and non-carbonated drinks',
        slug: 'soft-drinks',
        categoryId: categories[0].id, // Food & Beverages
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.subcategory.create({
      data: {
        name: 'Dairy Products',
        description: 'Milk and dairy products',
        slug: 'dairy-products',
        categoryId: categories[0].id, // Food & Beverages
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
  ]);

  // Create sample brands
  const brands = await Promise.all([
    prisma.brand.create({
      data: {
        name: 'Indomie',
        description: 'Popular instant noodles brand',
        manufacturerId: manufacturers[0].id,
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.brand.create({
      data: {
        name: 'Coca-Cola',
        description: 'World famous cola brand',
        manufacturerId: manufacturers[1].id,
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.brand.create({
      data: {
        name: 'Peak',
        description: 'Premium milk brand',
        manufacturerId: manufacturers[0].id,
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
  ]);

  // Create sample variants
  const variants = await Promise.all([
    prisma.variant.create({
      data: {
        name: 'Chicken Curry',
        description: 'Delicious chicken curry flavor',
        brandId: brands[0].id, // Indomie
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.variant.create({
      data: {
        name: 'Classic',
        description: 'Classic cola flavor',
        brandId: brands[1].id, // Coca-Cola
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.variant.create({
      data: {
        name: 'Milk Powder',
        description: 'Premium milk powder',
        brandId: brands[2].id, // Peak
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
  ]);

  // Create sample pack sizes - multiple per variant to showcase new functionality
  const packSizes = await Promise.all([
    // Indomie Chicken Curry pack sizes
    prisma.packSize.create({
      data: {
        name: '70g',
        variantId: variants[0].id, // Indomie Chicken Curry
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packSize.create({
      data: {
        name: '120g',
        variantId: variants[0].id, // Indomie Chicken Curry
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packSize.create({
      data: {
        name: '200g',
        variantId: variants[0].id, // Indomie Chicken Curry
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),

    // Coca-Cola Classic pack sizes
    prisma.packSize.create({
      data: {
        name: '350ml',
        variantId: variants[1].id, // Coca-Cola Classic
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packSize.create({
      data: {
        name: '500ml',
        variantId: variants[1].id, // Coca-Cola Classic
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packSize.create({
      data: {
        name: '1.5L',
        variantId: variants[1].id, // Coca-Cola Classic
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),

    // Peak Milk Powder pack sizes
    prisma.packSize.create({
      data: {
        name: '400g',
        variantId: variants[2].id, // Peak Milk Powder
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packSize.create({
      data: {
        name: '900g',
        variantId: variants[2].id, // Peak Milk Powder
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packSize.create({
      data: {
        name: '1.8kg',
        variantId: variants[2].id, // Peak Milk Powder
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
  ]);

  // Create sample pack types - multiple per variant to showcase new functionality
  const packTypes = await Promise.all([
    // Indomie Chicken Curry pack types
    prisma.packType.create({
      data: {
        name: 'Single Pack',
        variantId: variants[0].id, // Indomie Chicken Curry
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packType.create({
      data: {
        name: 'Twin Pack',
        variantId: variants[0].id, // Indomie Chicken Curry
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packType.create({
      data: {
        name: 'Family Pack',
        variantId: variants[0].id, // Indomie Chicken Curry
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),

    // Coca-Cola Classic pack types
    prisma.packType.create({
      data: {
        name: 'Glass Bottle',
        variantId: variants[1].id, // Coca-Cola Classic
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packType.create({
      data: {
        name: 'PET Bottle',
        variantId: variants[1].id, // Coca-Cola Classic
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packType.create({
      data: {
        name: 'Can',
        variantId: variants[1].id, // Coca-Cola Classic
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),

    // Peak Milk Powder pack types
    prisma.packType.create({
      data: {
        name: 'Tin',
        variantId: variants[2].id, // Peak Milk Powder
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packType.create({
      data: {
        name: 'Pouch',
        variantId: variants[2].id, // Peak Milk Powder
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
    prisma.packType.create({
      data: {
        name: 'Carton',
        variantId: variants[2].id, // Peak Milk Powder
        createdBy: superAdmin.id,
        updatedBy: superAdmin.id,
      },
    }),
  ]);

  // Create sample products with diverse pack combinations
  const products = await Promise.all([
    // Indomie Products - Multiple combinations
    prisma.product.create({
      data: {
        name: 'Indomie Chicken Curry 70g (Single Pack)',
        description: 'Delicious instant noodles with chicken curry flavor',
        sku: 'INDOMIE-CHICKEN-CURRY-70G-SINGLE-PACK',
        brandId: brands[0].id,
        variantId: variants[0].id,
        manufacturerId: manufacturers[0].id,
        subcategoryId:
          subcategories.find((c) => c.name === 'Instant Noodles')?.id ||
          subcategories[0].id,
        packSizeId: packSizes[0].id, // 70g
        packTypeId: packTypes[0].id, // Single Pack
        price: 120.0,
        discount: 5.0,
        thumbnail: 'indomie-chicken-70g-single-thumb.jpg',
        images: ['indomie-chicken-70g-single.jpg'],
        createdBy: users[0].id,
        updatedBy: users[0].id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Indomie Chicken Curry 120g (Twin Pack)',
        description:
          'Convenient twin pack of instant noodles with chicken curry flavor',
        sku: 'INDOMIE-CHICKEN-CURRY-120G-TWIN-PACK',
        brandId: brands[0].id,
        variantId: variants[0].id,
        manufacturerId: manufacturers[0].id,
        subcategoryId:
          subcategories.find((c) => c.name === 'Instant Noodles')?.id ||
          subcategories[0].id,
        packSizeId: packSizes[1].id, // 120g
        packTypeId: packTypes[1].id, // Twin Pack
        price: 220.0,
        discount: 8.0,
        thumbnail: 'indomie-chicken-120g-twin-thumb.jpg',
        images: ['indomie-chicken-120g-twin.jpg'],
        createdBy: users[0].id,
        updatedBy: users[0].id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Indomie Chicken Curry 200g (Family Pack)',
        description:
          'Large family pack of instant noodles with chicken curry flavor',
        sku: 'INDOMIE-CHICKEN-CURRY-200G-FAMILY-PACK',
        brandId: brands[0].id,
        variantId: variants[0].id,
        manufacturerId: manufacturers[0].id,
        subcategoryId:
          subcategories.find((c) => c.name === 'Instant Noodles')?.id ||
          subcategories[0].id,
        packSizeId: packSizes[2].id, // 200g
        packTypeId: packTypes[2].id, // Family Pack
        price: 350.0,
        discount: 12.0,
        thumbnail: 'indomie-chicken-200g-family-thumb.jpg',
        images: ['indomie-chicken-200g-family.jpg'],
        createdBy: users[0].id,
        updatedBy: users[0].id,
      },
    }),

    // Coca-Cola Products - Multiple combinations
    prisma.product.create({
      data: {
        name: 'Coca Cola Classic 350ml (Glass Bottle)',
        description: 'Refreshing cola soft drink in classic glass bottle',
        sku: 'COCA-COLA-CLASSIC-350ML-GLASS-BOTTLE',
        brandId: brands[1].id,
        variantId: variants[1].id,
        manufacturerId: manufacturers[1].id,
        subcategoryId:
          subcategories.find((c) => c.name === 'Soft Drinks')?.id ||
          subcategories[1].id,
        packSizeId: packSizes[3].id, // 350ml
        packTypeId: packTypes[3].id, // Glass Bottle
        price: 180.0,
        discount: 5.0,
        thumbnail: 'coca-cola-350ml-glass-thumb.jpg',
        images: ['coca-cola-350ml-glass.jpg'],
        createdBy: users[0].id,
        updatedBy: users[0].id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Coca Cola Classic 500ml (PET Bottle)',
        description: 'Refreshing cola soft drink in convenient PET bottle',
        sku: 'COCA-COLA-CLASSIC-500ML-PET-BOTTLE',
        brandId: brands[1].id,
        variantId: variants[1].id,
        manufacturerId: manufacturers[1].id,
        subcategoryId:
          subcategories.find((c) => c.name === 'Soft Drinks')?.id ||
          subcategories[0].id,
        packSizeId: packSizes[4].id, // 500ml
        packTypeId: packTypes[4].id, // PET Bottle
        price: 200.0,
        discount: 10.0,
        thumbnail: 'coca-cola-500ml-pet-thumb.jpg',
        images: ['coca-cola-500ml-pet.jpg'],
        createdBy: users[0].id,
        updatedBy: users[0].id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Coca Cola Classic 1.5L (PET Bottle)',
        description: 'Large family size cola soft drink in PET bottle',
        sku: 'COCA-COLA-CLASSIC-1-5L-PET-BOTTLE',
        brandId: brands[1].id,
        variantId: variants[1].id,
        manufacturerId: manufacturers[1].id,
        subcategoryId:
          subcategories.find((c) => c.name === 'Soft Drinks')?.id ||
          subcategories[0].id,
        packSizeId: packSizes[5].id, // 1.5L
        packTypeId: packTypes[4].id, // PET Bottle
        price: 450.0,
        discount: 15.0,
        thumbnail: 'coca-cola-1-5l-pet-thumb.jpg',
        images: ['coca-cola-1-5l-pet.jpg'],
        createdBy: users[0].id,
        updatedBy: users[0].id,
      },
    }),

    // Peak Milk Products - Multiple combinations
    prisma.product.create({
      data: {
        name: 'Peak Milk Powder 400g (Tin)',
        description: 'Premium quality milk powder in classic tin packaging',
        sku: 'PEAK-MILK-POWDER-400G-TIN',
        brandId: brands[2].id,
        variantId: variants[2].id,
        manufacturerId: manufacturers[0].id,
        subcategoryId:
          subcategories.find((c) => c.name === 'Dairy Products')?.id ||
          subcategories[2].id,
        packSizeId: packSizes[6].id, // 400g
        packTypeId: packTypes[6].id, // Tin
        price: 1500.0,
        discount: 10.0,
        thumbnail: 'peak-milk-400g-tin-thumb.jpg',
        images: ['peak-milk-400g-tin.jpg'],
        createdBy: users[0].id,
        updatedBy: users[0].id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Peak Milk Powder 900g (Pouch)',
        description:
          'Premium quality milk powder in convenient resealable pouch',
        sku: 'PEAK-MILK-POWDER-900G-POUCH',
        brandId: brands[2].id,
        variantId: variants[2].id,
        manufacturerId: manufacturers[0].id,
        subcategoryId:
          subcategories.find((c) => c.name === 'Dairy Products')?.id ||
          subcategories[2].id,
        packSizeId: packSizes[7].id, // 900g
        packTypeId: packTypes[7].id, // Pouch
        price: 3200.0,
        discount: 12.0,
        thumbnail: 'peak-milk-900g-pouch-thumb.jpg',
        images: ['peak-milk-900g-pouch.jpg'],
        createdBy: users[0].id,
        updatedBy: users[0].id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Peak Milk Powder 1.8kg (Carton)',
        description: 'Premium quality milk powder in large family size carton',
        sku: 'PEAK-MILK-POWDER-1-8KG-CARTON',
        brandId: brands[2].id,
        variantId: variants[2].id,
        manufacturerId: manufacturers[0].id,
        subcategoryId:
          subcategories.find((c) => c.name === 'Dairy Products')?.id ||
          subcategories[2].id,
        packSizeId: packSizes[8].id, // 1.8kg
        packTypeId: packTypes[8].id, // Carton
        price: 6000.0,
        discount: 20.0,
        thumbnail: 'peak-milk-1-8kg-carton-thumb.jpg',
        images: ['peak-milk-1-8kg-carton.jpg'],
        createdBy: users[0].id,
        updatedBy: users[0].id,
      },
    }),
  ]);

  // Create wholesaler profile
  const wholesalerProfile = await prisma.wholesaler.create({
    data: {
      userId: wholesalerUser.id,
      businessName: 'Metro Wholesale Distribution',
      businessType: 'Wholesale',
      regionId: regions[0].id, // Lagos region
      businessLicense: 'WHL-NGR-2024-001',
      verificationStatus: 'APPROVED',
      approvedBy: superAdmin.id,
      approvedAt: new Date(),
    },
  });

  // Create sample orders
  const sampleOrders = await Promise.all([
    prisma.order.create({
      data: {
        orderNumber: 'ORD-260207-001',
        wholesalerId: wholesalerProfile.id,
        createdById: wholesalerUser.id,
        status: 'SUBMITTED',
        subtotal: 180000,
        totalAmount: 180000,
        deliveryAddress: {
          address: '45 Broad Street, Lagos Island',
          city: 'Lagos',
          state: 'Lagos State',
          contactName: 'Wholesale Business Owner',
          contactPhone: '+234801234567',
        },
        customerNotes: 'Urgent delivery needed for weekend sales',
        orderDate: new Date(),
        submittedAt: new Date(),
        items: {
          create: [
            {
              productId: products[0].id, // Indomie noodles
              quantity: 20,
              unitPrice: 4500,
              lineTotal: 90000,
              status: 'PENDING',
            },
            {
              productId: products[1].id, // Coca Cola
              quantity: 15,
              unitPrice: 6000,
              lineTotal: 90000,
              status: 'PENDING',
            },
          ],
        },
      },
    }),
    prisma.order.create({
      data: {
        orderNumber: 'ORD-260207-002',
        wholesalerId: wholesalerProfile.id,
        createdById: wholesalerUser.id,
        status: 'DRAFT',
        subtotal: 120000,
        totalAmount: 120000,
        customerNotes: 'Regular monthly stock replenishment',
        orderDate: new Date(),
        items: {
          create: [
            {
              productId: products[2].id, // Peak Milk
              quantity: 20,
              unitPrice: 6000,
              lineTotal: 120000,
              status: 'PENDING',
            },
          ],
        },
      },
    }),
  ]);

  // Create system configurations
  await prisma.systemConfig.createMany({
    data: [
      {
        key: 'company_name',
        value: JSON.stringify('JOOAV Technologies'),
      },
      {
        key: 'company_email',
        value: JSON.stringify('info@jooav.com'),
      },
      {
        key: 'company_phone',
        value: JSON.stringify('+234-800-JOOAV-01'),
      },
      {
        key: 'default_currency',
        value: JSON.stringify('NGN'),
      },
      {
        key: 'tax_rate',
        value: JSON.stringify(7.5),
      },
    ],
  });

  console.log('✅ Database seeding completed successfully!');
  console.log('📊 Seeded data:');
  console.log(
    `   - ${4} Users (1 Super Admin, 1 Admin, 1 Sub-Admin, 1 Wholesaler User)`,
  );
  console.log(`   - ${manufacturers.length} Manufacturers`);
  console.log(`   - ${brands.length} Brands`);
  console.log(`   - ${variants.length} Variants`);
  console.log(`   - ${packSizes.length} Pack Sizes`);
  console.log(`   - ${packTypes.length} Pack Types`);
  console.log(`   - ${products.length} Products`);
  console.log(`   - ${5} System Configurations`);
  console.log('🎯 Enhanced pack entity combinations created!');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seeding:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

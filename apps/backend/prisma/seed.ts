import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  STAFF_ROLES,
} from '@nodedr-restaurant/types';

// Deliberately not imported from src/modules/orders/pricing — the runtime
// image only ships apps/backend/dist + prisma (see ARCHITECTURE.md /
// install.sh packaging notes), so `src/` doesn't exist to import from once
// this script runs via a container's `npx ts-node prisma/seed.ts`. Same
// tax-inclusive math as OrdersService.priceLine, kept tiny and duplicated
// on purpose rather than reaching across that packaging boundary.
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function priceLine(
  quantity: number,
  unitPriceInclusive: number,
  taxRatePercent: number,
) {
  const lineTotal = round2(unitPriceInclusive * quantity);
  const rate = taxRatePercent / 100;
  const taxAmount = rate > 0 ? round2(lineTotal - lineTotal / (1 + rate)) : 0;
  return { lineTotal, taxAmount };
}

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding permissions...');
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { label: permission.label, category: permission.category },
      create: permission,
    });
  }
  const allPermissions = await prisma.permission.findMany();
  const permissionByKey = new Map(allPermissions.map((p) => [p.key, p]));

  console.log('Creating demo restaurant + branch...');
  const restaurant = await prisma.restaurant.upsert({
    where: { id: 'demo-restaurant' },
    update: {
      subscriptionPlan: 'PRO',
      subscriptionStatus: 'ACTIVE',
      maxTables: 100,
      maxStaff: 50,
      maxBranches: 5,
      kdsEnabled: true,
      customBrandingEnabled: true,
    },
    create: {
      id: 'demo-restaurant',
      name: 'Nodedr Bistro (Demo)',
      currency: 'INR',
      subscriptionPlan: 'PRO',
      subscriptionStatus: 'ACTIVE',
      maxTables: 100,
      maxStaff: 50,
      maxBranches: 5,
      kdsEnabled: true,
      customBrandingEnabled: true,
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: 'demo-branch' },
    update: {},
    create: {
      id: 'demo-branch',
      restaurantId: restaurant.id,
      name: 'Main Branch',
      address: '123 Demo Street',
    },
  });

  console.log('Seeding roles...');
  const roleByName = new Map<string, string>();
  for (const roleName of STAFF_ROLES) {
    const role = await prisma.role.upsert({
      where: {
        restaurantId_name: { restaurantId: restaurant.id, name: roleName },
      },
      update: {},
      create: {
        restaurantId: restaurant.id,
        name: roleName,
        label: roleName.replace(/_/g, ' '),
      },
    });
    roleByName.set(roleName, role.id);

    const grantedKeys = DEFAULT_ROLE_PERMISSIONS[roleName];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: grantedKeys
        .map((key) => permissionByKey.get(key))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
    });
  }

  console.log(
    'Creating demo owner user (login: owner@demo.local / password: Password123!)...',
  );
  const passwordHash = await bcrypt.hash('Password123!', 12);
  const pinHash = await bcrypt.hash('1234', 12);
  const ownerRoleId = roleByName.get('OWNER')!;

  const owner = await prisma.user.upsert({
    where: {
      restaurantId_email: {
        restaurantId: restaurant.id,
        email: 'owner@demo.local',
      },
    },
    update: {},
    create: {
      restaurantId: restaurant.id,
      roleId: ownerRoleId,
      name: 'Demo Owner',
      email: 'owner@demo.local',
      passwordHash,
      pinHash,
    },
  });

  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: owner.id, branchId: branch.id } },
    update: {},
    create: { userId: owner.id, branchId: branch.id },
  });

  console.log('Seeding floor + tables...');
  const floor = await prisma.floor.upsert({
    where: { id: 'demo-floor' },
    update: {},
    create: { id: 'demo-floor', branchId: branch.id, name: 'Ground Floor' },
  });

  for (let i = 1; i <= 8; i++) {
    await prisma.table.upsert({
      where: { floorId_number: { floorId: floor.id, number: String(i) } },
      update: {},
      create: {
        floorId: floor.id,
        number: String(i),
        name: `Table ${i}`,
        capacity: i % 3 === 0 ? 6 : 4,
        posX: ((i - 1) % 4) * 120 + 20,
        posY: Math.floor((i - 1) / 4) * 120 + 20,
      },
    });
  }

  console.log('Seeding kitchen stations + menu...');
  const mainKitchen = await prisma.kitchenStation.upsert({
    where: { id: 'demo-station-main' },
    update: {},
    create: {
      id: 'demo-station-main',
      branchId: branch.id,
      name: 'Main Kitchen',
    },
  });
  const bar = await prisma.kitchenStation.upsert({
    where: { id: 'demo-station-bar' },
    update: {},
    create: { id: 'demo-station-bar', branchId: branch.id, name: 'Bar' },
  });

  const starters = await prisma.menuCategory.upsert({
    where: { id: 'demo-cat-starters' },
    update: {},
    create: {
      id: 'demo-cat-starters',
      branchId: branch.id,
      name: 'Starters',
      sortOrder: 0,
    },
  });
  const mains = await prisma.menuCategory.upsert({
    where: { id: 'demo-cat-mains' },
    update: {},
    create: {
      id: 'demo-cat-mains',
      branchId: branch.id,
      name: 'Main Course',
      sortOrder: 1,
    },
  });
  const drinks = await prisma.menuCategory.upsert({
    where: { id: 'demo-cat-drinks' },
    update: {},
    create: {
      id: 'demo-cat-drinks',
      branchId: branch.id,
      name: 'Drinks',
      sortOrder: 2,
    },
  });

  const crustGroup = await prisma.modifierGroup.upsert({
    where: { id: 'demo-mg-crust' },
    update: {},
    create: {
      id: 'demo-mg-crust',
      branchId: branch.id,
      name: 'Crust Type',
      minSelect: 1,
      maxSelect: 1,
      isRequired: true,
      modifiers: {
        connectOrCreate: [
          {
            where: { id: 'demo-mod-thin' },
            create: {
              id: 'demo-mod-thin',
              name: 'Thin Crust',
              priceAdjustment: 0,
              isDefault: true,
            },
          },
          {
            where: { id: 'demo-mod-thick' },
            create: {
              id: 'demo-mod-thick',
              name: 'Thick Crust',
              priceAdjustment: 0,
            },
          },
          {
            where: { id: 'demo-mod-cheese' },
            create: {
              id: 'demo-mod-cheese',
              name: 'Extra Cheese',
              priceAdjustment: 60,
            },
          },
        ],
      },
    },
  });

  const demoItems: {
    id: string;
    name: string;
    categoryId: string;
    stationId: string;
    price: number;
    taxRatePercent: number;
    isVeg: boolean;
    modifierGroupId?: string;
  }[] = [
    {
      id: 'demo-item-paneer-tikka',
      name: 'Paneer Tikka',
      categoryId: starters.id,
      stationId: mainKitchen.id,
      price: 280,
      taxRatePercent: 5,
      isVeg: true,
    },
    {
      id: 'demo-item-chicken-65',
      name: 'Chicken 65',
      categoryId: starters.id,
      stationId: mainKitchen.id,
      price: 320,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-margherita',
      name: 'Margherita Pizza',
      categoryId: mains.id,
      stationId: mainKitchen.id,
      price: 420,
      taxRatePercent: 5,
      isVeg: true,
      modifierGroupId: crustGroup.id,
    },
    {
      id: 'demo-item-butter-chicken',
      name: 'Butter Chicken',
      categoryId: mains.id,
      stationId: mainKitchen.id,
      price: 480,
      taxRatePercent: 5,
      isVeg: false,
    },
    {
      id: 'demo-item-mojito',
      name: 'Virgin Mojito',
      categoryId: drinks.id,
      stationId: bar.id,
      price: 220,
      taxRatePercent: 18,
      isVeg: true,
    },
    {
      id: 'demo-item-cola',
      name: 'Coca-Cola',
      categoryId: drinks.id,
      stationId: bar.id,
      price: 90,
      taxRatePercent: 18,
      isVeg: true,
    },
  ];

  for (const item of demoItems) {
    await prisma.menuItem.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        branchId: branch.id,
        categoryId: item.categoryId,
        stationId: item.stationId,
        name: item.name,
        price: item.price,
        taxRatePercent: item.taxRatePercent,
        isVeg: item.isVeg,
        ...(item.modifierGroupId
          ? {
              modifierGroups: {
                create: [{ modifierGroupId: item.modifierGroupId }],
              },
            }
          : {}),
      },
    });
  }

  console.log('Seeding takeaway demo orders...');
  const itemById = new Map(demoItems.map((i) => [i.id, i]));

  const demoOrders: {
    id: string;
    orderNumber: string;
    paid: boolean;
    lines: { itemId: string; quantity: number }[];
  }[] = [
    {
      // Phoned in, sent to the kitchen, still waiting for pickup — shows up
      // live on the Kitchen Display with no table attached.
      id: 'demo-order-takeaway-1',
      orderNumber: 'TA-DEMO-0001',
      paid: false,
      lines: [
        { itemId: 'demo-item-chicken-65', quantity: 1 },
        { itemId: 'demo-item-cola', quantity: 2 },
      ],
    },
    {
      // Already picked up and paid — shows takeaway flowing all the way
      // through checkout, not just the kitchen side.
      id: 'demo-order-takeaway-2',
      orderNumber: 'TA-DEMO-0002',
      paid: true,
      lines: [
        { itemId: 'demo-item-butter-chicken', quantity: 1 },
        { itemId: 'demo-item-cola', quantity: 1 },
      ],
    },
  ];

  for (const demoOrder of demoOrders) {
    const lines = demoOrder.lines.map((line) => {
      const item = itemById.get(line.itemId)!;
      const priced = priceLine(line.quantity, item.price, item.taxRatePercent);
      return { item, quantity: line.quantity, priced };
    });
    const subtotal = round2(
      lines.reduce((sum, l) => sum + l.priced.lineTotal, 0),
    );
    const taxAmount = round2(
      lines.reduce((sum, l) => sum + l.priced.taxAmount, 0),
    );
    const itemStatus = demoOrder.paid ? 'SERVED' : 'NEW';

    const order = await prisma.order.upsert({
      where: { id: demoOrder.id },
      update: {},
      create: {
        id: demoOrder.id,
        branchId: branch.id,
        orderNumber: demoOrder.orderNumber,
        type: 'TAKEAWAY',
        status: demoOrder.paid ? 'PAID' : 'OPEN',
        createdById: owner.id,
        subtotal,
        taxAmount,
        totalAmount: subtotal,
        billedAt: demoOrder.paid ? new Date() : null,
        ...(demoOrder.paid
          ? { payments: { create: [{ method: 'CASH', amount: subtotal }] } }
          : {}),
      },
    });

    const itemsByStation = new Map<string | null, { id: string }[]>();
    for (const [idx, line] of lines.entries()) {
      const orderItem = await prisma.orderItem.upsert({
        where: { id: `${demoOrder.id}-item-${idx}` },
        update: {},
        create: {
          id: `${demoOrder.id}-item-${idx}`,
          orderId: order.id,
          menuItemId: line.item.id,
          nameSnapshot: line.item.name,
          unitPriceSnapshot: line.item.price,
          taxRateSnapshot: line.item.taxRatePercent,
          quantity: line.quantity,
          lineTotal: line.priced.lineTotal,
          status: itemStatus,
        },
      });
      const bucket = itemsByStation.get(line.item.stationId) ?? [];
      bucket.push({ id: orderItem.id });
      itemsByStation.set(line.item.stationId, bucket);
    }

    let ticketSeq = 1;
    for (const [stationId, items] of itemsByStation) {
      const kot = await prisma.kot.upsert({
        where: { id: `${demoOrder.id}-kot-${ticketSeq}` },
        update: {},
        create: {
          id: `${demoOrder.id}-kot-${ticketSeq}`,
          orderId: order.id,
          stationId: stationId ?? undefined,
          ticketNumber: `${demoOrder.orderNumber}-${ticketSeq}`,
          status: itemStatus,
          ...(demoOrder.paid
            ? {
                acceptedAt: new Date(),
                readyAt: new Date(),
                servedAt: new Date(),
              }
            : {}),
        },
      });
      ticketSeq += 1;
      for (const item of items) {
        await prisma.kotItem.upsert({
          where: { id: `${kot.id}-${item.id}` },
          update: {},
          create: {
            id: `${kot.id}-${item.id}`,
            kotId: kot.id,
            orderItemId: item.id,
            status: itemStatus,
          },
        });
      }
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

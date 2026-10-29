/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Subscription Quota & Boundaries End-to-End (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: ReturnType<typeof request.agent>;
  let originalRestaurantState: {
    subscriptionPlan: SubscriptionPlan;
    subscriptionStatus: SubscriptionStatus;
    maxTables: number;
    maxStaff: number;
    maxBranches: number;
    kdsEnabled: boolean;
    customBrandingEnabled: boolean;
  };

  const BRANCH_ID = 'demo-branch';
  const RESTAURANT_ID = 'demo-restaurant';

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () =>
          Promise.resolve({
            totalHits: 1,
            timeToExpire: 60,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .compile();

    app = mod.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api', { exclude: [] });
    await app.init();

    prisma = app.get(PrismaService);

    // Save original state of demo-restaurant
    const current = await prisma.restaurant.findUniqueOrThrow({
      where: { id: RESTAURANT_ID },
    });
    originalRestaurantState = {
      subscriptionPlan: current.subscriptionPlan,
      subscriptionStatus: current.subscriptionStatus,
      maxTables: current.maxTables,
      maxStaff: current.maxStaff,
      maxBranches: current.maxBranches,
      kdsEnabled: current.kdsEnabled,
      customBrandingEnabled: current.customBrandingEnabled,
    };

    // Authenticate owner agent
    owner = request.agent(app.getHttpServer());
    await owner
      .post('/api/v1/auth/login')
      .send({ email: 'owner@demo.local', password: 'Password123!' })
      .expect(201);
  });

  afterAll(async () => {
    // Restore original state
    await prisma.restaurant.update({
      where: { id: RESTAURANT_ID },
      data: originalRestaurantState,
    });
    await app.close();
  });

  it('1. Rejects bulk table creation when exceeding maxTables on FREE tier (HTTP 400)', async () => {
    // Put restaurant into FREE plan with maxTables = 5
    await prisma.restaurant.update({
      where: { id: RESTAURANT_ID },
      data: {
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        maxTables: 5,
        maxStaff: 3,
        kdsEnabled: false,
        customBrandingEnabled: false,
      },
    });

    const currentTables = await prisma.table.count({
      where: { floor: { branch: { restaurantId: RESTAURANT_ID } } },
    });

    const floors = (
      await owner.get(`/api/v1/tables/floors?branchId=${BRANCH_ID}`).expect(200)
    ).body as { id: string }[];
    const floorId = floors[0].id;

    // Try to create bulk tables exceeding the 5 limit
    const excessCount = Math.max(1, 6 - currentTables);
    const tableNumbers = Array.from(
      { length: excessCount + 2 },
      (_, i) => `EX-${Date.now()}-${i}`,
    );

    const res = await owner
      .post(`/api/v1/tables/bulk?branchId=${BRANCH_ID}`)
      .send({
        floorId,
        numbers: tableNumbers,
        capacity: 4,
        shape: 'square',
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toContain('Table limit reached for your FREE plan (5 tables maximum)');
    expect(res.body.message).toContain('Upgrade your subscription to add more tables');
  });

  it('2. Rejects staff creation exceeding maxStaff on FREE tier (HTTP 400)', async () => {
    // Set maxStaff to current count so the next creation fails
    const currentStaffCount = await prisma.user.count({
      where: { restaurantId: RESTAURANT_ID },
    });

    await prisma.restaurant.update({
      where: { id: RESTAURANT_ID },
      data: {
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        maxStaff: currentStaffCount,
      },
    });

    const roles = (
      await owner.get('/api/v1/users/roles').expect(200)
    ).body as { id: string; name: string }[];
    const waiterRole = roles.find((r) => r.name === 'WAITER')!;

    const res = await owner
      .post('/api/v1/users')
      .send({
        name: 'Extra Waiter Exceed',
        email: `exceed-${Date.now()}@stress.local`,
        password: 'Password123!',
        roleId: waiterRole.id,
        branchIds: [BRANCH_ID],
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toContain(
      `Staff limit reached for your FREE plan (${currentStaffCount} staff members maximum)`,
    );
    expect(res.body.message).toContain('Upgrade your subscription to add more staff');
  });

  it('3. Rejects KDS stations and tickets access when kdsEnabled = false (HTTP 403)', async () => {
    await prisma.restaurant.update({
      where: { id: RESTAURANT_ID },
      data: {
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        kdsEnabled: false,
      },
    });

    // Test GET /api/v1/kds/stations
    const resStations = await owner
      .get(`/api/v1/kds/stations?branchId=${BRANCH_ID}`)
      .expect(403);

    expect(resStations.body.statusCode).toBe(403);
    expect(resStations.body.message).toContain(
      'Kitchen Display System (KDS) is not included in your FREE plan. Upgrade to Starter, Pro, or Enterprise to unlock KDS.',
    );

    // Test GET /api/v1/kds/tickets
    const resTickets = await owner
      .get(`/api/v1/kds/tickets?branchId=${BRANCH_ID}`)
      .expect(403);

    expect(resTickets.body.statusCode).toBe(403);
    expect(resTickets.body.message).toContain(
      'Kitchen Display System (KDS) is not included in your FREE plan. Upgrade to Starter, Pro, or Enterprise to unlock KDS.',
    );
  });

  it('4. Rejects custom branding upload when customBrandingEnabled = false (HTTP 403)', async () => {
    await prisma.restaurant.update({
      where: { id: RESTAURANT_ID },
      data: {
        subscriptionPlan: 'FREE',
        subscriptionStatus: 'ACTIVE',
        customBrandingEnabled: false,
      },
    });

    // Test POST /api/v1/settings/restaurant/logo
    const resLogo = await owner
      .post('/api/v1/settings/restaurant/logo')
      .expect(403);

    expect(resLogo.body.statusCode).toBe(403);
    expect(resLogo.body.message).toContain(
      'Custom branding is not included in your FREE plan. Upgrade to Pro or Enterprise to customize logos and themes.',
    );

    // Test PATCH /api/v1/settings/restaurant with logoUrl
    const resSettings = await owner
      .patch('/api/v1/settings/restaurant')
      .send({ logoUrl: 'https://cdn.restaurant.local/logo.png' })
      .expect(403);

    expect(resSettings.body.statusCode).toBe(403);
    expect(resSettings.body.message).toContain(
      'Custom branding is not included in your FREE plan. Upgrade to Pro or Enterprise to customize logos and themes.',
    );
  });
});

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async rate(customerId: string, orderId: string, stars: number, comment?: string) {
    return this.prisma.tx(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.customerId !== customerId) throw Errors.notFound('Order');
      if (order.status !== 'COMPLETED' || !order.driverId) throw Errors.conflict('not_completed', 'You can rate the driver once the order is complete');
      await tx.$queryRaw`SELECT id FROM drivers WHERE id = ${order.driverId}::uuid FOR UPDATE`;
      let rating;
      try {
        rating = await tx.rating.create({ data: { orderId, customerId, driverId: order.driverId, stars, comment } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw Errors.conflict('already_rated', 'You already rated this order');
        throw err;
      }
      const agg = await tx.rating.aggregate({ where: { driverId: order.driverId }, _avg: { stars: true }, _count: true });
      await tx.driver.update({ where: { id: order.driverId }, data: { ratingAvg: Math.round((agg._avg.stars ?? 0) * 100) / 100, ratingCount: agg._count } });
      return rating;
    });
  }
}

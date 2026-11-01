import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    // Text protocol: with prepared statements the adapter turns their cache off, so every query
    // prepares, runs and closes its statement and then waits ~40 ms for the server (measured
    // 1/11: a Prisma update took ~150 ms, a stock movement's transaction ~450 ms; now ~13 ms).
    const adapter = new PrismaMariaDb(
      configService.getOrThrow<string>('DATABASE_URL'),
      { useTextProtocol: true },
    );
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

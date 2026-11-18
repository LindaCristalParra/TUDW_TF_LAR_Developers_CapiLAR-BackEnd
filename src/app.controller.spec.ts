import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  const prisma = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('returns ok when the database answers', async () => {
      prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
      await expect(appController.health()).resolves.toEqual({ status: 'ok' });
    });

    it('returns 503 without the database error when it does not answer', async () => {
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      prisma.$queryRaw.mockRejectedValue(
        new Error('connect ECONNREFUSED 10.0.0.5:3306'),
      );

      const error: unknown = await appController.health().catch((e) => e);

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(
        JSON.stringify((error as ServiceUnavailableException).getResponse()),
      ).not.toContain('ECONNREFUSED');
      expect(log).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
      log.mockRestore();
    });
  });
});

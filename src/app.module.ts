import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AlergiasModule } from './alergias/alergias.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { FichasModule } from './fichas/fichas.module';
import { HairColorModule } from './hair-color/hair-color.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfesionalesModule } from './profesionales/profesionales.module';
import { SeriesModule } from './series/series.module';
import { ServiciosModule } from './servicios/servicios.module';
import { TurnosModule } from './turnos/turnos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Scheduled jobs (@Cron): F06 reminders and F07 daily agenda.
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ServiciosModule,
    AlergiasModule,
    ProfesionalesModule,
    TurnosModule,
    FichasModule,
    SeriesModule,
    // TP3, API 1: hair color try-on with YouCam.
    HairColorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

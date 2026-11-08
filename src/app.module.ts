import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AlergiasModule } from './alergias/alergias.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArticulosModule } from './articulos/articulos.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { validarEntorno } from './common/validar-entorno';
import { ComprasModule } from './compras/compras.module';
import { FichasModule } from './fichas/fichas.module';
import { HairColorModule } from './hair-color/hair-color.module';
import { MarcasModule } from './marcas/marcas.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfesionalesModule } from './profesionales/profesionales.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { ReportesModule } from './reportes/reportes.module';
import { SeriesModule } from './series/series.module';
import { ServiciosModule } from './servicios/servicios.module';
import { TurnosModule } from './turnos/turnos.module';

@Module({
  imports: [
    // validate: weak or example secrets stop the app at startup (PWA-267).
    ConfigModule.forRoot({ isGlobal: true, validate: validarEntorno }),
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
    // F11 stock.
    MarcasModule,
    ArticulosModule,
    // F13 suppliers and purchases.
    ProveedoresModule,
    ComprasModule,
    // F12 cost and margin.
    ReportesModule,
    // TP3, API 1: hair color try-on with YouCam.
    HairColorModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Every route needs a login unless it's marked @Public() (PWA-269): a new controller is
    // protected without having to remember @UseGuards. In this order: the token loads req.user,
    // then @Roles() checks it.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

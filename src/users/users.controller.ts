import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Rol } from '../generated/prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PublicUser, UsersService } from './users.service';

// Route ids must be integers; the default ParseIntPipe message is in English.
const ParseIdPipe = new ParseIntPipe({
  exceptionFactory: () => new BadRequestException('El id debe ser un número'),
});

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Each user edits their own profile (F01).
  @Patch('me')
  updateMe(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user as PublicUser, dto);
  }

  // Declared before ':id' so "me" is not parsed as an id.
  @Delete('me')
  async deactivateMe(@Req() req: Request) {
    const user = req.user as PublicUser;
    await this.usersService.deactivate(user.id, user);
    return { message: 'Tu cuenta fue dada de baja' };
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  async deactivate(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    await this.usersService.deactivate(id, req.user as PublicUser);
    return { message: 'Usuario dado de baja' };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Rol } from '../generated/prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateRolDto } from './dto/update-rol.dto';
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

  // F02: list users, with ?search=, ?rol= and ?incluirBajas=true.
  @Get()
  @Roles(Rol.ADMIN)
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll(query);
  }

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

  // F02: change a user's role (an admin can't change their own).
  @Patch(':id/rol')
  @Roles(Rol.ADMIN)
  changeRol(
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: UpdateRolDto,
    @Req() req: Request,
  ) {
    return this.usersService.changeRol(id, dto.rol, req.user as PublicUser);
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  async deactivate(@Param('id', ParseIdPipe) id: number, @Req() req: Request) {
    await this.usersService.deactivate(id, req.user as PublicUser);
    return { message: 'Usuario dado de baja' };
  }
}

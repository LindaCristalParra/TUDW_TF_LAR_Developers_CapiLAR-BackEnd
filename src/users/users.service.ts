import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Prisma, Rol, Usuario } from '../generated/prisma/client';
import {
  ahoraEnSalon,
  dateAFecha,
  esFechaValida,
  fechaADate,
} from '../common/fecha-hora';
import { ArchivoSubido, FotosService } from '../fotos/fotos.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

// Subtype rows (DER: Cliente / Profesional) loaded with the user.
const perfilInclude = {
  cliente: true,
  profesional: true,
} satisfies Prisma.UsuarioInclude;

export type UsuarioConPerfil = Prisma.UsuarioGetPayload<{
  include: typeof perfilInclude;
}>;

// fechaNacimiento travels as "YYYY-MM-DD" (or null), like the other dates of the API.
export type PublicUser = Omit<
  UsuarioConPerfil,
  'contrasena' | 'resetToken' | 'resetTokenExpira' | 'fechaNacimiento'
> & { fechaNacimiento: string | null };

const FECHA_NACIMIENTO_MINIMA = '1900-01-01';

// What the salon needs to pick a client when booking: no role, dates or tokens.
const clienteResumenSelect = {
  id: true,
  nombre: true,
  apellido: true,
  email: true,
  telefono: true,
  cliente: { select: { alergia: true, foto: true } },
} satisfies Prisma.UsuarioSelect;

export type ClienteResumen = Prisma.UsuarioGetPayload<{
  select: typeof clienteResumenSelect;
}>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fotosService: FotosService,
  ) {}

  create(data: Prisma.UsuarioCreateInput): Promise<UsuarioConPerfil> {
    return this.prisma.usuario.create({ data, include: perfilInclude });
  }

  findByEmail(email: string): Promise<UsuarioConPerfil | null> {
    return this.prisma.usuario.findUnique({
      where: { email },
      include: perfilInclude,
    });
  }

  findById(id: number): Promise<UsuarioConPerfil | null> {
    return this.prisma.usuario.findUnique({
      where: { id },
      include: perfilInclude,
    });
  }

  async updateProfile(
    user: PublicUser,
    dto: UpdateProfileDto,
  ): Promise<PublicUser> {
    const email = dto.email?.toLowerCase();
    if (email && email !== user.email && (await this.findByEmail(email))) {
      throw new ConflictException('El email ya está registrado');
    }
    // By role, not by the Cliente row: that row is kept when a client is promoted.
    if (dto.alergia !== undefined && user.rol !== Rol.CLIENTE) {
      throw new BadRequestException('Solo los clientes pueden cargar alergias');
    }

    const alergia = dto.alergia || null;
    const updated = await this.prisma.usuario.update({
      where: { id: user.id },
      data: {
        nombre: dto.nombre,
        apellido: dto.apellido,
        email,
        telefono: dto.telefono,
        // undefined keeps it, null clears it.
        fechaNacimiento:
          dto.fechaNacimiento === undefined || dto.fechaNacimiento === null
            ? dto.fechaNacimiento
            : this.fechaNacimientoADate(dto.fechaNacimiento),
        cliente:
          dto.alergia === undefined
            ? undefined
            : { upsert: { create: { alergia }, update: { alergia } } },
      },
      include: perfilInclude,
    });
    return this.toPublic(updated);
  }

  // F02: user list for admins.
  async findAll(query: ListUsersQueryDto): Promise<PublicUser[]> {
    const users = await this.prisma.usuario.findMany({
      where: {
        rol: query.rol,
        fechaBaja: query.incluirBajas ? undefined : null,
        OR: query.search
          ? [
              { nombre: { contains: query.search } },
              { apellido: { contains: query.search } },
              { email: { contains: query.search } },
            ]
          : undefined,
      },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      include: perfilInclude,
    });
    return users.map((user) => this.toPublic(user));
  }

  // Active clients, for PROFESIONAL / ADMIN to book a turno on their behalf.
  findClientes(search?: string): Promise<ClienteResumen[]> {
    return this.prisma.usuario.findMany({
      where: {
        rol: Rol.CLIENTE,
        fechaBaja: null,
        OR: search
          ? [
              { nombre: { contains: search } },
              { apellido: { contains: search } },
              { email: { contains: search } },
            ]
          : undefined,
      },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      select: clienteResumenSelect,
    });
  }

  // F02: role change. The current role (Usuario.rol) is the "estado del rol" F02 asks for.
  async changeRol(
    id: number,
    rol: Rol,
    actor: PublicUser,
  ): Promise<PublicUser> {
    // An admin can't change their own role, so there is always at least one admin.
    if (id === actor.id) {
      throw new ForbiddenException('No podés cambiar tu propio rol');
    }

    const user = await this.findById(id);
    if (!user || user.fechaBaja !== null) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (user.rol === rol) {
      throw new BadRequestException(`El usuario ya tiene el rol ${rol}`);
    }

    const updated = await this.prisma.usuario.update({
      where: { id },
      data: {
        rol,
        // Subtype rows are created when missing and never deleted (ARQ-01):
        // a professional demoted and promoted again keeps the same legajo.
        profesional:
          rol === Rol.PROFESIONAL && !user.profesional
            ? { create: {} }
            : undefined,
        cliente:
          rol === Rol.CLIENTE && !user.cliente ? { create: {} } : undefined,
      },
      include: perfilInclude,
    });
    return this.toPublic(updated);
  }

  // Logical delete (ARQ-01): the row stays, fechaBaja blocks login and any
  // token still in use (JwtStrategy reloads the user on every request).
  async deactivate(id: number, actor: PublicUser): Promise<void> {
    // An admin can't remove themselves, so there is always at least one admin.
    if (id === actor.id && actor.rol === Rol.ADMIN) {
      throw new ForbiddenException(
        'Un administrador no puede darse de baja a sí mismo',
      );
    }

    const user = await this.findById(id);
    if (!user || user.fechaBaja !== null) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.prisma.usuario.update({
      where: { id },
      data: { fechaBaja: new Date(), resetToken: null, resetTokenExpira: null },
    });
  }

  // Undoes a logical delete: the user can log in again with the same account.
  async reactivate(id: number): Promise<PublicUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (user.fechaBaja === null) {
      throw new BadRequestException('El usuario ya está activo');
    }

    const updated = await this.prisma.usuario.update({
      where: { id },
      data: { fechaBaja: null },
      include: perfilInclude,
    });
    return this.toPublic(updated);
  }

  // Replaces the photo of the actor's profile; the old file is removed afterwards.
  async cambiarFoto(
    actor: PublicUser,
    archivo: ArchivoSubido | undefined,
  ): Promise<PublicUser> {
    const perfil = this.perfilConFoto(actor);
    const nombre = await this.fotosService.guardar(archivo);
    let updated: UsuarioConPerfil;
    try {
      updated = await this.prisma.usuario.update({
        where: { id: actor.id },
        data:
          perfil === 'cliente'
            ? {
                cliente: {
                  upsert: {
                    create: { foto: nombre },
                    update: { foto: nombre },
                  },
                },
              }
            : { profesional: { update: { foto: nombre } } },
        include: perfilInclude,
      });
    } catch (error) {
      await this.fotosService.borrar(nombre);
      throw error;
    }
    await this.fotosService.borrar(actor[perfil]?.foto);
    return this.toPublic(updated);
  }

  async quitarFoto(actor: PublicUser): Promise<PublicUser> {
    const perfil = this.perfilConFoto(actor);
    const anterior = actor[perfil]?.foto;
    if (!anterior) {
      throw new NotFoundException('No tenés foto de perfil');
    }
    const updated = await this.prisma.usuario.update({
      where: { id: actor.id },
      data: { [perfil]: { update: { foto: null } } },
      include: perfilInclude,
    });
    await this.fotosService.borrar(anterior);
    return this.toPublic(updated);
  }

  // The user's own photo, or any user's for the salon (PROFESIONAL / ADMIN).
  // A client asking for someone else's gets 404, so ids don't leak.
  async verFoto(id: number, actor: PublicUser): Promise<StreamableFile> {
    const user =
      actor.id === id || actor.rol !== Rol.CLIENTE
        ? await this.findById(id)
        : null;
    if (!user || user.fechaBaja !== null) {
      throw new NotFoundException('Usuario no encontrado');
    }
    const perfil = this.tienePerfilConFoto(user);
    return this.fotosService.leer(perfil ? user[perfil]?.foto : null);
  }

  // Photos belong to the profile of the current role: Cliente for a CLIENTE,
  // Profesional for a PROFESIONAL. An ADMIN has none.
  private tienePerfilConFoto(
    user: Pick<UsuarioConPerfil, 'rol' | 'profesional'>,
  ): 'cliente' | 'profesional' | null {
    if (user.rol === Rol.CLIENTE) {
      return 'cliente';
    }
    if (user.rol === Rol.PROFESIONAL && user.profesional) {
      return 'profesional';
    }
    return null;
  }

  private perfilConFoto(
    user: Pick<UsuarioConPerfil, 'rol' | 'profesional'>,
  ): 'cliente' | 'profesional' {
    const perfil = this.tienePerfilConFoto(user);
    if (!perfil) {
      throw new BadRequestException('El ADMIN no tiene foto de perfil');
    }
    return perfil;
  }

  toPublic(user: UsuarioConPerfil): PublicUser {
    const {
      contrasena: _contrasena,
      resetToken: _resetToken,
      resetTokenExpira: _resetTokenExpira,
      fechaNacimiento,
      ...publicUser
    } = user;
    return {
      ...publicUser,
      fechaNacimiento: fechaNacimiento ? dateAFecha(fechaNacimiento) : null,
    };
  }

  /** "YYYY-MM-DD" -> Date for the DATE column. 400 unless it is a real past date. */
  fechaNacimientoADate(fecha: string): Date {
    if (!esFechaValida(fecha)) {
      throw new BadRequestException('La fecha de nacimiento no es válida');
    }
    if (fecha >= ahoraEnSalon().fecha) {
      throw new BadRequestException(
        'La fecha de nacimiento tiene que ser anterior a hoy',
      );
    }
    if (fecha < FECHA_NACIMIENTO_MINIMA) {
      throw new BadRequestException(
        'La fecha de nacimiento no puede ser anterior a 1900',
      );
    }
    return fechaADate(fecha);
  }

  setResetToken(id: number, tokenHash: string, expira: Date): Promise<Usuario> {
    return this.prisma.usuario.update({
      where: { id },
      data: { resetToken: tokenHash, resetTokenExpira: expira },
    });
  }

  findByResetToken(tokenHash: string): Promise<Usuario | null> {
    return this.prisma.usuario.findFirst({ where: { resetToken: tokenHash } });
  }

  // Clears the reset token too, so each token can only be used once.
  updatePassword(id: number, contrasenaHash: string): Promise<Usuario> {
    return this.prisma.usuario.update({
      where: { id },
      data: {
        contrasena: contrasenaHash,
        resetToken: null,
        resetTokenExpira: null,
      },
    });
  }
}

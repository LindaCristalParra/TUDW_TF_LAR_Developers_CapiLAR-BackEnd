// Creates the first ADMIN so a new environment can manage users without editing the database,
// and some stock (F11) to try the app. Run with `npx prisma db seed`.
// Reads ADMIN_EMAIL and ADMIN_PASSWORD from .env.
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import {
  EstadoRemito,
  PrismaClient,
  Rol,
  TipoDeposito,
  TipoRemito,
  TipoProducto,
  UnidadInsumo,
  UsoArticulo,
} from '../src/generated/prisma/client';
import { urlConCachePreparadas } from '../src/prisma/database-url';

const BCRYPT_SALT_ROUNDS = 10;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not defined in .env`);
  }
  return value;
}

async function seedAdmin(prisma: PrismaClient) {
  // Without ADMIN_EMAIL: fine only if the database already has an active admin (e.g. a local one
  // made earlier). Otherwise it fails loudly, so a misconfigured deploy never ends up adminless.
  if (!process.env.ADMIN_EMAIL?.trim()) {
    const admins = await prisma.usuario.count({
      where: { rol: Rol.ADMIN, fechaBaja: null },
    });
    if (admins === 0) {
      throw new Error(
        'ADMIN_EMAIL is not defined in .env and the database has no admin',
      );
    }
    console.warn(
      `Seed: WARNING ADMIN_EMAIL is not set; the database already has ${admins} admin(s), admin skipped.`,
    );
    return;
  }
  const email = requireEnv('ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('ADMIN_PASSWORD');

  // Never overwrite an existing account (its password or role).
  const existing = await prisma.usuario.findUnique({ where: { email } });
  if (existing) {
    console.log(
      `Seed: ${email} already exists (rol ${existing.rol}), skipped.`,
    );
    return;
  }

  await prisma.usuario.create({
    data: {
      nombre: 'Admin',
      apellido: 'CapiLAR',
      email,
      telefono: process.env.ADMIN_TELEFONO?.trim() ?? '',
      contrasena: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS),
      rol: Rol.ADMIN,
    },
  });
  console.log(`Seed: admin ${email} created.`);
}

// Same format as ArticulosService: "ART-" + 8 characters without 0/O or 1/I/L.
const QR_LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function nuevoQr(): string {
  let codigo = '';
  for (let i = 0; i < 8; i++) {
    codigo += QR_LETRAS[randomInt(QR_LETRAS.length)];
  }
  return `ART-${codigo}`;
}

interface ArticuloSeed {
  nombre: string;
  codigo?: string;
  uso: UsoArticulo;
  tipoProducto: TipoProducto;
  precioCosto: number;
  pesoInicial: number;
  tipoPeso: UnidadInsumo;
  tipoDeposito: TipoDeposito;
  stock: number;
  stockMinAlert: number;
  tonalidad?: string;
}

const { SALON, VENTA, AMBOS } = UsoArticulo;
const { G, ML, UNIDAD } = UnidadInsumo;

// Items that are sold need a sale price (ArticulosService). The lists only bring the cost, so the
// seed makes one up for testing: cost + 60 %, rounded to $100. Salon-only items get none.
function precioVentaDePrueba(articulo: ArticuloSeed): number | null {
  return articulo.uso === SALON
    ? null
    : Math.round((articulo.precioCosto * 1.6) / 100) * 100;
}

// A 60 g colour tube used in the salon. The minimum is 0: a tone is only "low" once it runs out.
function tintura(
  tono: string,
  nombre: string,
  stock: number,
  precioCosto = 7440,
): ArticuloSeed {
  return {
    nombre: nombre.startsWith('Corrector')
      ? nombre
      : `Tintura ${tono} ${nombre}`,
    uso: SALON,
    tipoProducto: 'TINTURA',
    precioCosto,
    pesoInicial: 60,
    tipoPeso: G,
    tipoDeposito: 'SALON',
    stock,
    stockMinAlert: 0,
    tonalidad: tono,
  };
}

// Question Professional tubes from the Ruben Morado purchase: [tone, name, quantity, cost?].
// The 5.3 came twice (7440 and 8400): one item with both tubes and the latest price.
const TINTURAS_QUESTION: [string, string, number, number?][] = [
  ['1', 'Negro', 1],
  ['5.00', 'Castaño Claro Profundo', 2],
  ['5.3', 'Castaño Claro Dorado', 2, 8400],
  ['5.53', 'Castaño Claro Chocolate', 1],
  ['5ME', 'Castaño Claro Marrón Elemental', 1],
  ['5MK', 'Castaño Claro Moka Mousse', 1],
  ['6.23', 'Rubio Oscuro Marrón Profundo', 2],
  ['6.3', 'Rubio Oscuro Dorado', 1],
  ['6.31', 'Rubio Oscuro Dorado Beige', 2],
  ['6.45', 'Rubio Oscuro Cobrizo Caoba', 1],
  ['6.52', 'Rubio Oscuro Tabaco', 2],
  ['6.53', 'Rubio Oscuro Chocolate', 1],
  ['6.6', 'Rubio Oscuro Caoba', 1],
  ['6NC', 'Rubio Oscuro Cálido', 1],
  ['7.00', 'Rubio Profundo', 2],
  ['7.17', 'Hielo Plomo', 1],
  ['7.23', 'Rubio Marrón Profundo', 2],
  ['7.3', 'Rubio Dorado', 1],
  ['7.32', 'Rubio Dorado Miel', 1],
  ['7.40', 'Rubio Cobrizo Intenso', 1],
  ['7.64', 'Rubio Rojizo Cobrizo', 2],
  ['7AV', 'Rubio Avellana', 2],
  ['7CM', 'Rubio Caramel', 1],
  ['7ME', 'Rubio Marrón Elemental', 1],
  ['8.2', 'Rubio Claro Malva', 1],
  ['8.31', 'Rubio Claro Dorado Beige', 1],
  ['8.32', 'Rubio Claro Dorado Miel', 1],
  ['8.34', 'Rubio Claro Dorado Cobrizo', 1],
  ['8.43v', 'Rubio Claro Cobrizo Dorado Vibrant', 1],
  ['8.52', 'Rubio Claro Tabaco', 2],
  ['8AV', 'Rubio Claro Avellana', 2],
  ['8NC', 'Rubio Claro Cálido', 2],
  ['9.00', 'Rubio Muy Claro Profundo', 1],
  ['9.10', 'Hielo Perla', 1],
  ['9.13', 'Rubio Muy Claro Beige', 1],
  ['9.3', 'Rubio Muy Claro Dorado', 1],
  ['10.10', 'Rubio Extra Claro Perla Metalizado', 1, 8400],
  ['10.21', 'Hielo Lila', 1],
];

// Care and styling from the Meraki price lists (August 2026): list price = what the salon pays.
const STOCK: {
  razonSocial: string;
  linea: string;
  articulos: ArticuloSeed[];
}[] = [
  {
    razonSocial: 'Fidelité',
    linea: 'Argán',
    articulos: [
      {
        nombre: 'Mythical Shampoo Argán',
        codigo: '714',
        uso: VENTA,
        tipoProducto: 'SHAMPOO',
        precioCosto: 12500,
        pesoInicial: 260,
        tipoPeso: ML,
        tipoDeposito: 'VITRINA',
        stock: 6,
        stockMinAlert: 2,
      },
      {
        nombre: 'Mythical Conditioner Argán',
        codigo: '715',
        uso: VENTA,
        tipoProducto: 'ACONDICIONADOR',
        precioCosto: 12500,
        pesoInicial: 260,
        tipoPeso: ML,
        tipoDeposito: 'VITRINA',
        stock: 4,
        stockMinAlert: 2,
      },
      {
        nombre: 'Mythical Elixir Oil Argán',
        codigo: '725',
        uso: VENTA,
        tipoProducto: 'SERUM',
        precioCosto: 36000,
        pesoInicial: 120,
        tipoPeso: ML,
        tipoDeposito: 'VITRINA',
        stock: 2,
        stockMinAlert: 1,
      },
      {
        nombre: 'Protector Térmico Capilar Argán',
        codigo: '735',
        uso: VENTA,
        tipoProducto: 'PROTECTOR_TERMICO',
        precioCosto: 30000,
        pesoInicial: 120,
        tipoPeso: ML,
        tipoDeposito: 'VITRINA',
        stock: 1,
        stockMinAlert: 1,
      },
      {
        nombre: 'Ampolla Intensive Argán',
        codigo: '720',
        uso: AMBOS,
        tipoProducto: 'AMPOLLA',
        precioCosto: 4000,
        pesoInicial: 15,
        tipoPeso: ML,
        tipoDeposito: 'SALON',
        stock: 20,
        stockMinAlert: 5,
      },
    ],
  },
  {
    razonSocial: 'Fidelité',
    linea: 'Caviar',
    articulos: [
      {
        nombre: 'Shampoo Cabellos Secos & Castigados',
        codigo: '800',
        uso: VENTA,
        tipoProducto: 'SHAMPOO',
        precioCosto: 10500,
        pesoInicial: 260,
        tipoPeso: ML,
        tipoDeposito: 'VITRINA',
        stock: 5,
        stockMinAlert: 2,
      },
      {
        nombre: 'Máscara Capilar Hidro-Nutritiva',
        codigo: '812',
        uso: VENTA,
        tipoProducto: 'MASCARA',
        precioCosto: 11000,
        pesoInicial: 250,
        tipoPeso: ML,
        tipoDeposito: 'VITRINA',
        stock: 3,
        stockMinAlert: 1,
      },
    ],
  },
  {
    razonSocial: 'Fidelité',
    linea: 'Kill Frizz',
    articulos: [
      {
        nombre: 'Shampoo Kill Frizz',
        codigo: '780',
        uso: VENTA,
        tipoProducto: 'SHAMPOO',
        precioCosto: 16000,
        pesoInicial: 260,
        tipoPeso: ML,
        tipoDeposito: 'VITRINA',
        stock: 3,
        stockMinAlert: 1,
      },
    ],
  },
  {
    razonSocial: 'Fidelité',
    linea: 'Tratamientos en Ampolla',
    articulos: [
      // Below its minimum, to see bajoStock.
      {
        nombre: 'Ampolla Complejo Keratínico',
        codigo: '502',
        uso: AMBOS,
        tipoProducto: 'AMPOLLA',
        precioCosto: 4000,
        pesoInicial: 15,
        tipoPeso: ML,
        tipoDeposito: 'SALON',
        stock: 3,
        stockMinAlert: 5,
      },
    ],
  },
  {
    razonSocial: 'Angelis',
    linea: 'Keratin Repair',
    articulos: [
      {
        nombre: 'Shampoo Keratin Repair',
        uso: VENTA,
        tipoProducto: 'SHAMPOO',
        precioCosto: 12200,
        pesoInicial: 350,
        tipoPeso: ML,
        tipoDeposito: 'VITRINA',
        stock: 4,
        stockMinAlert: 2,
      },
      {
        nombre: 'Ampolla Keratin Repair',
        uso: AMBOS,
        tipoProducto: 'AMPOLLA',
        precioCosto: 7200,
        pesoInicial: 1,
        tipoPeso: UNIDAD,
        tipoDeposito: 'SALON',
        stock: 10,
        stockMinAlert: 3,
      },
    ],
  },
  {
    razonSocial: 'Angelis',
    linea: 'Crema de Rosas',
    articulos: [
      {
        nombre: 'Tratamiento Crema de Rosas',
        uso: VENTA,
        tipoProducto: 'MASCARA',
        precioCosto: 12000,
        pesoInicial: 250,
        tipoPeso: G,
        tipoDeposito: 'VITRINA',
        stock: 2,
        stockMinAlert: 1,
      },
    ],
  },
  // Colour, from a purchase to Ruben Morado (20/10/2026): the bought quantity is the stock.
  {
    razonSocial: 'Question Professional',
    linea: 'Coloración',
    articulos: [
      ...TINTURAS_QUESTION.map(([tono, nombre, stock, precioCosto]) =>
        tintura(tono, nombre, stock, precioCosto),
      ),
      tintura('Mix Rojo', 'Corrector Mix Rojo', 1),
      {
        nombre: 'Oxidante en crema 20 vol',
        uso: SALON,
        tipoProducto: 'OXIDANTE',
        precioCosto: 18500,
        pesoInicial: 900,
        tipoPeso: ML,
        tipoDeposito: 'DEPOSITO',
        stock: 1,
        stockMinAlert: 1,
        tonalidad: '20 vol',
      },
      {
        nombre: 'Oxidante en crema 30 vol',
        uso: SALON,
        tipoProducto: 'OXIDANTE',
        precioCosto: 18500,
        pesoInicial: 900,
        tipoPeso: ML,
        tipoDeposito: 'DEPOSITO',
        stock: 1,
        stockMinAlert: 1,
        tonalidad: '30 vol',
      },
    ],
  },
  {
    razonSocial: 'Question Professional',
    linea: 'Lumiplex',
    articulos: [
      tintura('9.21', 'Rubio Muy Claro Malva Ceniza', 1, 8400),
      {
        nombre: 'Oxigenada Lumiplex 6 vol',
        uso: SALON,
        tipoProducto: 'OXIDANTE',
        precioCosto: 24000,
        pesoInicial: 1000,
        tipoPeso: ML,
        tipoDeposito: 'DEPOSITO',
        stock: 1,
        stockMinAlert: 1,
        tonalidad: '6 vol',
      },
    ],
  },
  {
    razonSocial: 'Question Professional',
    linea: 'Styling',
    articulos: [
      {
        nombre: 'Crema Curl Cream Style',
        uso: AMBOS,
        tipoProducto: 'PEINADO',
        precioCosto: 17000,
        pesoInicial: 235,
        tipoPeso: ML,
        tipoDeposito: 'VITRINA',
        stock: 1,
        stockMinAlert: 1,
      },
      {
        nombre: 'Termic Protect',
        uso: AMBOS,
        tipoProducto: 'PROTECTOR_TERMICO',
        precioCosto: 22000,
        pesoInicial: 240,
        tipoPeso: ML,
        tipoDeposito: 'VITRINA',
        stock: 3,
        stockMinAlert: 1,
      },
    ],
  },
  {
    razonSocial: 'Livesolut',
    linea: 'Coloración',
    articulos: [tintura('7.2', 'Rubio Malva', 1, 4800)],
  },
];

// Test data (made-up sale prices included): only with SEED_STOCK=true, so a real deploy never
// gets it by accident. Only on an empty catalog: it never duplicates or touches what the salon
// loaded. All or nothing: if one brand fails, none stays, so the next run can load it whole.
async function seedStock(prisma: PrismaClient) {
  if (process.env.SEED_STOCK?.trim() !== 'true') {
    console.log("Seed: SEED_STOCK is not 'true', test stock skipped.");
    return;
  }
  if ((await prisma.marca.count()) > 0) {
    console.log('Seed: brands already loaded, stock skipped.');
    return;
  }
  // Without repeats among themselves; an empty catalog has no items to clash with.
  const total = STOCK.reduce((n, marca) => n + marca.articulos.length, 0);
  const qrs = new Set<string>();
  while (qrs.size < total) {
    qrs.add(nuevoQr());
  }
  const libres = [...qrs];
  // Like an item created from the app, the initial stock enters as an INGRESO (by an admin).
  const admin = await prisma.usuario.findFirst({
    where: { rol: Rol.ADMIN, fechaBaja: null },
    orderBy: { id: 'asc' },
  });
  if (!admin) {
    throw new Error('The test stock needs an active admin to register it');
  }
  const stockInicial = (stock: number) =>
    stock > 0
      ? {
          create: {
            cantidad: stock,
            remito: {
              create: {
                tipo: TipoRemito.INGRESO,
                estado: EstadoRemito.APLICADO,
                motivo: 'Stock inicial',
                usuarioId: admin.id,
              },
            },
          },
        }
      : undefined;

  // ~70 inserts: Prisma's default limit (5 s) can run out against a remote database, and then
  // nothing is loaded. One minute is plenty; it's a one-off script.
  await prisma.$transaction(
    async (tx) => {
      for (const { razonSocial, linea, articulos } of STOCK) {
        await tx.marca.create({
          data: {
            razonSocial,
            linea,
            articulos: {
              create: articulos.map((articulo) => ({
                ...articulo,
                precioVenta: precioVentaDePrueba(articulo),
                qr: libres.pop()!,
                remitoDetalles: stockInicial(articulo.stock),
              })),
            },
          },
        });
      }
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
  console.log(`Seed: ${STOCK.length} brands and ${total} items created.`);
}

async function main() {
  const prisma = new PrismaClient({
    // Like PrismaService: without the statement cache every query waits ~40 ms.
    adapter: new PrismaMariaDb(
      urlConCachePreparadas(requireEnv('DATABASE_URL')),
    ),
  });
  try {
    await seedAdmin(prisma);
    await seedStock(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

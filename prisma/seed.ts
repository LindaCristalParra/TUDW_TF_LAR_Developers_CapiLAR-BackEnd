// Creates the first ADMIN so a new environment can manage users without editing the database,
// and some stock (F11) to try the app. Run with `npx prisma db seed`.
// Reads ADMIN_EMAIL and ADMIN_PASSWORD from .env.
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import {
  PrismaClient,
  Rol,
  TipoDeposito,
  TipoProducto,
  UnidadInsumo,
  UsoArticulo,
} from '../src/generated/prisma/client';

const BCRYPT_SALT_ROUNDS = 10;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not defined in .env`);
  }
  return value;
}

async function seedAdmin(prisma: PrismaClient) {
  // Optional, so a local database with its admin already made can still get the stock.
  if (!process.env.ADMIN_EMAIL?.trim()) {
    console.log('Seed: ADMIN_EMAIL is not set, admin skipped.');
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

// From the Meraki price lists (August 2026): list price = what the salon pays (precioCosto).
// The salon-size colour products aren't in those lists: they are marked "(prueba)".
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
    razonSocial: 'Fidelité',
    linea: 'Coloración',
    articulos: [
      {
        nombre: 'Tintura 7.1 Rubio Medio Ceniza (prueba)',
        uso: SALON,
        tipoProducto: 'TINTURA',
        precioCosto: 5000,
        pesoInicial: 60,
        tipoPeso: G,
        tipoDeposito: 'SALON',
        stock: 8,
        stockMinAlert: 3,
        tonalidad: '7.1',
      },
      {
        nombre: 'Oxidante 20 vol 1 L (prueba)',
        uso: SALON,
        tipoProducto: 'OXIDANTE',
        precioCosto: 9000,
        pesoInicial: 1000,
        tipoPeso: ML,
        tipoDeposito: 'DEPOSITO',
        stock: 2.5,
        stockMinAlert: 1,
      },
      {
        nombre: 'Decolorante en polvo 500 g (prueba)',
        uso: SALON,
        tipoProducto: 'DECOLORANTE',
        precioCosto: 15000,
        pesoInicial: 500,
        tipoPeso: G,
        tipoDeposito: 'DEPOSITO',
        stock: 1,
        stockMinAlert: 1,
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
];

// Only on an empty catalog: it never duplicates or touches what the salon loaded.
async function seedStock(prisma: PrismaClient) {
  if ((await prisma.marca.count()) > 0) {
    console.log('Seed: brands already loaded, stock skipped.');
    return;
  }
  let articulos = 0;
  for (const { razonSocial, linea, articulos: lista } of STOCK) {
    await prisma.marca.create({
      data: {
        razonSocial,
        linea,
        articulos: {
          create: lista.map((articulo) => ({ ...articulo, qr: nuevoQr() })),
        },
      },
    });
    articulos += lista.length;
  }
  console.log(`Seed: ${STOCK.length} brands and ${articulos} items created.`);
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(requireEnv('DATABASE_URL')),
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

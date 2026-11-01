import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { urlConCachePreparadas } from './database-url';

// The adapter's connect() creates the driver's pool: capture what it receives instead of connecting.
const createPool = jest.fn<object, [string]>(() => ({
  query: () => Promise.resolve([['8.4.0']]),
  end: () => Promise.resolve(),
}));
jest.mock('mariadb', () => ({
  ...jest.requireActual<object>('mariadb'),
  createPool: (config: string) => createPool(config),
}));

// The driver's own parsing of a connection string (what the pool really uses).
interface OpcionesDriver {
  prepareCacheLength: number;
  user: string;
  password: string;
  host: string;
  database: string;
}
const ConnectionOptions = jest.requireActual<
  new (opts: string) => OpcionesDriver
>('mariadb/lib/config/connection-options');

const URL_BASE =
  'mysql://root:p%40ss%3Aw%2Frd@localhost:3306/capilar_db?allowPublicKeyRetrieval=true';

/** The options the driver ends up with when the adapter gets this URL. */
async function opcionesDelDriver(url: string): Promise<OpcionesDriver> {
  createPool.mockClear();
  await new PrismaMariaDb(url).connect();
  return new ConnectionOptions(createPool.mock.calls[0][0]);
}
const cacheDelDriver = async (url: string) =>
  (await opcionesDelDriver(url)).prepareCacheLength;

describe('urlConCachePreparadas', () => {
  it('turns the cache on and keeps the rest of the URL', () => {
    const url = new URL(urlConCachePreparadas(URL_BASE));
    expect(url.searchParams.get('prepareCacheLength')).toBe('256');
    expect(url.searchParams.get('allowPublicKeyRetrieval')).toBe('true');
    expect(decodeURIComponent(url.password)).toBe('p@ss:w/rd');
    expect(url.pathname).toBe('/capilar_db');
  });

  it('respects a value already in the URL', () => {
    const url = urlConCachePreparadas(`${URL_BASE}&prepareCacheLength=10`);
    expect(new URL(url).searchParams.getAll('prepareCacheLength')).toEqual([
      '10',
    ]);
  });

  it('works without other parameters', () => {
    expect(urlConCachePreparadas('mysql://u:p@db:3306/capilar_db')).toBe(
      'mysql://u:p@db:3306/capilar_db?prepareCacheLength=256',
    );
  });

  // If an adapter update starts overriding the URL, the app still works but every query waits
  // ~40 ms again, silently: this is the check that would notice.
  it('reaches the driver through the adapter', async () => {
    expect(await cacheDelDriver(urlConCachePreparadas(URL_BASE))).toBe(256);
  });

  it('is needed: without it the adapter turns the cache off', async () => {
    expect(await cacheDelDriver(URL_BASE)).toBe(0);
  });

  // new URL() re-encodes some characters of the user info: the driver decodes them back, so the
  // credentials it ends up with must be exactly the ones it got without this function.
  it.each([
    'p%40ss%3Aw%2Frd', // encoded @ : /
    'a%23b%3Fc%25d%20e', // encoded # ? % and a space
    'a;b=c[d]e^f|g`h{i}j"k\'l!m*n(o)p$q,r~s', // left as they are, some re-encoded by new URL()
    '%C3%B1and%C3%BA%F0%9F%98%80', // ñandú and an emoji, encoded
    'ñandú', // not encoded
    '', // no password
  ])('keeps the credentials the driver gets (password %j)', async (clave) => {
    const url = `mysql://us%40er:${clave}@db.example.com:3307/capi_db?allowPublicKeyRetrieval=true`;
    const sin = await opcionesDelDriver(url);
    const con = await opcionesDelDriver(urlConCachePreparadas(url));
    expect(con.password).toBe(sin.password);
    expect([con.user, con.host, con.database]).toEqual([
      'us@er',
      'db.example.com',
      'capi_db',
    ]);
  });
});

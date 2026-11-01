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
const ConnectionOptions = jest.requireActual<
  new (opts: string) => { prepareCacheLength: number }
>('mariadb/lib/config/connection-options');

const URL_BASE =
  'mysql://root:p%40ss%3Aw%2Frd@localhost:3306/capilar_db?allowPublicKeyRetrieval=true';

/** The prepareCacheLength the driver ends up with when the adapter gets this URL. */
async function cacheDelDriver(url: string): Promise<number> {
  createPool.mockClear();
  await new PrismaMariaDb(url).connect();
  const config = createPool.mock.calls[0][0];
  return new ConnectionOptions(config).prepareCacheLength;
}

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
});

// The MariaDB adapter turns the driver's prepared statement cache off (prepareCacheLength=0), so
// every query prepares, runs and closes its statement and then waits ~40 ms for the server
// (measured 1/11: a Prisma update took ~150 ms, a stock movement's transaction ~450 ms). With the
// cache on (the driver's own default, 256 per connection) the transaction takes ~12 ms.
// Not the adapter's useTextProtocol: then the driver escapes parameters itself, always with
// backslashes, which a server with sql_mode NO_BACKSLASH_ESCAPES reads differently (SQL injection).
// Prepared statements send parameters apart from the SQL, whatever the server's mode.
const PREPARE_CACHE_LENGTH = '256';

/** DATABASE_URL with the prepared statement cache on, unless the URL already sets it. */
export function urlConCachePreparadas(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has('prepareCacheLength')) {
    url.searchParams.set('prepareCacheLength', PREPARE_CACHE_LENGTH);
  }
  return url.toString();
}

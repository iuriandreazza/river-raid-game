import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { isIP } from 'node:net';

/** Tells who is calling, for the rate limit and the logs; undefined when there is no way to tell. */
export type ClientAddressResolver = (c: Context) => string | undefined;

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // getConnInfo throws when no Node socket stands behind the request, as with app.request().
    return undefined;
  }
}

function forwardedAddress(header: string | undefined, proxies: number): string | undefined {
  const entries = (header ?? '').split(',').map((entry) => entry.trim());
  const entry = entries[entries.length - proxies];
  // Only an IP literal is a usable key: anything else must not become an unbounded set of keys. A proxy that appends
  // `ip:port` therefore falls back to the socket, and all of its clients share the proxy's allowance.
  return entry !== undefined && isIP(entry) !== 0 ? entry : undefined;
}

/**
 * X-Forwarded-For is a list that every proxy extends with the address it received the request from, and a client can
 * start the list with anything it likes. Behind `trustProxy` proxies that append to it, the entry the first of them
 * added is the `trustProxy`-th from the right, and it is the only one that can be believed. With no proxy in front of
 * the server the header is ignored: it is nothing but text typed by the client. Whenever the header does not hold what
 * it should, the address of the socket is used.
 */
export function createClientAddressResolver(trustProxy: number): ClientAddressResolver {
  return (c) => {
    if (trustProxy > 0) {
      const forwarded = forwardedAddress(c.req.header('x-forwarded-for'), trustProxy);
      if (forwarded !== undefined) {
        return forwarded;
      }
    }
    return socketAddress(c);
  };
}

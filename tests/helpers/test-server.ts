import { NextRequest } from 'next/server';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';

/**
 * Creates an HTTP server instance that translates Node standard HTTP requests
 * into NextRequest objects, invokes the supplied Next.js API route handler,
 * and writes the NextResponse back to the Node HTTP response.
 * 
 * Allows using `supertest(createTestApp(GET))` directly for API integration testing.
 */
export function createTestApp(handler: (req: NextRequest, ...args: any[]) => Promise<Response>) {
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      // 1. Reconstruct Headers
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else if (value) {
          headers.append(key, value);
        }
      }

      // 2. Extract Request Body
      let body: Buffer | undefined = undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        body = Buffer.concat(chunks);
      }

      // 3. Construct NextRequest
      const url = `http://${req.headers.host || 'localhost'}${req.url}`;
      const nextReq = new NextRequest(url, {
        method: req.method,
        headers,
        body: body as any,
      });

      // 4. Manually parse and override cookies for the test environment
      const cookieHeader = req.headers.cookie || '';
      const cookieMap = new Map<string, any>();
      if (cookieHeader) {
        cookieHeader.split(';').forEach(str => {
          const parts = str.split('=');
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            cookieMap.set(key, { name: key, value });
          }
        });
      }

      Object.defineProperty(nextReq, 'cookies', {
        value: {
          has: (name: string) => cookieMap.has(name),
          get: (name: string) => cookieMap.get(name),
          getAll: () => Array.from(cookieMap.values())
        },
        writable: true
      });

      // 5. Use Proxy to override headers.get to prevent the fetch Request constructor from stripping content-length
      const headersProxy = new Proxy(nextReq.headers, {
        get(target, prop, receiver) {
          if (prop === 'get') {
            return (name: string) => {
              if (name.toLowerCase() === 'content-length' && req.headers['content-length']) {
                return req.headers['content-length'] as string;
              }
              return target.get(name);
            };
          }
          const val = Reflect.get(target, prop, receiver);
          return typeof val === 'function' ? val.bind(target) : val;
        }
      });

      Object.defineProperty(nextReq, 'headers', {
        value: headersProxy,
        writable: true,
        configurable: true
      });

      // 6. Execute next.js handler
      const response = await handler(nextReq);

      // 7. Return status, headers, and body
      res.statusCode = response.status;
      response.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      const text = await response.text();
      res.end(text);
    } catch (err: any) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message || String(err) }));
    }
  });
}

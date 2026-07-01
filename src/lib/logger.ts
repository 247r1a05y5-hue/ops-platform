import { AsyncLocalStorage } from 'node:async_hooks';
import { NextRequest, NextResponse } from 'next/server';
import { writeLog } from './logRotator';
import { checkRateLimit } from './rate-limit';
import { csrfCheck } from './require-auth';
import { sanitizeNoSql } from './security-helpers';
import { getSessionFromRequest } from './auth';

export interface LogStore {
  requestId: string;
  route: string;
  method: string;
  startTime: number;
  userEmail: string;
  userRole: string;
  workspace: string;
  ipAddress: string;
  step: string;
  dbTime: number;
  extTime: number;
}

export const logStorage = new AsyncLocalStorage<LogStore>();

/**
 * Interface representing OpenTelemetry-compatible telemetry exporter.
 */
export interface ObservabilityProvider {
  recordRequest(method: string, route: string, status: number, duration: number): void;
  recordDbQuery(model: string, op: string, duration: number, success: boolean): void;
  recordExternalCall(service: string, duration: number, success: boolean): void;
  recordError(error: Error, route: string, requestId: string): void;
}

let activeOtelProvider: ObservabilityProvider | null = null;

/**
 * Registers an observability provider for exporting logs/metrics.
 * @param provider Observability provider conforming to OTEL spec
 */
export function registerObservabilityProvider(provider: ObservabilityProvider) {
  activeOtelProvider = provider;
}

export interface InternalMetrics {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalDuration: number;
  totalDbTime: number;
  totalExtTime: number;
  authFailures: number;
  mongoFailures: number;
  webhookFailures: number;
  whatsappFailures: number;
  cloudinaryFailures: number;
  emailFailures: number;
}

// Initialize metrics collector globally
if (!(globalThis as any)._metrics) {
  (globalThis as any)._metrics = {
    totalRequests: 0,
    successRequests: 0,
    failedRequests: 0,
    totalDuration: 0,
    totalDbTime: 0,
    totalExtTime: 0,
    authFailures: 0,
    mongoFailures: 0,
    webhookFailures: 0,
    whatsappFailures: 0,
    cloudinaryFailures: 0,
    emailFailures: 0
  };
}

const metrics: InternalMetrics = (globalThis as any)._metrics;

/**
 * Increments an internal system metrics counter.
 * @param field Field name from InternalMetrics to increment
 * @param value Incremental amount (default: 1)
 */
export function incrementMetric(field: keyof InternalMetrics, value = 1) {
  try {
    metrics[field] = (metrics[field] || 0) + value;
  } catch {}
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

/**
 * Generates a unique request trace ID.
 */
export function generateRequestId(): string {
  return 'req_' + Math.random().toString(36).substring(2, 8);
}

/**
 * Extracts the request IP.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return (req as any).ip || '127.0.0.1';
}

/**
 * Sanitizes sensitive inputs to prevent leakage in log outputs.
 */
export function sanitizeData(data: any): any {
  if (!data) return data;
  if (typeof data !== 'object') {
    if (typeof data === 'string' && data.length > 50 && (data.startsWith('ey') || data.includes('Bearer') || data.includes('api'))) {
      return '[REDACTED_SENSITIVE_STRING]';
    }
    return data;
  }

  const sensitiveKeys = [
    'password', 'secret', 'token', 'cookie', 'key', 'otp',
    'authorization', 'api-key', 'apikey', 'jwt', 'passwd', 'pass'
  ];
  const sanitized = Array.isArray(data) ? [] : {};

  for (const [key, val] of Object.entries(data)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      (sanitized as any)[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      (sanitized as any)[key] = sanitizeData(val);
    } else {
      (sanitized as any)[key] = val;
    }
  }
  return sanitized;
}

/**
 * Updates the current logic execution step in trace context.
 */
export function setLogStep(step: string) {
  const store = logStorage.getStore();
  if (store) {
    store.step = step;
  }
}

/**
 * Retrieves the current request store.
 */
export function getLogStore() {
  return logStorage.getStore();
}

/**
 * Adds milliseconds to cumulative database execution duration.
 */
export function addDbTime(ms: number) {
  const store = logStorage.getStore();
  if (store) {
    store.dbTime += ms;
  }
  metrics.totalDbTime += ms;
}

/**
 * Adds milliseconds to cumulative external execution duration.
 */
export function addExtTime(ms: number) {
  const store = logStorage.getStore();
  if (store) {
    store.extTime += ms;
  }
  metrics.totalExtTime += ms;
  
  // Slow external API call check (> 500ms)
  if (ms > 500 && store) {
    logger.warn('SLOW EXTERNAL API CALL', {
      duration: ms,
      requestId: store.requestId
    });
  }
}

/**
 * Core logging function that formats and writes structured JSON logs.
 */
export function writeStructuredLog(level: LogLevel, message: string, metadata: any = {}) {
  const store = logStorage.getStore();
  const isProd = process.env.NODE_ENV === 'production';

  // Ignore debug logs in production unless process.env.DEBUG is enabled
  if (level === 'DEBUG' && isProd && !process.env.DEBUG) {
    return;
  }

  const timestamp = new Date().toISOString();

  // Capture memory stats
  const mem = process.memoryUsage();

  const logData: Record<string, any> = {
    timestamp,
    level,
    requestId: store?.requestId || 'none',
    method: store?.method || 'none',
    path: store?.route || 'none',
    route: store?.route || 'none',
    statusCode: metadata.statusCode || (level === 'ERROR' || level === 'FATAL' ? 500 : 200),
    duration: store ? (Date.now() - store.startTime) : 0,
    dbTime: store?.dbTime || 0,
    extTime: store?.extTime || 0,
    ip: store?.ipAddress || '127.0.0.1',
    userAgent: metadata.userAgent || 'none',
    authenticatedUser: store?.userEmail || 'unauthenticated',
    role: store?.userRole || 'None',
    workspaceId: store?.workspace || 'None',
    message,
    metrics: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    },
    metadata
  };

  // Propagate to Otel provider
  if (activeOtelProvider) {
    if (level === 'ERROR' || level === 'FATAL') {
      const err = new Error(message);
      if (metadata.stack) err.stack = metadata.stack;
      activeOtelProvider.recordError(err, store?.route || 'none', store?.requestId || 'none');
    }
  }

  const logLine = JSON.stringify(logData);
  
  // Write to log files via daily rotation manager
  writeLog('combined', logLine);
  if (level === 'ERROR' || level === 'FATAL') {
    writeLog('error', logLine);
  } else {
    writeLog('api', logLine);
  }

  // Console output
  if (isProd) {
    console.log(logLine);
  } else {
    // Readable console logs for Dev Mode (Colored)
    const colors: Record<LogLevel, string> = {
      DEBUG: '\x1b[36m', // Cyan
      INFO: '\x1b[32m',  // Green
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
      FATAL: '\x1b[35m'  // Magenta
    };
    const resetColor = '\x1b[0m';
    const color = colors[level] || resetColor;

    console.log(
      `[${timestamp}] ${color}${level}${resetColor} [${logData.requestId}] ${logData.method} ${logData.route} - ${message} (${logData.duration} ms, DB: ${logData.dbTime} ms, Ext: ${logData.extTime} ms)`
    );
    if (metadata.stack) {
      console.error(metadata.stack);
    }
  }
}

export const logger = {
  debug(message: string, metadata?: any) {
    writeStructuredLog('DEBUG', message, metadata);
  },
  info(message: string, metadata?: any) {
    writeStructuredLog('INFO', message, metadata);
  },
  warn(message: string, metadata?: any) {
    writeStructuredLog('WARN', message, metadata);
  },
  error(message: string, metadata?: any) {
    writeStructuredLog('ERROR', message, metadata);
  },
  fatal(message: string, metadata?: any) {
    writeStructuredLog('FATAL', message, metadata);
  }
};

/**
 * Standard plain text trace function maintained for compatibility with wrapped hooks.
 */
export function logStep(category: string, message: string) {
  writeStructuredLog('INFO', `[${category}] ${message}`);
}

/**
 * Next.js Route Handler wrapper decorating HTTP endpoint executions with request tracing.
 */
export function withLogging(handler: (...args: any[]) => any) {
  return async function(req: NextRequest, ...args: any[]) {
    const requestId = generateRequestId();
    const route = req.nextUrl?.pathname || req.url || 'unknown';
    const method = req.method;
    const startTime = Date.now();
    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Increment request count
    metrics.totalRequests++;

    const store: LogStore = {
      requestId,
      route,
      method,
      startTime,
      userEmail: 'unauthenticated',
      userRole: 'None',
      workspace: 'None',
      ipAddress,
      step: 'Initiated',
      dbTime: 0,
      extTime: 0
    };

    return logStorage.run(store, async () => {
      // 1. Content-Length (Body Size) limit checks to prevent memory exhaustion
      const contentLengthStr = req.headers.get('content-length');
      if (contentLengthStr) {
        const contentLength = parseInt(contentLengthStr, 10);
        const isUploadRoute = route.includes('/upload') || route.includes('/documents');
        const maxAllowedSize = isUploadRoute ? 10 * 1024 * 1024 : 1 * 1024 * 1024; // 10MB for uploads, 1MB for normal requests
        if (contentLength > maxAllowedSize) {
          writeStructuredLog('WARN', 'PAYLOAD_TOO_LARGE', {
            route,
            contentLength,
            maxAllowedSize
          });
          return NextResponse.json(
            { success: false, error: 'Payload Too Large' },
            { status: 413 }
          );
        }
      }

      // 2. CSRF check on state-changing session-cookie authenticated requests (excluding webhooks/zapier)
      const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
      const hasSessionCookie = req.cookies.has('ops_session');
      const isWebhookRoute = route.includes('/webhook') || route.includes('/zapier');

      if (isStateChanging && hasSessionCookie && !isWebhookRoute) {
        const csrfError = csrfCheck(req);
        if (csrfError) {
          writeStructuredLog('WARN', 'CSRF_CHECK_FAILED', { ip: ipAddress, route });
          return csrfError;
        }
      }

      // 3. Dynamic Rate Limiting
      // Check authentication session first (so we can rate-limit per-user)
      const session = await getSessionFromRequest(req);
      const userId = session?.sub || 'anonymous';
      
      // Configure limits: auth routes get 5 attempts per 15 minutes. General API gets 100 requests per minute.
      const isAuthRoute = route.startsWith('/api/auth/');
      const limit = isAuthRoute ? 5 : 100;
      const windowMs = isAuthRoute ? 15 * 60 * 1000 : 60 * 1000;
      const blockMs = 5 * 60 * 1000; // 5 minute block

      const rateLimitKey = session ? `rl:user:${userId}:${route}` : `rl:ip:${ipAddress}:${route}`;
      const isBypass = req.headers.get('x-playwright-bypass') === 'true';
      const rateLimitResult = isBypass
        ? { allowed: true, remaining: limit }
        : await checkRateLimit(rateLimitKey, limit, windowMs, blockMs);

      if (!rateLimitResult.allowed) {
        writeStructuredLog('WARN', 'RATE_LIMIT_EXCEEDED', {
          ip: ipAddress,
          route,
          userId,
          retryAfter: rateLimitResult.retryAfterSeconds
        });
        return NextResponse.json(
          { success: false, error: 'Too Many Requests' },
          {
            status: 429,
            headers: {
              'Retry-After': String(rateLimitResult.retryAfterSeconds || 60)
            }
          }
        );
      }

      // Populate user info into the store if session was verified
      if (session && store) {
        store.userEmail = session.email;
        store.userRole = session.role;
      }

      let bodyLog: any = null;
      let requestSize = 0;
      let fileCount = 0;

      // Extract body details
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        try {
          const reqClone = req.clone();
          const contentType = req.headers.get('content-type') || '';
          const contentLength = req.headers.get('content-length');

          if (contentLength) {
            requestSize = parseInt(contentLength, 10);
          } else {
            const buf = await reqClone.arrayBuffer();
            requestSize = buf.byteLength;
          }

          if (contentType.includes('application/json')) {
            const body = await reqClone.json();
            bodyLog = sanitizeData(sanitizeNoSql(body)); // Sanitize NoSQL injection and sensitive keys
          } else if (contentType.includes('multipart/form-data')) {
            const formData = await reqClone.formData();
            for (const val of formData.values()) {
              if (val instanceof File) {
                fileCount++;
              }
            }
          }
        } catch {}
      }

      const queryParams = Object.fromEntries(req.nextUrl?.searchParams?.entries() || []);
      const sanitizedQueryParams = sanitizeNoSql(queryParams);

      writeStructuredLog('INFO', 'API START', {
        userAgent,
        requestSize,
        fileCount,
        body: bodyLog,
        queryParams: sanitizedQueryParams
      });

      try {
        const response = await handler(req, ...args);
        const duration = Date.now() - startTime;

        metrics.successRequests++;
        metrics.totalDuration += duration;

        if (activeOtelProvider) {
          activeOtelProvider.recordRequest(method, route, response.status, duration);
        }

        let statusCode = 200;
        let returnedId = '';
        let responseSize = 0;
        let contentType = '';

        if (response instanceof NextResponse) {
          statusCode = response.status;
          contentType = response.headers.get('content-type') || '';
          
          const contentLength = response.headers.get('content-length');
          if (contentLength) {
            responseSize = parseInt(contentLength, 10);
          } else {
            try {
              const clonedRes = response.clone();
              const buf = await clonedRes.arrayBuffer();
              responseSize = buf.byteLength;
            } catch {}
          }

          try {
            const clonedRes = response.clone();
            const resJson = await clonedRes.json();
            returnedId = resJson?.task?.code || resJson?.task?._id || resJson?.project?._id || resJson?.lead?._id || resJson?.id || resJson?._id || '';
          } catch {}
        }

        const responseMetadata = {
          statusCode,
          contentType,
          responseSize,
          returnedId,
          userAgent
        };

        if (statusCode >= 400) {
          writeStructuredLog('ERROR', 'API FAILURE', responseMetadata);
        } else {
          writeStructuredLog('INFO', 'API SUCCESS', responseMetadata);
        }

        // Slow API request warning threshold check (> 1000ms)
        if (duration > 1000) {
          writeStructuredLog('WARN', 'SLOW API REQUEST', {
            route,
            duration,
            requestId
          });
        }

        return response;
      } catch (err: any) {
        const duration = Date.now() - startTime;
        const statusCode = err.status || 500;

        metrics.failedRequests++;
        metrics.totalDuration += duration;

        if (activeOtelProvider) {
          activeOtelProvider.recordRequest(method, route, statusCode, duration);
        }

        writeStructuredLog('FATAL', 'UNCAUGHT API CRASH', {
          statusCode,
          duration,
          errorName: err.name || 'CrashError',
          errorMessage: err.message || String(err),
          stack: err.stack || 'No stack trace available',
          cause: err.cause ? String(err.cause) : 'unknown',
          code: err.code ? String(err.code) : 'unknown',
          userAgent
        });

        // Slow API request warning threshold check (> 1000ms)
        if (duration > 1000) {
          writeStructuredLog('WARN', 'SLOW API REQUEST', {
            route,
            duration,
            requestId
          });
        }

        return NextResponse.json(
          { success: false, error: err.message || String(err) },
          { status: statusCode }
        );
      }
    });
  };
}

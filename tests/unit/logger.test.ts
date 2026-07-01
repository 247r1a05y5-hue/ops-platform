import {
  withLogging,
  incrementMetric
} from '@/lib/logger';
import * as logRotator from '@/lib/logRotator';
import { NextRequest, NextResponse } from 'next/server';

jest.mock('@/lib/logRotator', () => ({
  writeLog: jest.fn()
}));

describe('Logger Observability & Tracing', () => {
  const getMetrics = () => {
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
    return (globalThis as any)._metrics;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const metrics = getMetrics();
    metrics.totalRequests = 0;
    metrics.successRequests = 0;
    metrics.failedRequests = 0;
  });

  it('should format logs in production as JSON structures', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'production';

    // Mock handler
    const mockHandler = jest.fn().mockImplementation(async () => {
      return NextResponse.json({ success: true });
    });

    const req = new NextRequest('http://localhost/api/test-route', {
      method: 'GET',
      headers: {
        'user-agent': 'Jest-Test-Agent'
      }
    });

    const wrapped = withLogging(mockHandler);
    await wrapped(req);

    // Get the arguments passed to writeLog
    expect(logRotator.writeLog).toHaveBeenCalled();
    const calls = (logRotator.writeLog as jest.Mock).mock.calls;
    
    // Check that at least one call contains valid stringified JSON
    let parsedJson = false;
    for (const call of calls) {
      const logMessage = call[1];
      try {
        const parsed = JSON.parse(logMessage);
        expect(parsed).toHaveProperty('timestamp');
        expect(parsed).toHaveProperty('level');
        expect(parsed).toHaveProperty('requestId');
        expect(parsed.route).toBe('/api/test-route');
        parsedJson = true;
      } catch {}
    }
    expect(parsedJson).toBe(true);

    (process.env as any).NODE_ENV = originalNodeEnv;
  });

  it('should increment metrics for total, success, and duration', async () => {
    const mockHandler = jest.fn().mockImplementation(async () => {
      return NextResponse.json({ ok: true });
    });

    const req = new NextRequest('http://localhost/api/metrics-test');
    const wrapped = withLogging(mockHandler);
    await wrapped(req);

    const metrics = getMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.successRequests).toBe(1);
    expect(metrics.failedRequests).toBe(0);
  });

  it('should register slow requests exceeding 1000ms as WARN logs', async () => {
    const mockHandler = jest.fn().mockImplementation(async () => {
      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 1050));
      return NextResponse.json({ ok: true });
    });

    const req = new NextRequest('http://localhost/api/slow-test');
    const wrapped = withLogging(mockHandler);
    await wrapped(req);

    // Verify a warn log was triggered
    const calls = (logRotator.writeLog as jest.Mock).mock.calls;
    const hasSlowRequestWarn = calls.some(call => {
      const msg = call[1];
      return msg.includes('SLOW API REQUEST') || (msg.includes('WARN') && msg.includes('duration'));
    });
    expect(hasSlowRequestWarn).toBe(true);
  });

  it('should correctly increment metrics manually', () => {
    const metrics = getMetrics();
    const initialCloudinaryCount = metrics.cloudinaryFailures || 0;
    incrementMetric('cloudinaryFailures');
    expect(metrics.cloudinaryFailures).toBe(initialCloudinaryCount + 1);
  });
});

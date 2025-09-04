import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import { logger } from '../utils/logger';
import { redisClient } from '../config/redis';

interface PerformanceMetrics {
  path: string;
  method: string;
  duration: number;
  statusCode: number;
  memoryUsage: NodeJS.MemoryUsage;
  timestamp: number;
  userId?: string;
}

class PerformanceMonitoringService {
  private metrics: PerformanceMetrics[] = [];
  private readonly MAX_METRICS = 1000;
  private readonly REDIS_KEY = 'performance_metrics';

  async recordMetric(metric: PerformanceMetrics): Promise<void> {
    // Store in memory (for immediate access)
    this.metrics.push(metric);
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics.shift(); // Remove oldest metric
    }

    // Store in Redis (for persistence and analysis)
    try {
      await redisClient.lpush(this.REDIS_KEY, JSON.stringify(metric));
      await redisClient.ltrim(this.REDIS_KEY, 0, this.MAX_METRICS - 1);
    } catch (error) {
      logger.error('Failed to store performance metric in Redis:', error);
    }

    // Log slow requests
    if (metric.duration > 5000) { // 5 seconds
      logger.warn('Slow request detected', {
        path: metric.path,
        method: metric.method,
        duration: metric.duration,
        statusCode: metric.statusCode,
      });
    }

    // Send to external monitoring service
    this.sendToMonitoringService(metric);
  }

  private sendToMonitoringService(metric: PerformanceMetrics): void {
    // Send to New Relic, DataDog, or other monitoring service
    if (process.env.NEW_RELIC_LICENSE_KEY) {
      // New Relic custom metric
      if (global.newrelic) {
        global.newrelic.recordMetric('Custom/API/ResponseTime', metric.duration);
        global.newrelic.addCustomAttribute('endpoint', `${metric.method} ${metric.path}`);
        global.newrelic.addCustomAttribute('statusCode', metric.statusCode);
      }
    }
  }

  async getMetrics(): Promise<PerformanceMetrics[]> {
    return this.metrics;
  }

  async getMetricsFromRedis(limit: number = 100): Promise<PerformanceMetrics[]> {
    try {
      const metricsData = await redisClient.lrange(this.REDIS_KEY, 0, limit - 1);
      return metricsData.map(data => JSON.parse(data));
    } catch (error) {
      logger.error('Failed to retrieve metrics from Redis:', error);
      return [];
    }
  }

  async getAverageResponseTime(path?: string, timeWindow?: number): Promise<number> {
    const now = Date.now();
    const windowStart = timeWindow ? now - timeWindow : 0;
    
    const relevantMetrics = this.metrics.filter(metric => {
      const matchesPath = !path || metric.path === path;
      const withinWindow = !timeWindow || metric.timestamp >= windowStart;
      return matchesPath && withinWindow;
    });

    if (relevantMetrics.length === 0) return 0;

    const totalDuration = relevantMetrics.reduce((sum, metric) => sum + metric.duration, 0);
    return totalDuration / relevantMetrics.length;
  }

  async getErrorRate(timeWindow?: number): Promise<number> {
    const now = Date.now();
    const windowStart = timeWindow ? now - timeWindow : 0;
    
    const relevantMetrics = this.metrics.filter(metric => 
      !timeWindow || metric.timestamp >= windowStart
    );

    if (relevantMetrics.length === 0) return 0;

    const errorCount = relevantMetrics.filter(metric => 
      metric.statusCode >= 400
    ).length;

    return (errorCount / relevantMetrics.length) * 100;
  }
}

const performanceMonitor = new PerformanceMonitoringService();

export const performanceMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = performance.now();
  const startMemory = process.memoryUsage();

  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(chunk: any, encoding?: any) {
    const endTime = performance.now();
    const duration = endTime - startTime;
    const endMemory = process.memoryUsage();

    const metric: PerformanceMetrics = {
      path: req.path,
      method: req.method,
      duration: Math.round(duration),
      statusCode: res.statusCode,
      memoryUsage: {
        rss: endMemory.rss - startMemory.rss,
        heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        external: endMemory.external - startMemory.external,
        arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
      },
      timestamp: Date.now(),
      userId: req.user?.id,
    };

    // Record the metric asynchronously
    performanceMonitor.recordMetric(metric).catch(error => {
      logger.error('Failed to record performance metric:', error);
    });

    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

export { performanceMonitor };

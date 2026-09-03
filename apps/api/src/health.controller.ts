import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';

@Controller()
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get('healthz')
  @HealthCheck()
  healthCheck() {
    return this.health.check([]);
  }

  @Get('readyz')
  @HealthCheck()
  readinessCheck() {
    return this.health.check([]);
  }
}

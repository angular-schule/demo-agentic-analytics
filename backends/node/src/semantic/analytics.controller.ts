import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { EnvironmentVariables } from '../env.config';
import { AggregateRequestDto } from './aggregate-request.dto';
import { AggregateResponse, SalesAggregatorService } from './sales-aggregator.service';
import { SchemaService } from './schema.service';

@ApiTags('analytics')
@Controller('api')
export class AnalyticsController {
  constructor(
    private readonly aggregator: SalesAggregatorService,
    private readonly schema: SchemaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', backend: 'node', database: 'PostgreSQL', scope: this.config.get('DATA_SCOPE', { infer: true }) };
  }

  @Get('schema')
  getSchema() {
    return this.schema.get();
  }

  @Post('sales/aggregate')
  @HttpCode(200)
  aggregate(@Body() request: AggregateRequestDto): Promise<AggregateResponse> {
    return this.aggregator.aggregate(request);
  }
}

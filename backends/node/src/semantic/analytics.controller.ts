import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBadRequestResponse, ApiExtraModels, ApiOkResponse, ApiProperty, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { EnvironmentVariables } from '../env.config';
import { ProblemDetails } from '../problem-details.filter';
import { AggregateRequest, AggregateResponse } from './aggregate-contract';
import { SalesAggregatorService } from './sales-aggregator.service';
import { SchemaResponse, SchemaService } from './schema.service';

export class HealthResponse {
  @ApiProperty({ type: String }) status!: string;
  @ApiProperty({ type: String }) backend!: string;
  @ApiProperty({ type: String }) database!: string;
  @ApiProperty({ type: String }) scope!: string;
}

@ApiTags('analytics')
@ApiExtraModels(ProblemDetails)
@Controller('api')
export class AnalyticsController {
  constructor(
    private readonly aggregator: SalesAggregatorService,
    private readonly schema: SchemaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Get('health')
  @ApiOkResponse({ type: HealthResponse })
  health(): HealthResponse {
    return { status: 'ok', backend: 'node', database: 'PostgreSQL', scope: this.config.get('DATA_SCOPE', { infer: true }) };
  }

  @Get('schema')
  @ApiOkResponse({ type: SchemaResponse })
  getSchema(): Promise<SchemaResponse> {
    return this.schema.get();
  }

  @Post('sales/aggregate')
  @HttpCode(200)
  @ApiOkResponse({ type: AggregateResponse })
  @ApiBadRequestResponse({ content: { 'application/problem+json': { schema: { $ref: getSchemaPath(ProblemDetails) } } } })
  aggregate(@Body() request: AggregateRequest): Promise<AggregateResponse> {
    return this.aggregator.aggregate(request);
  }
}

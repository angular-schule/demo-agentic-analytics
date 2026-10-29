import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './env.config';
import { ProblemDetailsFilter } from './problem-details.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ProblemDetailsFilter());

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onSend', async (_request, reply) => {
    void reply.header('X-Data-Backend', 'node');
  });

  // Only the OpenAPI document, at the same path as in the ASP.NET Core backend; no Swagger UI.
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Agentic Analytics data API (Node)').build());
  fastify.get('/openapi/v1.json', async () => document);

  const port = app.get(ConfigService<EnvironmentVariables, true>).get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

void bootstrap();

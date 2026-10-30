import 'reflect-metadata';

// Mastra reports usage to PostHog unless this is set before the first agent run.
process.env['MASTRA_TELEMETRY_DISABLED'] ??= '1';

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './env.config';
import { ProblemDetailsFilter } from './problem-details.filter';

const SWAGGER_UI_DIR = dirname(require.resolve('swagger-ui-dist/package.json'));
const SWAGGER_FILES: Record<string, string> = {
  'favicon-32x32.png': 'image/png',
  'swagger-ui.css': 'text/css',
  'swagger-ui-bundle.js': 'text/javascript',
  'swagger-ui-standalone-preset.js': 'text/javascript',
};
const SWAGGER_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Agentic Analytics data API</title>
<link rel="icon" type="image/png" href="/swagger/favicon-32x32.png">
<link rel="stylesheet" href="/swagger/swagger-ui.css">
<style>body { margin: 0; }</style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="/swagger/swagger-ui-bundle.js"></script>
<script src="/swagger/swagger-ui-standalone-preset.js"></script>
<script>
  SwaggerUIBundle({
    urls: [{ url: '/openapi/v1.json', name: 'Agentic Analytics data API' }],
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: 'StandaloneLayout',
  });
</script>
</body>
</html>`;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ProblemDetailsFilter());

  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onSend', async (_request, reply) => {
    void reply.header('X-Data-Backend', 'node');
  });

  // The same paths as in the ASP.NET Core backend: the document at /openapi/v1.json, Swagger UI at /swagger.
  const config = new DocumentBuilder().setOpenAPIVersion('3.1.1').setTitle('Agentic Analytics data API').setVersion('v1').build();
  const document = SwaggerModule.createDocument(app, config);
  fastify.get('/openapi/v1.json', async () => document);
  fastify.get('/', async (_request, reply) => reply.redirect('/swagger'));
  fastify.get('/swagger', async (_request, reply) => reply.type('text/html').send(SWAGGER_PAGE));
  fastify.get<{ Params: { file: string } }>('/swagger/:file', async (request, reply) => {
    const type = SWAGGER_FILES[request.params.file];
    if (!type) return reply.code(404).send();
    return reply.type(type).send(await readFile(join(SWAGGER_UI_DIR, request.params.file)));
  });

  const port = app.get(ConfigService<EnvironmentVariables, true>).get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
}

void bootstrap();

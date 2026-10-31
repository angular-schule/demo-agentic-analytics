import { EventType, type BaseEvent } from '@ag-ui/client';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { MastraAgent } from '@ag-ui/mastra';
import { Agent } from '@mastra/core/agent';
import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { searchProducts } from '../catalog/catalog.controller';
import { DrizzleService } from '../db/drizzle.service';
import { EnvironmentVariables } from '../env.config';
import { SalesAggregatorService } from '../semantic/sales-aggregator.service';
import { SchemaService } from '../semantic/schema.service';
import { debugTraffic, streamLlmTraffic } from '../debug/llm-traffic';
import { createInstructions } from './instructions';
import { createTools } from './tools';

const AGENT_ID = 'analyst';

/**
 * The Mastra agent in this process, served over AG-UI under /agent like the separate agent service,
 * so the Angular app does not notice which one answers. The tools call the semantic layer directly.
 * The agent keeps no memory; the browser sends the whole thread with every run.
 */
@ApiExcludeController()
@Controller('agent')
export class AgentController {
  private analyst?: Promise<Agent>;
  private readonly model: string;

  constructor(
    private readonly schema: SchemaService,
    private readonly aggregator: SalesAggregatorService,
    private readonly drizzle: DrizzleService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.model = config.get('MODEL', { infer: true });
  }

  @Get('info')
  info(): { framework: string; model: string; debugTraffic: boolean } {
    return { framework: 'Mastra', model: this.model, debugTraffic };
  }

  /** DEBUG ONLY: what the agent sends to the LLM provider and what comes back, as server-sent events. */
  @Get('debug/llm')
  llmTraffic(@Res() reply: FastifyReply): void {
    if (!debugTraffic) throw new NotFoundException();
    streamLlmTraffic(reply.hijack().raw);
  }

  /** One AG-UI run: the conversation comes in as RunAgentInput, the answer streams back as server-sent events. */
  @Post(`ag-ui/${AGENT_ID}`)
  async run(@Body() body: unknown, @Res() reply: FastifyReply): Promise<void> {
    const parsed = RunAgentInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(`Expected an AG-UI RunAgentInput: ${parsed.error.message}`);
    const input = parsed.data;

    const agent = new MastraAgent({
      agentId: AGENT_ID,
      agent: await this.getAnalyst(),
      resourceId: input.threadId,
      threadId: input.threadId,
      initialMessages: input.messages,
      initialState: input.state,
      streamServerToolCalls: true,
    });

    const response = reply.hijack().raw;
    // The user stopped the run or closed the page: stop the model as well.
    let closed = false;
    response.on('close', () => {
      closed = !response.writableFinished;
      if (closed) agent.abortRun();
    });

    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    let failed = false;
    const send = (event: BaseEvent): void => {
      if (closed) return;
      failed ||= event.type === EventType.RUN_ERROR;
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    try {
      await agent.runAgent(input, { onEvent: ({ event }) => send(event) });
    } catch (error) {
      // The adapter reports most failures as RUN_ERROR itself and then rejects.
      if (!closed && !failed) {
        console.error(error);
        send({ type: EventType.RUN_ERROR, message: error instanceof Error ? error.message : String(error) } as BaseEvent);
      }
    }
    response.end();
  }

  /** Built on the first run: the system prompt lists the values in the data, so it needs the schema. */
  private getAnalyst(): Promise<Agent> {
    this.analyst ??= this.schema.get().then(
      (schema) =>
        new Agent({
          id: AGENT_ID,
          name: 'Sales Analyst',
          instructions: createInstructions(schema),
          model: this.model,
          tools: createTools(schema, {
            aggregate: (request) => this.aggregator.aggregate(request),
            products: (search, limit) => searchProducts(this.drizzle, search, undefined, limit),
          }),
        }),
      (error: unknown) => {
        this.analyst = undefined;
        throw error;
      },
    );
    return this.analyst;
  }
}

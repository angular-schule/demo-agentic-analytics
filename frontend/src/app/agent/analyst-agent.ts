import { HttpAgent } from '@ag-ui/client';
import { inject } from '@angular/core';
import { type CopilotKitConfig, registerFrontendTool } from '@copilotkit/angular';
import { DashboardStore } from '../dashboard/dashboard-store';
import { salesViewSchema } from '../data/sales-view';
import { productCardsRenderer } from './product-cards-renderer';
import { salesViewRenderer } from './sales-view-renderer';

export const ANALYST_AGENT_ID = 'analyst';

/**
 * The Mastra agent, reached over AG-UI. Its tools run on the server; the frontend registers how
 * their calls are drawn. No CopilotKit runtime and no CopilotKit cloud are involved.
 */
export const copilotKitConfig: CopilotKitConfig = {
  selfManagedAgents: {
    [ANALYST_AGENT_ID]: new HttpAgent({ url: `/agent/ag-ui/${ANALYST_AGENT_ID}` }),
  },
  renderToolCalls: [salesViewRenderer, productCardsRenderer],
  enableInspector: false,
};

/**
 * A tool that runs in the browser: the agent can pin a view to the dashboard when the user asks
 * for it. CopilotKit sends its name and schema to the agent with every run.
 */
export function registerDashboardTool(): void {
  const dashboard = inject(DashboardStore);
  registerFrontendTool({
    name: 'pinToDashboard',
    description:
      'Pins a view to the dashboard next to the chat. Only when the user asks for it. ' +
      'Pass the same title, chart and query as the querySales call that showed the view.',
    parameters: salesViewSchema,
    agentId: ANALYST_AGENT_ID,
    // CopilotKit passes the model's arguments as parsed JSON, without checking them against the schema.
    handler: async (view) => {
      const parsed = salesViewSchema.safeParse(view);
      if (!parsed.success) return `Not pinned, the view is invalid: ${parsed.error.message}`;
      return dashboard.pin(parsed.data)
        ? `Pinned "${parsed.data.title}" to the dashboard.`
        : 'This view is already on the dashboard.';
    },
  });
}

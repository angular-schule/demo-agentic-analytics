import { Component, effect, signal, viewChild } from '@angular/core';
import { CopilotChat, injectAgentStore } from '@copilotkit/angular';
import { ANALYST_AGENT_ID } from '../agent/analyst-agent';

interface Example {
  label: string;
  prompt: string;
}

const EXAMPLES: Example[] = [
  { label: 'Revenue trend', prompt: 'How did revenue develop per quarter, split by sales channel?' },
  { label: 'Top resellers', prompt: 'Which 10 resellers in Germany bought the most? Show revenue and margin.' },
  { label: 'Margin by category', prompt: 'Compare the gross margin of the product categories in Europe in 2013.' },
  { label: 'Discounts', prompt: 'How much discount did each promotion type grant, and how much revenue came with it?' },
  { label: 'Shop size', prompt: 'Do larger resellers place bigger orders? Show the average order value per reseller annual revenue.' },
  { label: 'Bikes', prompt: 'Show me the Mountain-200 bikes.' },
  { label: 'A reseller', prompt: 'Who is Brakes and Gears, and where are they located?' },
  { label: 'What can you do?', prompt: 'What can you do for me?' },
  { label: 'Key account manager', prompt: 'Who is the key account manager of our biggest reseller?' },
];

@Component({
  selector: 'app-chat-panel',
  imports: [CopilotChat],
  template: `
    <div class="examples" role="group" aria-label="Example questions">
      @for (example of examples; track example.label) {
        <button type="button" [title]="example.prompt" (click)="ask(example.prompt)">{{ example.label }}</button>
      }
    </div>
    <copilot-chat [agentId]="agentId" [messageViewChildrenTemplate]="runError" />

    <ng-template #runError>
      @if (error(); as error) {
        <p class="run-error" role="alert"><strong>The agent could not answer.</strong> {{ error }}</p>
      }
    </ng-template>
  `,
  styleUrl: './chat-panel.css',
})
export class ChatPanel {
  protected readonly agentId = ANALYST_AGENT_ID;
  protected readonly examples = EXAMPLES;
  protected readonly error = signal<string | null>(null);

  private readonly chat = viewChild.required(CopilotChat);
  private readonly agentStore = injectAgentStore(ANALYST_AGENT_ID);

  constructor() {
    // The prebuilt chat shows no failed runs, e.g. a missing API key or an unreachable model.
    effect((onCleanup) => {
      const { unsubscribe } = this.agentStore().agent.subscribe({
        onRunStartedEvent: () => this.error.set(null),
        onRunErrorEvent: ({ event }) => this.error.set(event.message),
        onRunFailed: ({ error }) => this.error.set(error.message),
      });
      onCleanup(unsubscribe);
    });
  }

  protected ask(prompt: string): void {
    void this.chat().submitInput(prompt);
  }
}

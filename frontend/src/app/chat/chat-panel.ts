import { Component, effect, signal, viewChild } from '@angular/core';
import { CopilotChat, injectAgentStore } from '@copilotkit/angular';
import { ANALYST_AGENT_ID } from '../agent/analyst-agent';

/** What the answer will show, drawn as a small icon in front of the label. */
type ExampleForm = 'chat' | 'line' | 'kpi' | 'bar' | 'table' | 'products' | 'company' | 'privacy';

interface Example {
  label: string;
  form: ExampleForm;
  prompt: string;
}

/** In the order of a demo: one click per step, each one showing another form of answer. */
const EXAMPLES: Example[] = [
  { label: 'What can you do?', form: 'chat', prompt: 'What can you do for me?' },
  { label: 'Revenue trend', form: 'line', prompt: 'How did revenue develop per quarter, split by sales channel? Show it as a line chart.' },
  { label: '2013 in figures', form: 'kpi', prompt: 'What were the total revenue, margin and orders in 2013? Show all three as key figures in one view.' },
  { label: 'Top resellers', form: 'bar', prompt: 'Which 10 resellers in Germany bought the most? Show revenue and margin as a bar chart.' },
  { label: 'Margin by category', form: 'bar', prompt: 'Compare the gross margin of the product categories in Europe in 2013.' },
  { label: 'Shop size', form: 'bar', prompt: 'Do larger resellers place bigger orders? Show only the average order value per reseller annual revenue class.' },
  { label: 'Discounts', form: 'table', prompt: 'How much discount did each promotion type grant, and how much revenue came with it? Show it as a table.' },
  { label: 'Bikes', form: 'products', prompt: 'Show me the Mountain-200 bikes.' },
  { label: 'A reseller', form: 'company', prompt: 'Who is Brakes and Gears, and where are they located?' },
  { label: 'Key account manager', form: 'privacy', prompt: 'Who is the key account manager of our biggest reseller?' },
];

@Component({
  selector: 'app-chat-panel',
  imports: [CopilotChat],
  template: `
    <div class="examples" role="group" aria-label="Example questions">
      @for (example of examples; track example.label) {
        <button type="button" [title]="example.prompt" (click)="ask(example.prompt)">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            @switch (example.form) {
              @case ('chat') {
                <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
              }
              @case ('line') {
                <path d="M2 13.5h12M2.5 11l3.5-4 3 2 4.5-5.5" />
              }
              @case ('kpi') {
                <rect x="1.5" y="3" width="13" height="10" rx="2" />
                <path d="M4.5 6.5h4M4.5 10h7" stroke-width="2" />
              }
              @case ('bar') {
                <path d="M2 4h9M2 8h12M2 12h6" stroke-width="2.5" />
              }
              @case ('table') {
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
                <path d="M1.5 6.5h13M1.5 10h13M6 6.5v7" />
              }
              @case ('products') {
                <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
                <circle cx="5.5" cy="6" r="1.2" />
                <path d="M1.5 12l4-3.5 3 2.5 2-1.5 4 3" />
              }
              @case ('company') {
                <path d="M3 14V2.5h7V14M10 6h3v8M1.5 14h13M5.5 5h2M5.5 8h2M5.5 11h2" />
              }
              @case ('privacy') {
                <path d="M8 1.8l5.5 2v4c0 3.2-2.3 5.4-5.5 6.4-3.2-1-5.5-3.2-5.5-6.4v-4z" />
              }
            }
          </svg>
          {{ example.label }}
        </button>
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

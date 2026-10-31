import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';
import { ChatPanel } from './chat/chat-panel';
import { Dashboard } from './dashboard/dashboard';
import type { AgentInfo, DataBackendHealth } from './data/sales-api';

const BACKENDS: Record<DataBackendHealth['backend'], string> = {
  dotnet: 'ASP.NET Core',
  node: 'NestJS',
};

@Component({
  selector: 'app-root',
  imports: [ChatPanel, Dashboard],
  template: `
    <header class="topbar">
      <div class="brand">
        <img src="favicon.svg" width="28" height="28" alt="" />
        <div>
          <h1>AdventureWorks Analytics</h1>
          <p>Ask the data. Pin what matters.</p>
        </div>
      </div>
      <ul class="status" aria-label="Status">
        <li title="Personal data such as sales representatives and contact persons is not part of the data model.">
          <span class="dot privacy" aria-hidden="true"></span>No personal data
        </li>
        <li>
          <span class="dot" [class.ok]="health.hasValue()" [class.down]="health.error()" aria-hidden="true"></span>
          {{ backend() }}
        </li>
        <li>
          <span class="dot" [class.ok]="agent.hasValue()" [class.down]="agent.error()" aria-hidden="true"></span>
          {{ model() }}
        </li>
        @if (scope(); as scope) {
          <li>Scope: {{ scope }}</li>
        }
      </ul>
    </header>
    <main>
      <app-chat-panel />
      <app-dashboard />
    </main>
  `,
  styleUrl: './app.css',
})
export class App {
  protected readonly health = httpResource<DataBackendHealth>(() => '/api/health');
  protected readonly agent = httpResource<AgentInfo>(() => '/agent/info');

  protected readonly backend = computed(() => {
    if (!this.health.hasValue()) return this.health.error() ? 'Backend offline' : 'Backend …';
    const { backend, database } = this.health.value();
    return `${BACKENDS[backend]} · ${database}`;
  });

  protected readonly model = computed(() => {
    if (!this.agent.hasValue()) return this.agent.error() ? 'Agent offline' : 'Agent …';
    const { framework, model } = this.agent.value();
    return `${framework} · ${model}`;
  });

  protected readonly scope = computed(() => {
    if (!this.health.hasValue()) return null;
    const scope = this.health.value().scope;
    return scope === '*' ? 'all territories' : scope;
  });
}

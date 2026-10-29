import { provideHttpClient } from '@angular/common/http';
import { type ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCopilotChatLabels, provideCopilotKit } from '@copilotkit/angular';
import { copilotKitConfig, registerDashboardTool } from './agent/analyst-agent';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    provideCopilotKit(copilotKitConfig),
    provideCopilotChatLabels({
      chatInputPlaceholder: 'Ask about sales, products or regions …',
      welcomeMessageText: 'What would you like to know about Adventure Works sales?',
      chatDisclaimerText: 'Answers come from the sales data. Personal data is not part of the model.',
    }),
    provideAppInitializer(registerDashboardTool),
  ],
};

// The dev server forwards to the data backend (.NET on 8081 or Node on 8082) and to the agent.
export default {
  '/api': { target: process.env.DATA_API_URL ?? 'http://127.0.0.1:8081' },
  '/agent': { target: process.env.AGENT_URL ?? 'http://127.0.0.1:4111' },
};

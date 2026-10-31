// The dev server forwards to the backend (.NET on 8081 or Node on 8082). The agent runs in the
// backend, or set AGENT_URL for the separate agent service (http://127.0.0.1:4111).
const dataApi = process.env.DATA_API_URL ?? 'http://127.0.0.1:8081';

export default {
  '/api': { target: dataApi },
  '/agent': { target: process.env.AGENT_URL ?? dataApi },
};

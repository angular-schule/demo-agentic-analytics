FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4111
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev
COPY src ./src
USER node
EXPOSE 4111
# Node runs the TypeScript sources directly (type stripping), there is no build step.
CMD ["node", "src/main.ts"]

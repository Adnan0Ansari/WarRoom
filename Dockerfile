# One image for the whole product: builds the React app, then serves it from the Node server.
FROM node:20-alpine AS client
WORKDIR /client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/src ./src
COPY --from=client /client/dist ./public
EXPOSE 4000
USER node
CMD ["node", "src/index.js"]

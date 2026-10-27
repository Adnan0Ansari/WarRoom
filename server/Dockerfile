FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 4000
USER node
CMD ["node", "src/index.js"]

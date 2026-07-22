# Official Playwright image — comes with Chromium + all system deps
# pre-installed, so we don't have to fight apt-get on Railway's build machine.
FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "src/server.js"]

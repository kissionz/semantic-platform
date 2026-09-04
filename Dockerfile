FROM node:24-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json requirements.txt ./
RUN npm ci --omit=dev && python3 -m venv /opt/semantic-venv && /opt/semantic-venv/bin/pip install --no-cache-dir -r requirements.txt
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY src/server/maxcompute_runner.py ./src/server/maxcompute_runner.py
RUN mkdir -p /data && chown -R node:node /data /app
USER node
ENV NODE_ENV=production PYTHON_BIN=/opt/semantic-venv/bin/python SEMANTIC_STATE_ROOT=/data HOST=0.0.0.0 PORT=4320
EXPOSE 4320
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:4320/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["npm", "run", "start:prod"]

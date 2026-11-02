# One small container: the site plus the relay. Data (anonymous tallies) lives in /data.
FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY index.html main.js missions.js net.js config.js ./
COPY vendor ./vendor
COPY server/server.js server/
ENV PORT=8080 DATA_DIR=/data
VOLUME /data
EXPOSE 8080
CMD ["node", "server/server.js"]

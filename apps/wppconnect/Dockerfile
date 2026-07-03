FROM wppconnect/server-cli:latest

COPY config.ts /usr/src/wpp-server/config.ts
COPY config.ts /usr/src/wpp-server/src/config.ts
COPY config.js /usr/src/wpp-server/config.js
COPY config.js /usr/src/wpp-server/dist/config.js
COPY config.js /usr/src/wpp-server/dist/src/config.js
COPY redis-db.ts /usr/src/wpp-server/src/util/db/redis/db.ts
COPY redis-token-store.ts /usr/src/wpp-server/src/util/tokenStore/redisTokenStory.ts
COPY redis-db.js /usr/src/wpp-server/dist/util/db/redis/db.js
COPY redis-token-store.js /usr/src/wpp-server/dist/util/tokenStore/redisTokenStory.js

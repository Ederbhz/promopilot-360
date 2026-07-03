import config from "../../../config";

const redis = config.tokenStoreType === "redis" ? require("redis") : null;

let client: any = null;

if (config.tokenStoreType === "redis") {
  client = redis.createClient({
    legacyMode: true,
    socket: {
      host: config.db.redisHost,
      port: Number(config.db.redisPort || 6379),
      tls: config.db.redisTls === true
    },
    password: config.db.redisPassword || undefined,
    database: Number(config.db.redisDb || 0)
  });

  client.on("error", (error: Error) => {
    console.error("WPPConnect Redis token store error:", error.message);
  });

  client.connect().catch((error: Error) => {
    console.error("WPPConnect Redis token store connection failed:", error.message);
  });
}

export default client;


const port = process.env.PORT || "21465";
const externalHost = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : "http://localhost";
const redisConfig = readRedisConfig(process.env.REDIS_URL);

const config = {
  secretKey: process.env.SECRET_KEY || "CHANGE_ME",
  host: process.env.PUBLIC_URL || externalHost,
  port,
  deviceName: "PromoPilot 360",
  poweredBy: "WPPConnect-Server",
  startAllSession: true,
  tokenStoreType: process.env.WPP_TOKEN_STORE || (process.env.REDIS_URL ? "redis" : "file"),
  maxListeners: 15,
  customUserDataDir: process.env.WPP_USER_DATA_DIR || "/tmp/wppconnect/userDataDir/",
  webhook: {
    url: null,
    autoDownload: true,
    uploadS3: false,
    readMessage: true,
    allUnreadOnStart: false,
    listenAcks: true,
    onPresenceChanged: true,
    onParticipantsChanged: true,
    onReactionMessage: true,
    onPollResponse: true,
    onRevokedMessage: true,
    onLabelUpdated: true,
    onSelfMessage: false,
    ignore: ["status@broadcast"]
  },
  websocket: {
    autoDownload: false,
    uploadS3: false
  },
  chatwoot: {
    sendQrCode: true,
    sendStatus: true
  },
  archive: {
    enable: false,
    waitTime: 10,
    daysToArchive: 45
  },
  log: {
    level: process.env.WPP_LOG_LEVEL || "info",
    logger: ["console"]
  },
  createOptions: {
    autoClose: 0,
    deviceSyncTimeout: 0,
    waitForLogin: false,
    puppeteerOptions: {
      timeout: 0,
      protocolTimeout: 180000
    },
    browserArgs: [
      "--disable-web-security",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--no-zygote",
      "--single-process",
      "--aggressive-cache-discard",
      "--disable-cache",
      "--disable-application-cache",
      "--disable-offline-load-stale-cache",
      "--disk-cache-size=0",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-translate",
      "--hide-scrollbars",
      "--metrics-recording-only",
      "--mute-audio",
      "--no-first-run",
      "--safebrowsing-disable-auto-update",
      "--ignore-certificate-errors",
      "--ignore-ssl-errors",
      "--ignore-certificate-errors-spki-list"
    ],
    linkPreviewApiServers: null
  },
  mapper: {
    enable: false,
    prefix: "promopilot-"
  },
  db: {
    mongodbDatabase: "tokens",
    mongodbCollection: "",
    mongodbUser: "",
    mongodbPassword: "",
    mongodbHost: "",
    mongoIsRemote: true,
    mongoURLRemote: "",
    mongodbPort: 27017,
    redisHost: redisConfig.host,
    redisPort: redisConfig.port,
    redisPassword: redisConfig.password,
    redisDb: redisConfig.db,
    redisTls: redisConfig.tls,
    redisPrefix: "promopilot"
  },
  aws_s3: {
    region: "sa-east-1" as any,
    access_key_id: null,
    secret_key: null,
    defaultBucketName: null,
    endpoint: null,
    forcePathStyle: null
  }
};

export default config as any;

function readRedisConfig(rawUrl?: string) {
  if (!rawUrl) {
    return {
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || "",
      db: Number(process.env.REDIS_DB || 0),
      tls: false
    };
  }

  try {
    const parsed = new URL(rawUrl);
    return {
      host: parsed.hostname || "localhost",
      port: Number(parsed.port || 6379),
      password: decodeURIComponent(parsed.password || ""),
      db: Number(parsed.pathname.replace("/", "") || process.env.REDIS_DB || 0),
      tls: parsed.protocol === "rediss:"
    };
  } catch {
    return {
      host: rawUrl,
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || "",
      db: Number(process.env.REDIS_DB || 0),
      tls: false
    };
  }
}

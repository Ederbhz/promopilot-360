const port = process.env.PORT || "21465";
const externalHost = process.env.RENDER_EXTERNAL_HOSTNAME
  ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
  : "http://localhost";

const config = {
  secretKey: process.env.SECRET_KEY || "CHANGE_ME",
  host: process.env.PUBLIC_URL || externalHost,
  port,
  deviceName: "PromoPilot 360",
  poweredBy: "WPPConnect-Server",
  startAllSession: true,
  tokenStoreType: "file",
  maxListeners: 15,
  customUserDataDir: "/usr/src/wpp-server/tokens/userDataDir/",
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
    browserArgs: [
      "--disable-web-security",
      "--no-sandbox",
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
    redisHost: "localhost",
    redisPort: 6379,
    redisPassword: "",
    redisDb: 0,
    redisPrefix: "promopilot"
  },
  aws_s3: {
    region: "sa-east-1",
    access_key_id: null,
    secret_key: null,
    defaultBucketName: null,
    endpoint: null,
    forcePathStyle: null
  }
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.default = config;


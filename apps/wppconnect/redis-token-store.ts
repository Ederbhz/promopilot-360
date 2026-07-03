import config from "../../config";
import redisClient from "../db/redis/db";
import { getIPAddress } from "../functions";

class RedisTokenStore {
  declare client: any;
  declare prefix: string;

  constructor(client: any) {
    this.client = client;
    this.prefix = config.db.redisPrefix || "";
    if (this.prefix === "docker") this.prefix = getIPAddress();
    if (this.prefix && !this.prefix.endsWith(":")) this.prefix = `${this.prefix}:`;
  }

  tokenStore = {
    getToken: (sessionName: string) =>
      new Promise((resolve, reject) => {
        (redisClient as any).get(this.prefix + sessionName, (err: Error | null, reply: string | null) => {
          if (err) return reject(err);
          if (!reply) return resolve(null);

          const object = JSON.parse(reply);
          if (object) {
            if (object.config && Object.keys(this.client.config).length === 0) {
              this.client.config = object.config;
            }
            if (object.webhook && Object.keys(this.client.config).length === 0) {
              this.client.config.webhook = object.webhook;
            }
          }
          return resolve(object);
        });
      }),
    setToken: (sessionName: string, tokenData: any) =>
      new Promise((resolve) => {
        tokenData.sessionName = sessionName;
        tokenData.config = this.client.config;
        (redisClient as any).set(this.prefix + sessionName, JSON.stringify(tokenData), (err: Error | null) => {
          return resolve(err ? false : true);
        });
      }),
    removeToken: (sessionName: string) =>
      new Promise((resolve) => {
        (redisClient as any).del(this.prefix + sessionName, (err: Error | null) => {
          return resolve(err ? false : true);
        });
      }),
    listTokens: () =>
      new Promise((resolve) => {
        (redisClient as any).keys(`${this.prefix}*`, (err: Error | null, keys: string[]) => {
          if (err) return resolve([]);
          return resolve(
            keys.map((item) => (this.prefix && item.startsWith(this.prefix) ? item.slice(this.prefix.length) : item))
          );
        });
      })
  };
}

export default RedisTokenStore;


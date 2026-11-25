import Redis from "ioredis";
import "dotenv/config";
let client;
export function getRedis() {
  if (!client) {
    if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
    client = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 5000 });
    client.on("error", () => console.error("Redis connection error"));
  }
  return client;
}

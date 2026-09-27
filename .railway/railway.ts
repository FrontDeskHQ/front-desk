import { database, defineRailway, github, group, image, preserve, project, redis, service, volume } from "railway/iac";

export default defineRailway(() => {
  const frontDesk = github("FrontDeskHQ/front-desk", { checkSuites: false });

  const Redis = redis("Redis", { region: "us-east4-eqdc4a" });
  Redis.deploy = { startCommand: "/bin/sh -c \"rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH\"" };
  Redis.networking = { privateNetworkEndpoint: "redis", tcpProxies: { "6379": {} } };
  const MainDatabase = database("Main database", "postgres", { image: "ghcr.io/railwayapp-templates/postgres-ssl:17", region: "us-east4-eqdc4a" });
  MainDatabase.networking = { privateNetworkEndpoint: "postgres", tcpProxies: { "5432": {} } };
  const qdrantVolume = volume("qdrant-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 5000 });
  const redisVolume = volume("redis-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 5000 });
  const typesenseVolume = volume("typesense-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 5000 });
  const postgresVolume = volume("postgres-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 5000 });
  const sharedConnector = service("shared-connector", {
    source: frontDesk,
    build: { builder: "DOCKERFILE", dockerfilePath: "connectors/host/Dockerfile", watchPatterns: ["apps/api/**", "packages/emails/**", "packages/queue/**", "packages/schemas/**", "packages/utils/**", "connectors/framework/**", "connectors/host/**", "bun.lock"] },
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    replicas: { "us-east4-eqdc4a": 1 },
    env: { BASE_FRONTEND_URL: preserve(), CONNECTOR_HOST_SECRET: preserve(), DISCORD_BOT_KEY: preserve(), LINEAR_CLIENT_ID: preserve(), LINEAR_CLIENT_SECRET: preserve(), LINEAR_REDIRECT_URI: preserve(), LINEAR_WEBHOOK_SECRET: preserve(), LIVE_STATE_API_URL: preserve(), LIVE_STATE_WS_URL: preserve(), REDIS_URL: preserve() },
  });
  const typesense = service("typesense", {
    source: image("typesense/typesense:29.0"),
    replicas: { "us-east4-eqdc4a": 1 },
    volumeMounts: { "/data": typesenseVolume },
    env: { TYPESENSE_API_KEY: preserve(), TYPESENSE_DATA_DIR: preserve(), TYPESENSE_THREAD_POOL_SIZE: preserve(), TYPSENSE_HOST: preserve() },
  });
  const weeklyReport = service("weekly report", {
    source: image("ghcr.io/railwayapp/function-bun:1.3.0"),
    start: "./run.sh aW1wb3J0IHsgc3FsIH0gZnJvbSAiYnVuIjsKCmNvbnN0IERBVEFCQVNFX1VSTCA9IHByb2Nlc3MuZW52LkRBVEFCQVNFX1VSTDsKY29uc3QgRElTQ09SRF9XRUJIT09LX1VSTCA9IHByb2Nlc3MuZW52LkRJU0NPUkRfV0VCSE9PS19VUkw7CgppZiAoIURBVEFCQVNFX1VSTCkgewogIGNvbnNvbGUuZXJyb3IoIkRBVEFCQVNFX1VSTCBpcyBub3QgZGVmaW5lZCBpbiBlbnZpcm9ubWVudCB2YXJpYWJsZXMiKTsKICBwcm9jZXNzLmV4aXQoMSk7Cn0KCmlmICghRElTQ09SRF9XRUJIT09LX1VSTCkgewogIGNvbnNvbGUuZXJyb3IoIkRJU0NPUkRfV0VCSE9PS19VUkwgaXMgbm90IGRlZmluZWQgaW4gZW52aXJvbm1lbnQgdmFyaWFibGVzIik7CiAgcHJvY2Vzcy5leGl0KDEpOwp9CgppbnRlcmZhY2UgTWV0cmljcyB7CiAgdGhyZWFkc0NyZWF0ZWQ6IG51bWJlcjsKICBtZXNzYWdlc1NlbnQ6IG51bWJlcjsKICBhY3Rpb25zVGFrZW46IG51bWJlcjsKfQoKY29uc3QgZ2V0V2Vla1N0YXJ0ID0gKGRheXNBZ286IG51bWJlcik6IERhdGUgPT4gewogIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpOwogIGRhdGUuc2V0RGF0ZShkYXRlLmdldERhdGUoKSAtIGRheXNBZ28pOwogIGRhdGUuc2V0SG91cnMoMCwgMCwgMCwgMCk7CiAgcmV0dXJuIGRhdGU7Cn07Cgpjb25zdCBnZXRXZWVrRW5kID0gKGRheXNBZ286IG51bWJlcik6IERhdGUgPT4gewogIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSgpOwogIGRhdGUuc2V0RGF0ZShkYXRlLmdldERhdGUoKSAtIGRheXNBZ28pOwogIGRhdGUuc2V0SG91cnMoMjMsIDU5LCA1OSwgOTk5KTsKICByZXR1cm4gZGF0ZTsKfTsKCmNvbnN0IGdldE1ldHJpY3NGb3JXZWVrID0gYXN5bmMgKAogIHdlZWtTdGFydDogRGF0ZSwKICB3ZWVrRW5kOiBEYXRlCik6IFByb21pc2U8TWV0cmljcz4gPT4gewogIGNvbnN0IHRocmVhZHNDcmVhdGVkID0gYXdhaXQgc3FsYAogICAgU0VMRUNUIENPVU5UKCopOjppbnQgYXMgY291bnQKICAgIEZST00gdGhyZWFkCiAgICBXSEVSRSAiY3JlYXRlZEF0IiA+PSAke3dlZWtTdGFydH0KICAgICAgQU5EICJjcmVhdGVkQXQiIDw9ICR7d2Vla0VuZH0KICBgLnRoZW4oKHJvd3MpID0+IE51bWJlcihyb3dzWzBdPy5jb3VudCB8fCAwKSk7CgogIGNvbnN0IG1lc3NhZ2VzU2VudCA9IGF3YWl0IHNxbGAKICAgIFNFTEVDVCBDT1VOVCgqKTo6aW50IGFzIGNvdW50CiAgICBGUk9NIG1lc3NhZ2UKICAgIFdIRVJFICJjcmVhdGVkQXQiID49ICR7d2Vla1N0YXJ0fQogICAgICBBTkQgImNyZWF0ZWRBdCIgPD0gJHt3ZWVrRW5kfQogIGAudGhlbigocm93cykgPT4gTnVtYmVyKHJvd3NbMF0/LmNvdW50IHx8IDApKTsKCiAgY29uc3QgYWN0aW9uc1Rha2VuID0gYXdhaXQgc3FsYAogICAgU0VMRUNUIENPVU5UKCopOjppbnQgYXMgY291bnQKICAgIEZST00gdXBkYXRlCiAgICBXSEVSRSAiY3JlYXRlZEF0IiA+PSAke3dlZWtTdGFydH0KICAgICAgQU5EICJjcmVhdGVkQXQiIDw9ICR7d2Vla0VuZH0KICBgLnRoZW4oKHJvd3MpID0+IE51bWJlcihyb3dzWzBdPy5jb3VudCB8fCAwKSk7CgogIHJldHVybiB7CiAgICB0aHJlYWRzQ3JlYXRlZCwKICAgIG1lc3NhZ2VzU2VudCwKICAgIGFjdGlvbnNUYWtlbiwKICB9Owp9OwoKY29uc3QgZm9ybWF0TnVtYmVyID0gKG51bTogbnVtYmVyKTogc3RyaW5nID0+IHsKICByZXR1cm4gbmV3IEludGwuTnVtYmVyRm9ybWF0KCJlbi1VUyIpLmZvcm1hdChudW0pOwp9OwoKY29uc3QgY2FsY3VsYXRlQ2hhbmdlID0gKAogIGN1cnJlbnQ6IG51bWJlciwKICBwcmV2aW91czogbnVtYmVyCik6IHsgdmFsdWU6IG51bWJlcjsgcGVyY2VudGFnZTogc3RyaW5nOyBpc1Bvc2l0aXZlOiBib29sZWFuIH0gPT4gewogIGlmIChwcmV2aW91cyA9PT0gMCkgewogICAgcmV0dXJuIHsKICAgICAgdmFsdWU6IGN1cnJlbnQsCiAgICAgIHBlcmNlbnRhZ2U6IGN1cnJlbnQgPiAwID8gIuKIniIgOiAiMCUiLAogICAgICBpc1Bvc2l0aXZlOiBjdXJyZW50ID49IDAsCiAgICB9OwogIH0KICBjb25zdCBjaGFuZ2UgPSBjdXJyZW50IC0gcHJldmlvdXM7CiAgY29uc3QgcGVyY2VudGFnZSA9ICgoY2hhbmdlIC8gcHJldmlvdXMpICogMTAwKS50b0ZpeGVkKDEpOwogIHJldHVybiB7CiAgICB2YWx1ZTogY2hhbmdlLAogICAgcGVyY2VudGFnZTogYCR7Y2hhbmdlID49IDAgPyAiKyIgOiAiIn0ke3BlcmNlbnRhZ2V9JWAsCiAgICBpc1Bvc2l0aXZlOiBjaGFuZ2UgPj0gMCwKICB9Owp9OwoKY29uc3QgZ2V0Q2hhbmdlRW1vamkgPSAoY2hhbmdlOiB7CiAgdmFsdWU6IG51bWJlcjsKICBpc1Bvc2l0aXZlOiBib29sZWFuOwp9KTogc3RyaW5nID0+IHsKICBpZiAoY2hhbmdlLnZhbHVlID09PSAwKSByZXR1cm4gIvCfn6EiOwogIHJldHVybiBjaGFuZ2UuaXNQb3NpdGl2ZSA/ICLwn5+iIiA6ICLwn5S0IjsKfTsKCmNvbnN0IGZvcm1hdENoYW5nZVRleHQgPSAoY2hhbmdlOiB7CiAgdmFsdWU6IG51bWJlcjsKICBwZXJjZW50YWdlOiBzdHJpbmc7Cn0pOiBzdHJpbmcgPT4gewogIGNvbnN0IHNpZ24gPSBjaGFuZ2UudmFsdWUgPj0gMCA/ICIrIiA6ICIiOwogIHJldHVybiBgJHtzaWdufSR7Zm9ybWF0TnVtYmVyKGNoYW5nZS52YWx1ZSl9IHZzIGxhc3Qgd2VlayAoJHsKICAgIGNoYW5nZS5wZXJjZW50YWdlCiAgfSlgOwp9OwoKaW50ZXJmYWNlIERpc2NvcmRFbWJlZCB7CiAgdGl0bGU/OiBzdHJpbmc7CiAgZGVzY3JpcHRpb24/OiBzdHJpbmc7CiAgY29sb3I/OiBudW1iZXI7CiAgZmllbGRzPzogQXJyYXk8ewogICAgbmFtZTogc3RyaW5nOwogICAgdmFsdWU6IHN0cmluZzsKICAgIGlubGluZT86IGJvb2xlYW47CiAgfT47CiAgdGltZXN0YW1wPzogc3RyaW5nOwogIGZvb3Rlcj86IHsKICAgIHRleHQ6IHN0cmluZzsKICB9Owp9Cgpjb25zdCBzZW5kRGlzY29yZFdlYmhvb2sgPSBhc3luYyAoZW1iZWRzOiBEaXNjb3JkRW1iZWRbXSk6IFByb21pc2U8dm9pZD4gPT4gewogIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goRElTQ09SRF9XRUJIT09LX1VSTCwgewogICAgbWV0aG9kOiAiUE9TVCIsCiAgICBoZWFkZXJzOiB7CiAgICAgICJDb250ZW50LVR5cGUiOiAiYXBwbGljYXRpb24vanNvbiIsCiAgICB9LAogICAgYm9keTogSlNPTi5zdHJpbmdpZnkoewogICAgICBlbWJlZHMsCiAgICB9KSwKICB9KTsKCiAgaWYgKCFyZXNwb25zZS5vaykgewogICAgY29uc3QgZXJyb3JUZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpOwogICAgdGhyb3cgbmV3IEVycm9yKGBEaXNjb3JkIHdlYmhvb2sgZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtlcnJvclRleHR9YCk7CiAgfQp9OwoKY29uc3QgZ2VuZXJhdGVXZWVrbHlEaWdlc3QgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7CiAgLy8gQ3VycmVudCB3ZWVrOiBsYXN0IDcgZGF5cyAodG9kYXkgLSA3IGRheXMgdG8gdG9kYXkpCiAgY29uc3QgY3VycmVudFdlZWtTdGFydCA9IGdldFdlZWtTdGFydCg3KTsKICBjb25zdCBjdXJyZW50V2Vla0VuZCA9IGdldFdlZWtFbmQoMCk7CgogIC8vIExhc3Qgd2VlazogcHJldmlvdXMgNyBkYXlzICh0b2RheSAtIDE0IGRheXMgdG8gdG9kYXkgLSA3IGRheXMpCiAgY29uc3QgbGFzdFdlZWtTdGFydCA9IGdldFdlZWtTdGFydCgxNCk7CiAgY29uc3QgbGFzdFdlZWtFbmQgPSBnZXRXZWVrRW5kKDcpOwoKICBjb25zb2xlLmxvZygiRmV0Y2hpbmcgbWV0cmljcyBmb3IgY3VycmVudCB3ZWVrLi4uIik7CiAgY29uc3QgY3VycmVudE1ldHJpY3MgPSBhd2FpdCBnZXRNZXRyaWNzRm9yV2VlaygKICAgIGN1cnJlbnRXZWVrU3RhcnQsCiAgICBjdXJyZW50V2Vla0VuZAogICk7CgogIGNvbnNvbGUubG9nKCJGZXRjaGluZyBtZXRyaWNzIGZvciBsYXN0IHdlZWsuLi4iKTsKICBjb25zdCBsYXN0TWV0cmljcyA9IGF3YWl0IGdldE1ldHJpY3NGb3JXZWVrKGxhc3RXZWVrU3RhcnQsIGxhc3RXZWVrRW5kKTsKCiAgY29uc3QgdGhyZWFkc0NoYW5nZSA9IGNhbGN1bGF0ZUNoYW5nZSgKICAgIGN1cnJlbnRNZXRyaWNzLnRocmVhZHNDcmVhdGVkLAogICAgbGFzdE1ldHJpY3MudGhyZWFkc0NyZWF0ZWQKICApOwogIGNvbnN0IG1lc3NhZ2VzQ2hhbmdlID0gY2FsY3VsYXRlQ2hhbmdlKAogICAgY3VycmVudE1ldHJpY3MubWVzc2FnZXNTZW50LAogICAgbGFzdE1ldHJpY3MubWVzc2FnZXNTZW50CiAgKTsKICBjb25zdCBhY3Rpb25zQ2hhbmdlID0gY2FsY3VsYXRlQ2hhbmdlKAogICAgY3VycmVudE1ldHJpY3MuYWN0aW9uc1Rha2VuLAogICAgbGFzdE1ldHJpY3MuYWN0aW9uc1Rha2VuCiAgKTsKCiAgY29uc3QgZm9ybWF0RGF0ZSA9IChkYXRlOiBEYXRlKTogc3RyaW5nID0+IHsKICAgIHJldHVybiBkYXRlLnRvTG9jYWxlRGF0ZVN0cmluZygiZW4tVVMiLCB7CiAgICAgIG1vbnRoOiAic2hvcnQiLAogICAgICBkYXk6ICJudW1lcmljIiwKICAgICAgeWVhcjogIm51bWVyaWMiLAogICAgfSk7CiAgfTsKCiAgLy8gQ2FsY3VsYXRlIG92ZXJhbGwgdHJlbmQgY29sb3IgKGdyZWVuIGlmIG1vc3RseSBwb3NpdGl2ZSwgcmVkIGlmIG1vc3RseSBuZWdhdGl2ZSwgYmx1ZSBpZiBuZXV0cmFsKQogIGNvbnN0IHBvc2l0aXZlQ291bnQgPSBbCiAgICB0aHJlYWRzQ2hhbmdlLmlzUG9zaXRpdmUsCiAgICBtZXNzYWdlc0NoYW5nZS5pc1Bvc2l0aXZlLAogICAgYWN0aW9uc0NoYW5nZS5pc1Bvc2l0aXZlLAogIF0uZmlsdGVyKEJvb2xlYW4pLmxlbmd0aDsKICBjb25zdCBjb2xvciA9CiAgICBwb3NpdGl2ZUNvdW50ID49IDIgPyAweDAwZmYwMCA6IHBvc2l0aXZlQ291bnQgPT09IDEgPyAweDAwOTlmZiA6IDB4ZmYwMDAwOwoKICBjb25zdCBlbWJlZDogRGlzY29yZEVtYmVkID0gewogICAgdGl0bGU6ICLwn5OKIFdlZWtseSBQcm9kdWN0IERpZ2VzdCIsCiAgICBkZXNjcmlwdGlvbjogYCoqV2VlayBvZiAke2Zvcm1hdERhdGUoY3VycmVudFdlZWtTdGFydCl9IC0gJHtmb3JtYXREYXRlKAogICAgICBjdXJyZW50V2Vla0VuZAogICAgKX0qKmAsCiAgICBjb2xvciwKICAgIGZpZWxkczogWwogICAgICB7CiAgICAgICAgbmFtZTogIlx1MjAwYiIsCiAgICAgICAgdmFsdWU6IGDihqYgVGhyZWFkcyBjcmVhdGVkICR7Z2V0Q2hhbmdlRW1vamkoCiAgICAgICAgICB0aHJlYWRzQ2hhbmdlCiAgICAgICAgKX06ICoqJHtmb3JtYXROdW1iZXIoCiAgICAgICAgICBjdXJyZW50TWV0cmljcy50aHJlYWRzQ3JlYXRlZAogICAgICAgICl9Kiog4oCiICoke2Zvcm1hdENoYW5nZVRleHQodGhyZWFkc0NoYW5nZSl9KmAsCiAgICAgICAgaW5saW5lOiBmYWxzZSwKICAgICAgfSwKICAgICAgewogICAgICAgIG5hbWU6ICJcdTIwMGIiLAogICAgICAgIHZhbHVlOiBg4oamIE1lc3NhZ2VzIHNlbnQgJHtnZXRDaGFuZ2VFbW9qaSgKICAgICAgICAgIG1lc3NhZ2VzQ2hhbmdlCiAgICAgICAgKX06ICoqJHtmb3JtYXROdW1iZXIoCiAgICAgICAgICBjdXJyZW50TWV0cmljcy5tZXNzYWdlc1NlbnQKICAgICAgICApfSoqIOKAoiAqJHtmb3JtYXRDaGFuZ2VUZXh0KG1lc3NhZ2VzQ2hhbmdlKX0qYCwKICAgICAgICBpbmxpbmU6IGZhbHNlLAogICAgICB9LAogICAgICB7CiAgICAgICAgbmFtZTogIlx1MjAwYiIsCiAgICAgICAgdmFsdWU6IGDihqYgQWN0aW9ucyB0YWtlbiAke2dldENoYW5nZUVtb2ppKAogICAgICAgICAgYWN0aW9uc0NoYW5nZQogICAgICAgICl9OiAqKiR7Zm9ybWF0TnVtYmVyKAogICAgICAgICAgY3VycmVudE1ldHJpY3MuYWN0aW9uc1Rha2VuCiAgICAgICAgKX0qKiDigKIgKiR7Zm9ybWF0Q2hhbmdlVGV4dChhY3Rpb25zQ2hhbmdlKX0qYCwKICAgICAgICBpbmxpbmU6IGZhbHNlLAogICAgICB9LAogICAgXSwKICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLAogICAgZm9vdGVyOiB7CiAgICAgIHRleHQ6ICJHZW5lcmF0ZWQgYXV0b21hdGljYWxseSBieSB0aGUgd2Vla2x5IGRpZ2VzdCBzZXJ2aWNlIiwKICAgIH0sCiAgfTsKCiAgY29uc29sZS5sb2coIlNlbmRpbmcgZGlnZXN0IHRvIERpc2NvcmQuLi4iKTsKICBhd2FpdCBzZW5kRGlzY29yZFdlYmhvb2soW2VtYmVkXSk7CiAgY29uc29sZS5sb2coIldlZWtseSBkaWdlc3Qgc2VudCBzdWNjZXNzZnVsbHkhIik7Cn07Cgpjb25zdCBtYWluID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4gewogIHRyeSB7CiAgICBhd2FpdCBnZW5lcmF0ZVdlZWtseURpZ2VzdCgpOwogIH0gY2F0Y2ggKGVycm9yKSB7CiAgICBjb25zb2xlLmVycm9yKCJFcnJvciBnZW5lcmF0aW5nIHdlZWtseSBkaWdlc3Q6IiwgZXJyb3IpOwogICAgcHJvY2Vzcy5leGl0KDEpOwogIH0gZmluYWxseSB7CiAgICBhd2FpdCBzcWwuZW5kKCk7CiAgfQp9OwoKLy8gUnVuIHRoZSBmdW5jdGlvbgptYWluKCk7Cg==",
    replicas: { "us-east4-eqdc4a": 1 },
    deploy: { cronSchedule: "0 0 * * 1", restartPolicyType: "NEVER" },
    networking: { privateNetworkEndpoint: "function-bun" },
    env: { DATABASE_URL: preserve(), DISCORD_WEBHOOK_URL: preserve() },
  });
  const discord = service("discord", {
    source: frontDesk,
    build: { buildCommand: "bun run build -F discord...", builder: "RAILPACK", watchPatterns: ["apps/api/**", "packages/schemas/**", "packages/ui/**", "packages/utils/**", "connectors/discord/**"] },
    start: "cd connectors/discord && bun run start",
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    replicas: { "us-east4-eqdc4a": 1 },
    env: { AXIOM_DATASET: preserve(), AXIOM_TOKEN: preserve(), DISCORD_BOT_KEY: preserve(), DISCORD_TOKEN: preserve(), LIVE_STATE_API_URL: preserve(), LIVE_STATE_WS_URL: preserve(), REDIS_URL: preserve(), REFLAG_SECRET_KEY: preserve() },
  });
  const qdrant = service("qdrant", {
    source: image("qdrant/qdrant:v1.19.1", { autoUpdates: { schedule: [{ day: 0, endHour: 24, startHour: 0 }, { day: 6, endHour: 24, startHour: 0 }], type: "minor" } }),
    replicas: { "us-east4-eqdc4a": 1 },
    volumeMounts: { "/qdrant/storage": qdrantVolume },
  });
  const slack = service("slack", {
    source: frontDesk,
    build: { buildCommand: "bun run build -F slack...", builder: "RAILPACK", watchPatterns: ["apps/api/**", "packages/schemas/**", "packages/ui/**", "packages/utils/**", "connectors/slack/**"] },
    start: "cd connectors/slack && bun run start",
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    replicas: { "us-east4-eqdc4a": 1 },
    env: { AXIOM_DATASET: preserve(), AXIOM_TOKEN: preserve(), DISCORD_BOT_KEY: preserve(), LIVE_STATE_API_URL: preserve(), LIVE_STATE_WS_URL: preserve(), PORT: preserve(), REDIS_URL: preserve(), REFLAG_SECRET_KEY: preserve(), SLACK_CLIENT_ID: preserve(), SLACK_CLIENT_SECRET: preserve(), SLACK_SIGNING_SECRET: preserve() },
  });
  const api = service("api", {
    source: frontDesk,
    build: { buildCommand: "bun run build -F api...", buildEnvironment: "V3", builder: "RAILPACK", watchPatterns: ["apps/api/**", "packages/utils/**"] },
    start: "cd apps/api && bun run start",
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    replicas: { "us-east4-eqdc4a": 1 },
    domains: ["api.tryfrontdesk.app"],
    env: { API_KEY_SALT: preserve(), AXIOM_DATASET: preserve(), AXIOM_TOKEN: preserve(), BASE_FRONTEND_URL: preserve(), BASE_GITHUB_SERVER_URL: preserve(), BASE_LINEAR_CONNECTOR_URL: preserve(), BASE_SLACK_SERVER_URL: preserve(), BASE_URL: preserve(), BETTER_AUTH_SECRET: preserve(), BETTER_AUTH_TRUSTED_ORIGINS: preserve(), CONNECTOR_HOST_SECRET: preserve(), DATABASE_URL: preserve(), DISCORD_BOT_KEY: preserve(), DISCORD_WAITLIST_WEBHOOK_URL: preserve(), DODO_PAYMENTS_API_KEY: preserve(), DODO_PAYMENTS_PRO_PRODUCT_ID: preserve(), DODO_PAYMENTS_PRO_SEATS_ADDON_ID: preserve(), DODO_PAYMENTS_STARTER_PRODUCT_ID: preserve(), DODO_PAYMENTS_STARTER_SEATS_ADDON_ID: preserve(), DODO_PAYMENTS_WEBHOOK_KEY: preserve(), ENABLE_GOOGLE_LOGIN: preserve(), GOOGLE_CLIENT_ID: preserve(), GOOGLE_CLIENT_SECRET: preserve(), GOOGLE_GENERATIVE_AI_API_KEY: preserve(), INTEGRATION_CREDENTIAL_CURRENT_KEY_ID: preserve(), INTEGRATION_CREDENTIAL_KEYS: preserve(), REDIS_URL: preserve(), REFLAG_SECRET_KEY: preserve(), RESEND_API_KEY: preserve(), TRIGGER_SECRET_KEY: preserve(), TYPESENSE_API_KEY: preserve(), TYPESENSE_HOST: preserve() },
  });
  const githubService = service("github", {
    source: frontDesk,
    build: { buildCommand: "bun run build -F github...", builder: "RAILPACK", watchPatterns: ["apps/api/**", "packages/schemas/**", "packages/ui/**", "connectors/github/**"] },
    start: "cd connectors/github && bun run start",
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    replicas: { "us-east4-eqdc4a": 1 },
    env: { AXIOM_DATASET: preserve(), AXIOM_TOKEN: preserve(), DISCORD_BOT_KEY: preserve(), GITHUB_APP_ID: preserve(), GITHUB_CLIENT_ID: preserve(), GITHUB_CLIENT_SECRET: preserve(), GITHUB_PRIVATE_KEY: preserve(), GITHUB_WEBHOOK_SECRET: preserve(), LIVE_STATE_API_URL: preserve(), LIVE_STATE_WS_URL: preserve(), REDIS_URL: preserve(), VITE_BASE_URL: preserve() },
  });
  const worker = service("worker", {
    source: frontDesk,
    build: { buildCommand: "bun run build -F worker...", builder: "RAILPACK", watchPatterns: ["apps/api/**", "apps/worker/**"] },
    start: "cd apps/worker && bun run start",
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "front-desk-09df1e6d" },
    env: { AXIOM_DATASET: preserve(), AXIOM_TOKEN: preserve(), DISCORD_BOT_KEY: preserve(), GOOGLE_GENERATIVE_AI_API_KEY: preserve(), LIVE_STATE_API_URL: preserve(), LIVE_STATE_WS_URL: preserve(), QDRANT_URL: preserve(), REDIS_URL: preserve(), REFLAG_SECRET_KEY: preserve(), RESPAN_API_KEY: preserve() },
  });
  const Integrations = group("Integrations", [discord, slack, githubService]);

  return project("front-desk", {
    resources: [Redis, sharedConnector, typesense, weeklyReport, MainDatabase, qdrant, api, worker, qdrantVolume, redisVolume, typesenseVolume, postgresVolume, Integrations],
  });
});

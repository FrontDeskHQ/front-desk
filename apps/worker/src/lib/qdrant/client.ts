import { QdrantClient } from "@qdrant/js-client-rest";

const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";
const { QDRANT_API_KEY } = process.env;

export const qdrantClient = new QdrantClient({
  apiKey: QDRANT_API_KEY,
  url: QDRANT_URL,
});

import Typesense from "typesense";

export const typesenseClient = process.env.TYPESENSE_API_KEY
  ? new Typesense.Client({
      nodes: [
        {
          host: process.env.TYPESENSE_HOST ?? "localhost", // For Typesense Cloud use xxx.a1.typesense.net
          port: Number.parseInt(process.env.TYPESENSE_PORT ?? "8108", 10), // For Typesense Cloud use 443
          protocol: process.env.TYPESENSE_PROTOCOL ?? "http", // For Typesense Cloud use https
        },
      ],
      apiKey: process.env.TYPESENSE_API_KEY as string,
      connectionTimeoutSeconds: 2,
    })
  : undefined;

const _collections = typesenseClient?.collections();

const createOrUpdateCollection = async (
  schema: Parameters<NonNullable<typeof _collections>["create"]>[0]
): Promise<void> => {
  if (!typesenseClient) {
    return;
  }

  try {
    const existingSchema = await typesenseClient
      .collections(schema.name)
      .retrieve();

    const { name: _name, fields: newFields, ...restSchema } = schema;

    if (!newFields || newFields.length === 0) {
      return;
    }

    const existingFieldMap = new Map(
      (existingSchema.fields || []).map((field) => [field.name, field])
    );

    const hasFieldChanged = (
      newField: (typeof newFields)[0],
      existingField: (typeof existingSchema.fields)[0] | undefined
    ): boolean => {
      if (!existingField) {
        return true;
      }

      for (const key of Object.keys(newField)) {
        const newValue = newField[key as keyof typeof newField];
        const existingValue = existingField[key as keyof typeof existingField];

        if (newValue !== existingValue) {
          return true;
        }
      }

      return false;
    };

    const fieldsToUpdate = newFields.filter((field) => {
      if (field.name === "id") {
        return false;
      }
      const existingField = existingFieldMap.get(field.name);
      return hasFieldChanged(field, existingField);
    });

    if (fieldsToUpdate.length === 0) {
      return;
    }

    const updateSchema = {
      ...restSchema,
      fields: fieldsToUpdate,
    };
    await typesenseClient.collections(schema.name).update(updateSchema);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const httpStatus = (error as { httpStatus?: number })?.httpStatus;
    // Check for "Not Found" in message or 404 status code
    if (
      !errorMessage.includes("Not Found") &&
      !errorMessage.includes("not found") &&
      httpStatus !== 404
    ) {
      throw error;
    }
    // Collection doesn't exist, create it
    await typesenseClient.collections().create(schema);
  }
};

createOrUpdateCollection({
  name: "messages",
  fields: [
    { name: "id", type: "string" },
    { name: "content", type: "string" },
    { name: "organizationId", type: "string" },
    {
      name: "embedding",
      type: "float[]",
      num_dim: 768,
      optional: true,
    },
    { name: "threadId", type: "string" },
    { name: "messageIndex", type: "int32" },
  ],
}).catch((error) => {
  console.error("Error creating or updating typesense collection", error);
});

createOrUpdateCollection({
  name: "threadChunks",
  fields: [
    { name: "id", type: "string" },
    { name: "threadId", type: "string" },
    { name: "organizationId", type: "string" },
    { name: "chunkIndex", type: "int32" },
    { name: "content", type: "string" },
    { name: "keywords", type: "string" },
    {
      name: "embedding",
      type: "float[]",
      num_dim: 768,
      optional: true,
    },
  ],
}).catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const httpStatus = (error as { httpStatus?: number })?.httpStatus;
  // Only log if it's not a "collection not found" error (which is expected on first run)
  if (
    !errorMessage.includes("Not Found") &&
    !errorMessage.includes("not found") &&
    httpStatus !== 404
  ) {
    console.error("Error creating or updating threadChunks collection", error);
  }
});

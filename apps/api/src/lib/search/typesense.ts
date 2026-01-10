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
    // Try to retrieve the collection to check if it exists
    const existingSchema = await typesenseClient
      .collections(schema.name)
      .retrieve();
    // If it exists, compare fields and only update if there are new or changed fields
    const { name: _name, fields: newFields, ...restSchema } = schema;

    if (!newFields || newFields.length === 0) {
      // No fields to update
      return;
    }

    // Create a map of existing fields by name
    const existingFieldMap = new Map(
      (existingSchema.fields || []).map((field) => [field.name, field])
    );

    // Helper function to check if a field has changed
    // Only compares properties that are defined in the new field
    const hasFieldChanged = (
      newField: (typeof newFields)[0],
      existingField: (typeof existingSchema.fields)[0] | undefined
    ): boolean => {
      if (!existingField) {
        // Field doesn't exist, so it's new
        return true;
      }

      // Compare only the properties defined in the new field
      for (const key of Object.keys(newField)) {
        const newValue = newField[key as keyof typeof newField];
        const existingValue = existingField[key as keyof typeof existingField];

        // Compare values, handling undefined/null cases
        if (newValue !== existingValue) {
          return true;
        }
      }

      return false;
    };

    const fieldsToUpdate = newFields.filter((field) => {
      // Skip 'id' field as it cannot be modified
      if (field.name === "id") {
        return false;
      }
      // Include field if it's new or has changed
      const existingField = existingFieldMap.get(field.name);
      return hasFieldChanged(field, existingField);
    });

    // If there are no fields to update, skip the update
    if (fieldsToUpdate.length === 0) {
      return;
    }

    // Update the collection with only new or changed fields
    const updateSchema = {
      ...restSchema,
      fields: fieldsToUpdate,
    };
    await typesenseClient.collections(schema.name).update(updateSchema);
  } catch (error) {
    // Collection doesn't exist, which is fine - we'll create it
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes("Not Found")) {
      // If it's a different error, rethrow it
      throw error;
    }
    // Create the collection with the new schema
    await typesenseClient.collections().create(schema);
  }
};

createOrUpdateCollection({
  name: "messages",
  fields: [
    { name: "id", type: "string" },
    { name: "content", type: "string" },
    { name: "organizationId", type: "string" },
  ],
});

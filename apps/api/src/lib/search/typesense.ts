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

type TypesenseDocument = Record<string, unknown>;
type TypesenseQueryParams = Record<string, string | number | boolean>;
type TypesenseSearchParams = Record<
  string,
  string | number | boolean | string[] | number[]
>;
type TypesenseMultiSearch = NonNullable<typeof typesenseClient>["multiSearch"];
type TypesenseMultiSearchRequest = Parameters<
  TypesenseMultiSearch["perform"]
>[0];
type TypesenseMultiSearchParams = Parameters<
  TypesenseMultiSearch["perform"]
>[1];
type TypesenseMultiSearchResponse = Awaited<
  ReturnType<TypesenseMultiSearch["perform"]>
>;

export const isTypesenseAvailable = (): boolean => Boolean(typesenseClient);

async function createOrUpdateCollection(
  schema: Parameters<NonNullable<typeof _collections>["create"]>[0]
): Promise<boolean> {
  if (!typesenseClient) {
    return false;
  }

  const fields = schema.fields ?? [];

  try {
    const existingSchema = await typesenseClient
      .collections(schema.name)
      .retrieve();

    if (fields.length === 0) {
      return true;
    }

    const existingFieldMap = new Map(
      (existingSchema.fields ?? []).map((field) => [field.name, field])
    );

    const hasFieldChanged = (
      nextField: (typeof fields)[0],
      currentField: (typeof existingSchema.fields)[0] | undefined
    ): boolean => {
      if (!currentField) {
        return true;
      }

      const keys = new Set([
        ...Object.keys(nextField),
        ...Object.keys(currentField),
      ]);

      for (const key of keys) {
        const nextValue = nextField[key as keyof typeof nextField];
        const currentValue = currentField[key as keyof typeof currentField];
        if (nextValue !== currentValue) {
          return true;
        }
      }

      return false;
    };

    const fieldsToAdd: typeof fields = [];
    const fieldsToDrop: { name: string; drop: true }[] = [];

    for (const field of fields) {
      if (field.name === "id") {
        continue;
      }

      const existingField = existingFieldMap.get(field.name);
      if (!existingField) {
        fieldsToAdd.push(field);
        continue;
      }

      if (hasFieldChanged(field, existingField)) {
        fieldsToDrop.push({ name: field.name, drop: true });
        fieldsToAdd.push(field);
      }
    }

    if (fieldsToAdd.length === 0 && fieldsToDrop.length === 0) {
      return true;
    }

    const updateSchema = {
      fields: [...fieldsToDrop, ...fieldsToAdd],
    };
    console.log("Updating collection", schema.name, updateSchema);
    await typesenseClient.collections(schema.name).update(updateSchema);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const httpStatus = (error as { httpStatus?: number })?.httpStatus;
    console.log(
      "Error updating collection",
      schema.name,
      errorMessage,
      httpStatus
    );
    if (
      !errorMessage.includes("Not Found") &&
      !errorMessage.includes("not found") &&
      httpStatus !== 404
    ) {
      console.error("Failed to update collection", schema.name, errorMessage);
      return false;
    }
    console.log("Collection doesn't exist, creating it", schema.name);
    await typesenseClient.collections().create(schema);
    return true;
  }
}

export const createDocument = async <T extends TypesenseDocument>(
  collectionName: string,
  document: T,
  params?: TypesenseQueryParams
): Promise<boolean> => {
  if (!typesenseClient) {
    return false;
  }

  try {
    await typesenseClient
      .collections(collectionName)
      .documents()
      .create(document, params);
    return true;
  } catch (error) {
    console.error("Failed to create document", collectionName, error);
    return false;
  }
};

export const upsertDocument = async <T extends TypesenseDocument>(
  collectionName: string,
  document: T,
  params?: TypesenseQueryParams
): Promise<boolean> => {
  if (!typesenseClient) {
    return false;
  }

  try {
    await typesenseClient
      .collections(collectionName)
      .documents()
      .upsert(document, params);
    return true;
  } catch (error) {
    console.error("Failed to upsert document", collectionName, error);
    return false;
  }
};

export const updateDocument = async <T extends TypesenseDocument>(
  collectionName: string,
  documentId: string,
  partialDocument: Partial<T>,
  params?: TypesenseQueryParams
): Promise<boolean> => {
  if (!typesenseClient) {
    return false;
  }

  try {
    await typesenseClient
      .collections(collectionName)
      .documents(documentId)
      .update(partialDocument, params);
    return true;
  } catch (error) {
    console.error("Failed to update document", collectionName, error);
    return false;
  }
};

export const importDocuments = async <T extends TypesenseDocument>(
  collectionName: string,
  documents: T[],
  params?: TypesenseQueryParams
): Promise<boolean> => {
  if (!typesenseClient) {
    return false;
  }

  try {
    const rawResult = await typesenseClient
      .collections(collectionName)
      .documents()
      .import(documents, params);

    const result = rawResult as unknown;

    if (typeof result === "string") {
      const lines = result.trim().split("\n").filter(Boolean);
      const parsed = lines.map((line: string) => JSON.parse(line)) as Array<{
        success?: boolean;
      }>;
      return parsed.every((entry) => entry?.success === true);
    }

    if (Array.isArray(result)) {
      return (result as Array<{ success?: boolean }>).every(
        (entry) => entry?.success === true
      );
    }

    return true;
  } catch (error) {
    console.error("Failed to import documents", collectionName, error);
    return false;
  }
};

export const deleteDocument = async (
  collectionName: string,
  documentId: string,
  params?: TypesenseQueryParams
): Promise<boolean> => {
  if (!typesenseClient) {
    return false;
  }

  try {
    await typesenseClient
      .collections(collectionName)
      .documents(documentId)
      .delete(params);
    return true;
  } catch (error) {
    console.error("Failed to delete document", collectionName, error);
    return false;
  }
};

export const retrieveDocument = async <T extends TypesenseDocument>(
  collectionName: string,
  documentId: string,
  params?: TypesenseQueryParams
): Promise<T | null> => {
  if (!typesenseClient) {
    return null;
  }

  try {
    const documents = typesenseClient
      .collections(collectionName)
      .documents(documentId);
    if (params) {
      return (await (
        documents.retrieve as unknown as (
          payload: TypesenseQueryParams
        ) => Promise<T>
      )(params)) as T;
    }
    return (await documents.retrieve()) as T;
  } catch (error) {
    console.error("Failed to retrieve document", collectionName, error);
    return null;
  }
};

export const searchDocuments = async <T = unknown>(
  collectionName: string,
  searchParams: TypesenseSearchParams
): Promise<T | null> => {
  if (!typesenseClient) {
    return null;
  }

  try {
    return (await typesenseClient
      .collections(collectionName)
      .documents()
      .search(searchParams as Record<string, unknown>)) as T;
  } catch (error) {
    console.error("Failed to search documents", collectionName, error);
    return null;
  }
};

export const updateDocumentsByQuery = async <T extends TypesenseDocument>(
  collectionName: string,
  partialDocument: Partial<T>,
  filterBy: string,
  params?: TypesenseQueryParams
): Promise<boolean> => {
  if (!typesenseClient) {
    return false;
  }

  try {
    await typesenseClient
      .collections(collectionName)
      .documents()
      .update(partialDocument, { ...params, filter_by: filterBy });
    return true;
  } catch (error) {
    console.error("Failed to update documents by query", collectionName, error);
    return false;
  }
};

export const deleteDocumentsByQuery = async (
  collectionName: string,
  filterBy: string,
  params?: TypesenseQueryParams
): Promise<boolean> => {
  if (!typesenseClient) {
    return false;
  }

  try {
    await typesenseClient
      .collections(collectionName)
      .documents()
      .delete({ ...params, filter_by: filterBy });
    return true;
  } catch (error) {
    console.error("Failed to delete documents by query", collectionName, error);
    return false;
  }
};

export const exportDocuments = async (
  collectionName: string,
  params?: TypesenseQueryParams
): Promise<string | null> => {
  if (!typesenseClient) {
    return null;
  }

  try {
    const documents = typesenseClient.collections(collectionName).documents();
    if (params) {
      return await (
        documents.export as unknown as (
          payload: TypesenseQueryParams
        ) => Promise<string>
      )(params);
    }
    return await documents.export();
  } catch (error) {
    console.error("Failed to export documents", collectionName, error);
    return null;
  }
};

export const performMultiSearch = async (
  request: TypesenseMultiSearchRequest,
  params?: TypesenseMultiSearchParams
): Promise<TypesenseMultiSearchResponse | null> => {
  if (!typesenseClient) {
    return null;
  }

  try {
    return await typesenseClient.multiSearch.perform(request, params ?? {});
  } catch (error) {
    console.error("Failed to perform multi-search", error);
    return null;
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
  name: "threads",
  fields: [
    { name: "id", type: "string" },
    { name: "threadId", type: "string" },
    { name: "organizationId", type: "string" },
    { name: "title", type: "string" },
    { name: "labels", type: "string" },
    { name: "content", type: "string" },
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
  if (
    !errorMessage.includes("Not Found") &&
    !errorMessage.includes("not found") &&
    httpStatus !== 404
  ) {
    console.error("Error creating or updating Thread collection", error);
  }
});

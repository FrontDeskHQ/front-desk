import { fetchClient } from "../../lib/database/client";
import { ulid } from "ulid";
import type {
  PipelineJobMetadata,
  PipelineStatus,
  PipelineExecutionResult,
} from "./types";

const PIPELINE_NAME = "ingest-thread";

/**
 * Create a new pipeline job record with status "pending"
 */
export const createPipelineJob = async (
  threadIds: string[],
  options?: PipelineJobMetadata["options"],
): Promise<string> => {
  const jobId = ulid().toLowerCase();
  const now = new Date();

  const metadata: PipelineJobMetadata = {
    threadIds,
    options,
  };

  await fetchClient.mutate.pipelineJob.insert({
    id: jobId,
    name: PIPELINE_NAME,
    status: "pending",
    metadataStr: JSON.stringify(metadata),
    createdAt: now,
    updatedAt: now,
  });

  return jobId;
};

/**
 * Update pipeline job status
 */
export const updatePipelineJobStatus = async (
  jobId: string,
  status: PipelineStatus,
  additionalMetadata?: Partial<PipelineJobMetadata>,
): Promise<boolean> => {
  try {
    const existing = await fetchClient.query.pipelineJob
      .first({ id: jobId })
      .get();

    if (!existing) {
      console.error(`Pipeline job ${jobId} not found`);
      return false;
    }

    const currentMetadata: PipelineJobMetadata = existing.metadataStr
      ? JSON.parse(existing.metadataStr)
      : {};

    const updatedMetadata: PipelineJobMetadata = {
      ...currentMetadata,
      ...additionalMetadata,
    };

    await fetchClient.mutate.pipelineJob.update(jobId, {
      status,
      metadataStr: JSON.stringify(updatedMetadata),
      updatedAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error(`Error updating pipeline job ${jobId}:`, error);
    return false;
  }
};

/**
 * Complete a pipeline job with final summary
 */
export const completePipelineJob = async (
  jobId: string,
  result: PipelineExecutionResult,
): Promise<boolean> => {
  try {
    const existing = await fetchClient.query.pipelineJob
      .first({ id: jobId })
      .get();

    if (!existing) {
      console.error(`Pipeline job ${jobId} not found`);
      return false;
    }

    const currentMetadata: PipelineJobMetadata = existing.metadataStr
      ? JSON.parse(existing.metadataStr)
      : {};

    const updatedMetadata: PipelineJobMetadata = {
      ...currentMetadata,
      turns: result.turns,
      summary: result.summary,
    };

    await fetchClient.mutate.pipelineJob.update(jobId, {
      status: result.status,
      metadataStr: JSON.stringify(updatedMetadata),
      updatedAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error(`Error completing pipeline job ${jobId}:`, error);
    return false;
  }
};

/**
 * Mark a pipeline job as failed with an error message
 */
export const failPipelineJob = async (
  jobId: string,
  error: string,
): Promise<boolean> => {
  try {
    const existing = await fetchClient.query.pipelineJob
      .first({ id: jobId })
      .get();

    if (!existing) {
      console.error(`Pipeline job ${jobId} not found`);
      return false;
    }

    const currentMetadata: PipelineJobMetadata = existing.metadataStr
      ? JSON.parse(existing.metadataStr)
      : {};

    const updatedMetadata: PipelineJobMetadata = {
      ...currentMetadata,
      error,
    };

    await fetchClient.mutate.pipelineJob.update(jobId, {
      status: "failed",
      metadataStr: JSON.stringify(updatedMetadata),
      updatedAt: new Date(),
    });

    return true;
  } catch (error) {
    console.error(`Error failing pipeline job ${jobId}:`, error);
    return false;
  }
};

/**
 * Get a pipeline job by ID
 */
export const getPipelineJob = async (
  jobId: string,
): Promise<{
  id: string;
  name: string;
  status: string;
  metadata: PipelineJobMetadata;
  createdAt: Date;
  updatedAt: Date;
} | null> => {
  try {
    const job = await fetchClient.query.pipelineJob
      .first({ id: jobId })
      .get();

    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      status: job.status,
      metadata: job.metadataStr ? JSON.parse(job.metadataStr) : {},
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  } catch (error) {
    console.error(`Error fetching pipeline job ${jobId}:`, error);
    return null;
  }
};

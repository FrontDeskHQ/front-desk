import { ulid } from "ulid";

import { fetchClient } from "../../lib/database/client";
import type {
  PipelineJobMetadata,
  PipelineStatus,
  PipelineExecutionResult,
} from "./types";

const PIPELINE_NAME = "thread-pipeline";

/**
 * Create a new pipeline job record with status "pending"
 */
export const createPipelineJob = async (
  threadIds: string[],
  options?: PipelineJobMetadata["options"]
): Promise<string> => {
  const jobId = ulid().toLowerCase();
  const now = new Date();

  const metadata: PipelineJobMetadata = {
    options,
    threadIds,
  };

  await fetchClient.mutate.pipelineJob.create({
    createdAt: now,
    id: jobId,
    metadataStr: JSON.stringify(metadata),
    name: PIPELINE_NAME,
    status: "pending",
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
  additionalMetadata?: Partial<PipelineJobMetadata>
): Promise<boolean> => {
  try {
    const existing = await fetchClient.query.pipelineJob.byId({ id: jobId });

    if (!existing) {
      console.error(`Pipeline job ${jobId} not found`);
      return false;
    }

    await fetchClient.mutate.pipelineJob.patch({
      jobId,
      status,
      ...(additionalMetadata ? { metadataPatch: additionalMetadata } : {}),
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
  result: PipelineExecutionResult
): Promise<boolean> => {
  try {
    const existing = await fetchClient.query.pipelineJob.byId({ id: jobId });

    if (!existing) {
      console.error(`Pipeline job ${jobId} not found`);
      return false;
    }

    await fetchClient.mutate.pipelineJob.patch({
      jobId,
      metadataPatch: {
        summary: result.summary,
        turns: result.turns,
      },
      status: result.status,
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
  error: string
): Promise<boolean> => {
  try {
    const existing = await fetchClient.query.pipelineJob.byId({ id: jobId });

    if (!existing) {
      console.error(`Pipeline job ${jobId} not found`);
      return false;
    }

    await fetchClient.mutate.pipelineJob.patch({
      jobId,
      metadataPatch: { error },
      status: "failed",
      updatedAt: new Date(),
    });

    return true;
  } catch (persistError) {
    console.error(`Error failing pipeline job ${jobId}:`, persistError);
    return false;
  }
};

/**
 * Get a pipeline job by ID
 */
export const getPipelineJob = async (
  jobId: string
): Promise<{
  id: string;
  name: string;
  status: string;
  metadata: PipelineJobMetadata;
  createdAt: Date;
  updatedAt: Date;
} | null> => {
  try {
    const job = await fetchClient.query.pipelineJob.byId({ id: jobId });

    if (!job) {
      return null;
    }

    return {
      createdAt: job.createdAt,
      id: job.id,
      metadata: job.metadataStr ? JSON.parse(job.metadataStr) : {},
      name: job.name,
      status: job.status,
      updatedAt: job.updatedAt,
    };
  } catch (error) {
    console.error(`Error fetching pipeline job ${jobId}:`, error);
    return null;
  }
};

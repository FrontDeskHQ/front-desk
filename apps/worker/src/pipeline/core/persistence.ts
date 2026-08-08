import { log } from "@workspace/utils/logging";
import { ulid } from "ulid";

import { fetchClient } from "../../lib/database/client";
import { errorFields } from "../../lib/logging";
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
      log.error({
        action: "worker.pipeline_persistence",
        operation: "job.update",
        jobId,
        error: { message: "Pipeline job not found", name: "NotFoundError" },
      });
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
    log.error({
      action: "worker.pipeline_persistence",
      operation: "job.update",
      jobId,
      status,
      error: errorFields(error),
    });
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
      log.error({
        action: "worker.pipeline_persistence",
        operation: "job.complete",
        jobId,
        error: { message: "Pipeline job not found", name: "NotFoundError" },
      });
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
    log.error({
      action: "worker.pipeline_persistence",
      operation: "job.complete",
      jobId,
      status: result.status,
      error: errorFields(error),
    });
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
      log.error({
        action: "worker.pipeline_persistence",
        operation: "job.fail",
        jobId,
        error: { message: "Pipeline job not found", name: "NotFoundError" },
      });
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
    log.error({
      action: "worker.pipeline_persistence",
      operation: "job.fail",
      jobId,
      error: errorFields(persistError),
    });
    return false;
  }
};

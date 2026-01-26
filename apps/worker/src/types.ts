import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";
import type { SimilarThreadResult } from "./lib/qdrant/threads";

/**
 * Thread type with messages and labels included
 */
export type Thread = InferLiveObject<
  typeof schema.thread,
  { messages: true; labels: { label: true } }
>;

/**
 * Base result type for pipeline operations
 */
export interface PipelineResult<T> {
  threadId: string;
  success: true;
  data: T;
}

export interface PipelineError {
  threadId: string;
  success: false;
  error: string;
}

export type PipelineStageResult<T> = PipelineResult<T> | PipelineError;

/**
 * Pre-processor types
 * Pre-processors take a thread and output processed data
 */
export interface PreProcessorInput {
  thread: Thread;
}

export interface SummaryOutput {
  summary: ParsedSummary;
}

export type PreProcessorResult = PipelineStageResult<SummaryOutput>;

export type PreProcessor = (
  input: PreProcessorInput,
) => Promise<PreProcessorResult>;

/**
 * Processor types
 * Processors take pre-processor outputs and produce processed data
 */
export interface ProcessorInput {
  threadId: string;
  thread: Thread;
  summary: ParsedSummary;
}

export interface EmbedOutput {
  embedding: number[];
  summaryText: string;
  storedInQdrant: boolean;
}

export type ProcessorResult = PipelineStageResult<EmbedOutput>;

export type Processor = (input: ProcessorInput) => Promise<ProcessorResult>;

/**
 * Post-processor types
 * Post-processors take processor outputs and perform final actions
 */
export interface PostProcessorInput {
  threadId: string;
  organizationId: string;
  embedding: number[];
}

export interface SimilarThreadsOutput {
  similarThreads: SimilarThreadResult[];
  storedInSuggestions: boolean;
}

export type PostProcessorResult = PipelineStageResult<SimilarThreadsOutput>;

export type PostProcessor = (
  input: PostProcessorInput,
) => Promise<PostProcessorResult>;

/**
 * Pipeline context for the entire batch
 */
export interface PipelineContext {
  threadIds: string[];
  threads: Map<string, Thread>;
  organizationId: string;
}

/**
 * Pipeline batch result
 */
export interface PipelineBatchResult {
  preProcessorResults: PreProcessorResult[];
  processorResults: ProcessorResult[];
  postProcessorResults: PostProcessorResult[];
  summary: {
    total: number;
    preProcessorSuccess: number;
    preProcessorFailed: number;
    processorSuccess: number;
    processorFailed: number;
    postProcessorSuccess: number;
    postProcessorFailed: number;
  };
}

/**
 * Parsed summary data structure
 */
export interface ParsedSummary {
  title: string;
  shortDescription: string;
  keywords: string[];
  entities: string[];
  expectedAction: string;
}

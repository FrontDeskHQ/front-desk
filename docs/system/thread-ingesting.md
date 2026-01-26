# Thread Ingesting

## Overview

Thread ingesting is the process of ingesting threads to generate Support Intelligence suggestions and insights.

It's based on a `Processors` architecture, where each processor is responsible for a specific part of the ingesting process.

## Processors

Every processor is a function that takes an input and returns an output.

### Inputs 

Every processor has access to the shared job context, which is a object that contains the following information:

- job input data: the input data for the job, including the thread IDs to process.
- job options: the options for the job, including the concurrency, similar threads limit and score threshold.
- processors output data: the output data for all previous processors, so it can be used by the next processor.

### Outputs

Every processor saves context-worthy data to the shared job context, so it can be used by the next processor that depends on it.

The processor also can output data to a long-term storage, such as a database, bucket, etc. This is stored in a known format (defined by the processor), so it can be used by the next processor that depends on it.

## Pipeline orchestration

Each processor defines a list of dependencies, so the pipeline can know which processors to run in which order.

The pipeline runs in "turns", where each turn is a set of processors that are run in parallel.

Every turn runs every processor that has no dependencies/all fullfilled dependencies.

Once there are no more processors to run, the pipeline is considered complete and the next job can be started.

The pipeline is stored in the `pipelineJob` table, and the job is stored in the `pipelineJob` table.

The job is identified by the `id` field, and the status is stored in the `status` field.

## Idempotency

Evert processor is idempotent, so it can be run multiple times with the same input data and the same options.

They use the "idempotency key" pattern to ensure idempotency, by storing a key and a hash in the `pipelineIdempotencyKey` table.

The key is a unique identifier for the processor step, it's namespaced by the processor name (e..g. `summarize:thread_1`).

The hash is any value that can be used to identify if the processor needs to be run again.

## Error handling

The pipeline is robust and can handle errors gracefully.

If a processor fails, the pipeline will continue to run the next processors.
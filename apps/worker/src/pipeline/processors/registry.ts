import type { ProcessorDefinition } from "../core/types";

/**
 * Error thrown when there's a circular dependency in the processor graph
 */
export class CircularDependencyError extends Error {
  constructor(processors: string[]) {
    super(`Circular dependency detected involving processors: ${processors.join(", ")}`);
    this.name = "CircularDependencyError";
  }
}

/**
 * Error thrown when a processor depends on an unknown processor
 */
export class UnknownDependencyError extends Error {
  constructor(processor: string, dependency: string) {
    super(`Processor "${processor}" depends on unknown processor "${dependency}"`);
    this.name = "UnknownDependencyError";
  }
}

/**
 * Registry for pipeline processors
 *
 * Manages processor registration and dependency resolution.
 */
export class ProcessorRegistry {
  private processors: Map<string, ProcessorDefinition> = new Map();

  /**
   * Register a processor
   */
  register(processor: ProcessorDefinition): void {
    if (this.processors.has(processor.name)) {
      console.warn(`Processor "${processor.name}" is already registered, replacing`);
    }
    this.processors.set(processor.name, processor);
  }

  /**
   * Get a processor by name
   */
  get(name: string): ProcessorDefinition | undefined {
    return this.processors.get(name);
  }

  /**
   * Check if a processor is registered
   */
  has(name: string): boolean {
    return this.processors.has(name);
  }

  /**
   * Get all registered processor names
   */
  getNames(): string[] {
    return Array.from(this.processors.keys());
  }

  /**
   * Get all registered processors
   */
  getAll(): ProcessorDefinition[] {
    return Array.from(this.processors.values());
  }

  /**
   * Resolve execution order using topological sort
   *
   * Returns an array of turns, where each turn is an array of processor names
   * that can be executed in parallel.
   *
   * @throws {UnknownDependencyError} if a processor depends on an unregistered processor
   * @throws {CircularDependencyError} if there's a circular dependency
   */
  resolveExecutionOrder(): string[][] {
    // Validate all dependencies exist
    for (const processor of this.processors.values()) {
      for (const dep of processor.dependencies) {
        if (!this.processors.has(dep)) {
          throw new UnknownDependencyError(processor.name, dep);
        }
      }
    }

    const turns: string[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(this.processors.keys());

    // Continue until all processors are scheduled
    while (remaining.size > 0) {
      const turn: string[] = [];

      // Find all processors whose dependencies are satisfied
      for (const name of remaining) {
        const processor = this.processors.get(name);
        if (!processor) continue;

        const allDependenciesMet = processor.dependencies.every((dep) =>
          completed.has(dep),
        );

        if (allDependenciesMet) {
          turn.push(name);
        }
      }

      // If no processors can be scheduled, there's a circular dependency
      if (turn.length === 0) {
        throw new CircularDependencyError(Array.from(remaining));
      }

      // Schedule this turn
      turns.push(turn);

      // Mark these processors as completed
      for (const name of turn) {
        completed.add(name);
        remaining.delete(name);
      }
    }

    return turns;
  }

  /**
   * Get dependency graph for debugging
   */
  getDependencyGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const processor of this.processors.values()) {
      graph.set(processor.name, [...processor.dependencies]);
    }

    return graph;
  }

  /**
   * Clear all registered processors
   */
  clear(): void {
    this.processors.clear();
  }
}

/**
 * Global processor registry instance
 */
export const processorRegistry = new ProcessorRegistry();

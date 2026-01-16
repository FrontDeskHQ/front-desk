# Hybrid Search Algorithm for Thread Similarity

This document explains how the `findSimilarThreadsById` function finds similar threads using a hybrid search approach that combines **vector similarity** (semantic meaning) with **keyword matching** (exact terms).

## Algorithm Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         INPUT: Thread ID                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  1. RETRIEVE SOURCE THREAD DATA                                         │
│     • Fetch embedding vector from indexed chunks                        │
│     • Fetch extracted keywords (if available)                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. HYBRID SEARCH (Typesense)                                           │
│     • Vector query: semantic similarity using embeddings                │
│     • Text query: keyword matching on content/keywords fields           │
│     • Combined via Rank Fusion with alpha parameter                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. CUTOFF FILTER                                                       │
│     • Remove chunks with score < cutoffScore (default: 0.3)             │
│     • Reduces noise from irrelevant matches                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. AGGREGATION BY THREAD                                               │
│     • Group chunks by threadId                                          │
│     • Calculate final score using weighted mean + multi-chunk bonus     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  5. OUTPUT: Ranked list of similar threads                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Breakdown

### Step 1: Retrieve Source Thread Data

The algorithm first fetches the indexed data for the source thread:

```
Source Thread (thread_123)
    │
    ├── Embedding Vector: [0.123, -0.456, 0.789, ...]  (768 dimensions)
    │
    └── Keywords: "authentication, login, OAuth, JWT, session"
```

**Debug output shows:**
```
⚙️  Search Parameters (from real implementation):
    Keywords: "authentication, login, OAuth, JWT, session"
```

---

### Step 2: Hybrid Search

The search combines two approaches using Typesense's hybrid search:

```
                    ┌─────────────────────┐
                    │   Source Thread     │
                    │   Embedding + KW    │
                    └─────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │  VECTOR SEARCH  │             │ KEYWORD SEARCH  │
    │                 │             │                 │
    │ Cosine distance │             │ BM25 ranking    │
    │ on embeddings   │             │ on keywords +   │
    │                 │             │ content fields  │
    └─────────────────┘             └─────────────────┘
              │                               │
              │      ┌───────────────┐        │
              └─────►│ RANK FUSION   │◄───────┘
                     │               │
                     │ alpha = 0.7   │
                     │ (70% vector,  │
                     │  30% keyword) │
                     └───────────────┘
                              │
                              ▼
                     Combined Score
                  (rank_fusion_score)
```

**Alpha Parameter:**
- `alpha = 1.0` → Pure vector search (semantic only)
- `alpha = 0.0` → Pure keyword search (exact terms only)
- `alpha = 0.7` → 70% vector weight, 30% keyword weight (default)

**Debug output shows:**
```
⚙️  Search Parameters (from real implementation):
    Alpha: 0.7 (70% vector, 30% keyword)

🔍 Score Components:
    Hybrid search (rank_fusion): 40 chunks
    Keyword/text search: 40 chunks
      Avg text_match score: 1234567.5
      Avg tokens matched: 3.2
    Vector similarity: 40 chunks
      Avg vector score: 0.623
```

---

### Step 3: Cutoff Filter

Low-scoring chunks are removed to reduce noise:

```
All Retrieved Chunks (k=40)
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│  Chunk A: score=0.85  ✓ KEEP                                   │
│  Chunk B: score=0.72  ✓ KEEP                                   │
│  Chunk C: score=0.45  ✓ KEEP                                   │
│  Chunk D: score=0.28  ✗ CUT (below 0.3 cutoff)                 │
│  Chunk E: score=0.15  ✗ CUT (below 0.3 cutoff)                 │
│  ...                                                           │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
   Filtered Chunks
```

**Debug output shows:**
```
📊 Scoring Breakdown:
  Total chunks found: 40
  Chunks after cutoff (>= 0.3): 25
  Chunks cut out (< 0.3): 15

❌ Cut Out Chunks (score < 0.3):
    - thread_456 (chunk 0): 0.2845 [rank_fusion=0.2845, text_match=12345, tokens=2, vector_dist=0.4521]
    - thread_789 (chunk 1): 0.2234 [rank_fusion=0.2234, text_match=8901, tokens=1, vector_dist=0.5123]
```

**Why chunks get cut out:**
| Reason | Symptom in Debug |
|--------|------------------|
| Semantically unrelated | Low `vector_score` (< 0.5) |
| No keyword overlap | Low `text_match`, `tokens=0` |
| Partial relevance | Medium scores in both, but combined still < 0.3 |

---

### Step 4: Aggregation by Thread

Multiple chunks from the same thread are combined into a single score:

```
Filtered Chunks                         Aggregated Threads
                                        
┌──────────────────────┐               ┌──────────────────────┐
│ thread_A, chunk_0    │               │ thread_A             │
│   score: 0.85        │──┐            │   chunks: 3          │
├──────────────────────┤  │            │   scores: [0.85,     │
│ thread_A, chunk_1    │──┼───────────►│            0.72,     │
│   score: 0.72        │  │            │            0.65]     │
├──────────────────────┤  │            │   mean: 0.740        │
│ thread_A, chunk_2    │──┘            │   bonus: 0.15        │
│   score: 0.65        │               │   final: 0.890       │
├──────────────────────┤               └──────────────────────┘
│ thread_B, chunk_0    │               ┌──────────────────────┐
│   score: 0.78        │───────────────│ thread_B             │
├──────────────────────┤               │   chunks: 1          │
│ thread_C, chunk_0    │               │   scores: [0.78]     │
│   score: 0.55        │──┐            │   mean: 0.780        │
├──────────────────────┤  │            │   bonus: 0.05        │
│ thread_C, chunk_1    │──┴───────────►│   final: 0.830       │
│   score: 0.48        │               └──────────────────────┘
└──────────────────────┘               ┌──────────────────────┐
                                       │ thread_C             │
                                       │   chunks: 2          │
                                       │   scores: [0.55,     │
                                       │            0.48]     │
                                       │   mean: 0.515        │
                                       │   bonus: 0.10        │
                                       │   final: 0.615       │
                                       └──────────────────────┘
```

**Aggregation Formula (Weighted Mean):**
```
mean_score = sum(chunk_scores) / count(chunks)
bonus = min(count(chunks) * 0.05, 0.15)    // Max bonus: 0.15
final_score = min(mean_score + bonus, 1.0)  // Capped at 1.0
```

**Why multi-chunk bonus?**
- Threads with multiple matching chunks are more likely to be genuinely similar
- Bonus rewards breadth of similarity (multiple relevant sections)
- Capped at 0.15 to prevent over-weighting

**Debug output shows:**
```
✅ Final Thread Scores (with aggregation details):

    thread_auth_001 [EXPECTED ✓]
      Final Score: 0.8900
      Matching Chunks: 3
      Chunk Breakdown:
        - Chunk 0: 0.850 [fusion=0.850, text=1234567, (5 tokens), vector=0.812]
        - Chunk 1: 0.720 [fusion=0.720, text=987654, (3 tokens), vector=0.756]
        - Chunk 2: 0.650 [fusion=0.650, text=654321, (2 tokens), vector=0.698]
      Aggregated Scores: [0.850, 0.720, 0.650]
      Aggregation: mean(0.850, 0.720, 0.650) = 0.740 + bonus(0.150) = 0.890
```

---

## Understanding Debug Output

### Search Parameters Block

```
⚙️  Search Parameters (from real implementation):
    Alpha: 0.7 (70% vector, 30% keyword)     ← How vector/keyword are weighted
    Cutoff Score: 0.3                         ← Minimum chunk score to keep
    Use Weighted Mean: true                   ← Aggregation method
    Limit: 10, k: 40                          ← Output limit, search breadth
    Keywords: "auth, login, OAuth..."         ← Keywords used for text search
```

### Scoring Breakdown Block

```
📊 Scoring Breakdown:
  Total chunks found: 40        ← Raw results from Typesense
  Chunks after cutoff: 25       ← After removing low scores
  Chunks cut out: 15            ← Filtered out as noise
```

### Score Components Block

```
🔍 Score Components:
    Hybrid search (rank_fusion): 40 chunks
    Keyword/text search: 40 chunks
      Avg text_match score: 1234567.5    ← BM25-style score (higher = more keyword matches)
      Avg tokens matched: 3.2            ← Avg keywords matched per chunk
    Vector similarity: 40 chunks
      Avg vector score: 0.623            ← 1 - vector_distance (0-1 scale)
```

### Cut Out Chunks Block

```
❌ Cut Out Chunks (score < 0.3):
    - thread_456 (chunk 0): 0.2845 [rank_fusion=0.2845, text_match=12345, tokens=2, vector_dist=0.4521]
                            │       │                   │               │          │
                            │       │                   │               │          └─ Cosine distance (lower=closer)
                            │       │                   │               └─ Keywords matched
                            │       │                   └─ BM25 text score
                            │       └─ Combined hybrid score
                            └─ Final score (same as rank_fusion here)
```

### Thread Details Block

```
✅ Final Thread Scores (with aggregation details):

    thread_auth_001 [EXPECTED ✓]           ← Marker shows if thread was expected
      Final Score: 0.8900                  ← Score after aggregation
      Matching Chunks: 3                   ← How many chunks contributed
      Chunk Breakdown:
        - Chunk 0: 0.850 [fusion=0.850, text=1234567, (5 tokens), vector=0.812]
        - Chunk 1: 0.720 [...]
      Aggregated Scores: [0.850, 0.720, 0.650]
      Aggregation: mean(0.850, 0.720, 0.650) = 0.740 + bonus(0.150) = 0.890
                   │                          │       │             │
                   │                          │       │             └─ Final score
                   │                          │       └─ Multi-chunk bonus
                   │                          └─ Average of chunk scores
                   └─ Individual chunk scores
```

---

## Why Candidates Pass or Fail

### Common Pass Patterns

| Pattern | Debug Evidence |
|---------|---------------|
| **Strong semantic match** | High `vector_score` (> 0.7), multiple chunks pass cutoff |
| **Strong keyword match** | High `tokens_matched` (> 4), high `text_match` scores |
| **Broad relevance** | Multiple chunks from same thread, each with decent scores |

### Common Fail Patterns

| Pattern | Debug Evidence | Solution |
|---------|---------------|----------|
| **All chunks cut out** | Thread appears only in "Cut Out Chunks" section | Lower `cutoffScore` or improve indexing |
| **Low vector scores** | `vector_score` < 0.5 consistently | Content may be semantically different |
| **No keyword overlap** | `tokens_matched = 0` | Add more keywords during indexing |
| **Single weak chunk** | Only 1 chunk, low score, no bonus | Thread has limited relevant content |

### Debugging Checklist

1. **Is the expected thread in "Cut Out Chunks"?**
   - Yes → Score is below cutoff, may need tuning
   - No → Thread chunks weren't even retrieved

2. **What's the chunk breakdown?**
   - High vector, low text → Semantic match, keyword mismatch
   - Low vector, high text → Keyword match, semantic difference
   - Both low → Genuinely dissimilar

3. **How many chunks matched?**
   - Many chunks → Strong overall similarity
   - Few chunks → Narrow similarity (specific topic only)

---

## Configuration Reference

| Parameter | Default | Description |
|-----------|---------|-------------|
| `alpha` | 0.7 | Vector vs keyword weight (0=all keyword, 1=all vector) |
| `cutoffScore` | 0.3 | Minimum chunk score to keep |
| `useWeightedMean` | true | Use mean+bonus vs max score |
| `limit` | 10 | Max threads to return |
| `k` | limit × 4 | Chunks to retrieve before aggregation |

---

## Related Files

- [`thread-embeddings.ts`](../thread-embeddings.ts) - Main implementation with `findSimilarThreadsById`
- [`hybrid-search.eval.ts`](./hybrid-search.eval.ts) - Evaluation script that uses debug output
- [`fake-threads.json`](./fake-threads.json) - Test data with similarity groups

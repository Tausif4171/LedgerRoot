# Evaluation: measured, synthetic, limited

Recorded run: `eval-1788808569253`, September 7 2026 UTC. Dataset `synthetic-v1`, prompt `receipt-fields-v2`, Ollama `qwen2.5:7b`, digest `845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e`. Host: Apple M4 Pro, arm64, 48 GiB RAM.

| Measurement                                            | Result                                          |
| ------------------------------------------------------ | ----------------------------------------------- |
| Cases                                                  | 30 (20 development / 10 holdout)                |
| Correct / attempted suggestions                        | 116 / 118                                       |
| Known labelled fields                                  | 155                                             |
| Known-field coverage                                   | 118 / 155 (76.1%)                               |
| Incorrect suggestions                                  | 2                                               |
| Predictions where label is unknown                     | 0                                               |
| Null candidate slots, including absent optional fields | 92 / 210 (43.8%)                                |
| Terminal extraction failures in this run               | 0                                               |
| Development correct / attempted                        | 79 / 79                                         |
| Holdout correct / attempted                            | 37 / 39                                         |
| Duration per case                                      | 7.305–20.532 seconds                            |
| Exact duplicate families                               | sample-19→01 and sample-20→02; both development |

98.3% among attempted suggestions **does not mean 98.3% document accuracy**. Most vendor names were withheld; 39 known fields were not supplied correctly or were absent from predictions. Coverage and error counts must be shown with the numerator/denominator. Unknown optional slots make the all-field abstention rate different from missing-known-field coverage.

Cases cover clear receipts/invoices, ambiguous dates/totals, missing fields, degraded images, instruction-like document text and exact duplicates. This tiny synthetic corpus uses simple rendered templates. Development/holdout splits keep related template/duplicate families together, but synthetic formatting still creates shared structure; it is not independent customer data. Never claim production generalization, safety certification or customer demand.

The initial oversized JSON grammar caused model runner errors. Those earlier diagnostic reports remain under `evals/results/`. A smaller model grammar plus full Zod validation fixed runtime failures. Prompt v2 was tuned using development cases before the full reported run. Do not silently tune on holdout results and continue calling the same set untouched holdout.

## Reproduce

Field-level diagnosis: vendor supplied on 11/30 cases, correct on 9/30; document type supplied correctly on 18/30. The two incorrect suggestions were vendor values. Invoice-number checks cover 15/15 supplied labels; due dates have no positive cases in this dataset and therefore no demonstrated extraction accuracy. This highlights where the next independent evaluation should expand.

Start Ollama with the recorded model installed. `npm run eval` reads fixture images and labels separately: labels never enter the model prompt. It records field values, evidence, model/prompt digest, errors and total wall time; raw result files are in `evals/results/`, and saved web samples/report are updated only by actual runs. `EVAL_LIMIT=6 npm run eval` is a development smoke test, not the complete benchmark.

After evaluating, run `samples:prepare` for thumbnails and `eval:import` for local Quality. `fixtures` regenerates authored fixture states: do not run it and present those authored states as real output. Re-run the model before publishing them. Historical report files are retained; the public Quality screen uses the most recent saved report.

The first call may load a cold model; this run did not separately control/cache-flush cold and warm trials. A subprocess wall-time bound was added after this benchmark; its launch overhead is not part of these recorded timings. Exact digest/temperature do not guarantee bitwise repeatability across hardware/runtime versions. Generated labels and images should receive independent review before any accuracy claim beyond this diagnostic.

import { parentPort } from 'worker_threads';
import { ParserManager } from '../parsers/parser-manager.js';
import type { DetectedFeature } from '../types/index.js';

interface WorkerTask {
  id: string;
  filePath: string;
}

interface WorkerResult {
  id: string;
  features: DetectedFeature[];
  error?: string;
}

const parserManager = new ParserManager(1);

if (parentPort) {
  parentPort.on('message', async (task: WorkerTask) => {
    const result: WorkerResult = {
      id: task.id,
      features: []
    };

    try {
      result.features = await parserManager.parseFile(task.filePath);
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown parsing error';
    }

    parentPort?.postMessage(result);
  });
}

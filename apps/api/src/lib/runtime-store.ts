import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DemoState } from "@pta-pilot/shared";
import { seedDemoState } from "@pta-pilot/shared";

export class RuntimeStore {
  constructor(private readonly filePath: string) {}

  async read(): Promise<DemoState> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as DemoState;
    } catch {
      const initialState = structuredClone(seedDemoState);
      await this.write(initialState);
      return initialState;
    }
  }

  async write(state: DemoState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf-8");
  }
}

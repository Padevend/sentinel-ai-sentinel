import { describe, it, expect } from 'vitest';
import { DoctorEngine, SelfTestRunner } from '../index.js';

describe('DoctorEngine & SelfTestRunner', () => {
  it('should run diagnostic checks and produce a report', async () => {
    const report = await DoctorEngine.diagnose(process.cwd());

    expect(report.version).toBeDefined();
    expect(report.items.length).toBeGreaterThan(0);

    const categories = new Set(report.items.map((i) => i.category));
    expect(categories.has('Environment')).toBe(true);
    expect(categories.has('Filesystem')).toBe(true);

    const formatted = DoctorEngine.formatReport(report);
    expect(formatted).toContain('Sentinel Diagnostics Report');
  });

  it('should run self-test successfully', async () => {
    const result = await SelfTestRunner.run();
    expect(result.output).toBeDefined();
  });
});

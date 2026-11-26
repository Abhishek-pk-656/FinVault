import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const serverErrors: string[] = [];

    page.on('pageerror', (err) => {
      pageErrors.push(err.message || String(err));
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('response', (res) => {
      if (res.status() >= 500) {
        serverErrors.push(`${res.status()} ${res.url()}`);
      }
    });

    await use(page);

    expect(pageErrors, `Uncaught page errors detected:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(consoleErrors, `Console errors detected:\n${consoleErrors.join('\n')}`).toEqual([]);
    expect(serverErrors, `Server 5xx responses detected:\n${serverErrors.join('\n')}`).toEqual([]);
  },
});

export { expect };

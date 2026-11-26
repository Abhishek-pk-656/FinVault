import fs from 'node:fs';
import { test, expect } from './fixtures';
import { AUTH_FILE } from '../playwright.config';

function hasAuthenticatedStorageState(): boolean {
  if (!fs.existsSync(AUTH_FILE)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) as {
      cookies?: Array<{ name?: string; value?: string }>;
    };
    return Boolean(
      parsed.cookies?.some(
        (c) => (c.name?.includes('-auth-token') || c.name === 'finvault-demo') && Boolean(c.value)
      )
    );
  } catch {
    return false;
  }
}

test.describe('Unauthenticated Login Gate', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/login renders cleanly with Google OAuth CTA and zero errors', async ({ page }) => {
    const faviconRes = await page.request.get('/favicon.ico');
    expect(faviconRes.status()).toBe(200);

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'FinVault' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google \(Gmail\)/i })).toBeVisible();

    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(4, 10, 10)'); // #040A0A Obsidian Carbon
  });
});

test.describe('Authenticated FinVault Cockpit Regression', () => {
  test('all authenticated cockpit routes load cleanly with Botanical Minimalist tokens', async ({ page }) => {
    test.skip(!hasAuthenticatedStorageState(), 'E2E test credentials not configured; skipping authenticated route assertions');

    const supabase5xx: string[] = [];
    page.on('response', (res) => {
      if (res.url().includes('supabase.co') && res.status() >= 500) {
        supabase5xx.push(`${res.status()} ${res.url()}`);
      }
    });

    const routes = ['/', '/cash-flow', '/transactions', '/ious'];
    for (const route of routes) {
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/login/);

      // Check #040A0A Obsidian Carbon base background and #DEEEDA Soft Mint text on body
      const bodyStyles = await page.evaluate(() => {
        const s = getComputedStyle(document.body);
        return { bg: s.backgroundColor, color: s.color };
      });
      expect(bodyStyles.bg).toBe('rgb(4, 10, 10)');
      expect(bodyStyles.color).toBe('rgb(222, 238, 218)');
    }

    // Verify Botanical surface card (#DEEEDA / #C7E0BA) and primary accent (#7AAA4A) on /transactions
    await page.goto('/transactions');
    const tokensPresent = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll<HTMLElement>('*'));
      let hasSurfaceMint = false;
      let hasBorderPistachio = false;
      let hasBotanicalGreen = false;

      for (const el of elements) {
        const s = getComputedStyle(el);
        if (s.backgroundColor === 'rgb(222, 238, 218)') hasSurfaceMint = true;
        if (s.borderColor === 'rgb(199, 224, 186)' || s.borderTopColor === 'rgb(199, 224, 186)') {
          hasBorderPistachio = true;
        }
        if (
          s.backgroundColor === 'rgb(122, 170, 74)' ||
          s.color === 'rgb(122, 170, 74)'
        ) {
          hasBotanicalGreen = true;
        }
      }
      return { hasSurfaceMint, hasBorderPistachio, hasBotanicalGreen };
    });

    expect(tokensPresent.hasSurfaceMint, 'Missing #DEEEDA Soft Mint surface').toBe(true);
    expect(tokensPresent.hasBorderPistachio, 'Missing #C7E0BA Sage Pistachio border').toBe(true);
    expect(tokensPresent.hasBotanicalGreen, 'Missing #7AAA4A Botanical Green accent').toBe(true);
    expect(supabase5xx).toEqual([]);
  });

  test('/transactions displays real-time BalanceBadge validation and rejects unbalanced entries', async ({ page }) => {
    test.skip(!hasAuthenticatedStorageState(), 'E2E test credentials not configured; skipping transaction validation test');

    await page.goto('/transactions');
    await expect(page.getByRole('heading', { name: 'New Multi-Split Transaction' })).toBeVisible();

    const badge = page.getByRole('status');
    const submitButton = page.getByRole('button', { name: /Post Transaction/i });
    const descriptionInput = page.getByPlaceholder(/Dinner & Grocery Split/i);
    const amountInputs = page.locator('input[inputmode="decimal"]');

    await expect(amountInputs).toHaveCount(2);
    await expect(badge).toContainText('Balanced');
    await expect(submitButton).toBeDisabled();

    await descriptionInput.fill('Playwright Double-Entry Verification');

    // Enter debit leg of ₹100.00 while credit remains ₹0.00 -> unbalanced
    await amountInputs.nth(0).fill('100.00');
    await expect(badge).toContainText('Difference: ₹100.00');
    await expect(badge).toHaveAttribute('aria-label', /Ledger Imbalance/i);
    await expect(submitButton).toBeDisabled();

    // Enter partial credit leg of ₹40.00 -> still unbalanced (₹60.00 difference)
    await amountInputs.nth(1).fill('40.00');
    await expect(badge).toContainText('Difference: ₹60.00');
    await expect(submitButton).toBeDisabled();

    // Balance both legs (₹100.00 debit == ₹100.00 credit) -> Balanced & submittable
    await amountInputs.nth(1).fill('100.00');
    await expect(badge).toContainText('Balanced');
    await expect(badge).toHaveAttribute('aria-label', 'Ledger Balanced');
    await expect(submitButton).toBeEnabled();
  });
});

import { expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, USERS, type UserKey } from './env';

/** Logs in through the real login form (does not wait for the redirect). */
export async function loginAs(page: Page, user: UserKey, password: string = E2E_PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByPlaceholder('Username').fill(USERS[user].username);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

export async function loginAndLand(page: Page, user: UserKey): Promise<void> {
  await loginAs(page, user);
  await expect(page).not.toHaveURL(/\/login/);
}

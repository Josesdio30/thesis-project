/**
 * CUJ-7 — login, redirect, session. Requirements: FR-AUTH-1, FR-AUTH-4, FR-ADM-1 (CUJ-3 slice).
 * Cookie clearing on expiry (FR-AUTH-3) is unit-tested in tests/middleware.test.ts.
 * Oracles: URL, visible error text, session cookie presence, API status.
 */
import { test, expect } from '@playwright/test';
import { BAD_PASSWORD, USERS } from './support/env';
import { loginAs } from './support/auth';

test.describe('CUJ-7 authentication', () => {
  test('FR-AUTH-4: an anonymous visit to /course redirects to /login with the callbackUrl', async ({ page }) => {
    await page.goto('/course');
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fcourse$/);
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('FR-AUTH-1: a student with valid credentials reaches the dashboard and gets a session cookie', async ({ page, context }) => {
    await loginAs(page, 'student');
    await expect(page).toHaveURL(/\/dashboard/);
    const cookies = await context.cookies();
    expect(cookies.some(c => c.name.includes('next-auth.session-token'))).toBe(true);
  });

  test('FR-AUTH-1: a wrong password shows a generic error, stays on /login and sets no session cookie', async ({ page, context }) => {
    await loginAs(page, 'student', BAD_PASSWORD);
    await expect(page.getByText('Invalid username or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    const cookies = await context.cookies();
    expect(cookies.some(c => c.name.includes('next-auth.session-token'))).toBe(false);
  });

  test('FR-AUTH-1: an unknown username gets the same generic error (no account enumeration)', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username').fill('nobody_here');
    await page.getByPlaceholder('Password').fill(BAD_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText('Invalid username or password')).toBeVisible();
  });

  test('FR-AUTH-1: usernames are matched exactly (upper-cased username is rejected)', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username').fill(USERS.student.username.toUpperCase());
    await page.getByPlaceholder('Password').fill(BAD_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText('Invalid username or password')).toBeVisible();
  });

  test('FR-AUTH-4: a signed-in user visiting /login is sent to /dashboard', async ({ page }) => {
    await loginAs(page, 'teacher');
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('FR-ADM-1 / CUJ-3: a signed-in student gets 403 from an admin API', async ({ page }) => {
    await loginAs(page, 'student');
    await expect(page).toHaveURL(/\/dashboard/);
    const res = await page.request.get('/api/admin/users');
    expect(res.status()).toBe(403);
  });

  test('FR-ADM-1: a signed-in admin can call the admin API', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).not.toHaveURL(/\/login/);
    const res = await page.request.get('/api/admin/users');
    expect(res.status()).toBe(200);
  });
});

import { expect, test } from '@playwright/test';
import { expectNoA11yViolations, linkFromEmail, uniqueEmail, waitForEmail } from './helpers';

const PASSWORD = 'a-long-test-password';
const NEW_PASSWORD = 'an-even-longer-password';

test('kayıt → panel → çıkış → giriş → şifre sıfırlama → yeni şifreyle giriş', async ({ page }) => {
  const email = uniqueEmail('flow');

  // Kayıt
  await page.goto('/en/signup');
  await page.getByLabel('Your name').fill('Test User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Panel: karşılama, kurulum listesi ve doğrulama şeridi
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Welcome, Test User' })).toBeVisible();
  await expect(page.getByText(`We sent a link to ${email}`)).toBeVisible();
  await expectNoA11yViolations(page);

  // Sayfa yenilense de oturum (httpOnly refresh çereziyle) devam eder
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, Test User' })).toBeVisible();

  // Menü gezinmesi
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Content' }).click();
  await expect(page.getByRole('heading', { name: 'No articles yet' })).toBeVisible();

  // Çıkış
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/en\/login$/);

  // Çıkıştan sonra panel giriş ister
  await page.goto('/app');
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fapp$/);

  // Yanlış şifre: insan dilinde hata
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('wrong-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText("That email and password don't match");

  // Doğru şifre: next parametresine döner
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);

  // Şifre sıfırlama
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  const mail = await waitForEmail(email, 'Reset your Kitisel password');
  await page.goto(linkFromEmail(mail, '/en/reset-password').replace(/^https?:\/\/[^/]+/, ''));
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: 'Your password has been changed' })).toBeVisible();

  await page.getByRole('link', { name: 'Sign in' }).last().click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test('e-posta doğrulama linki hesabı doğrular ve şeridi kaldırır', async ({ page }) => {
  const email = uniqueEmail('verify');
  await page.goto('/en/signup');
  await page.getByLabel('Your name').fill('Verify Me');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);

  const mail = await waitForEmail(email, 'Confirm your email address');
  await page.goto(linkFromEmail(mail, '/en/verify-email').replace(/^https?:\/\/[^/]+/, ''));
  await expect(page.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue to Kitisel' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Verify Me' })).toBeVisible();
  await expect(page.getByText('Please confirm your email address')).toHaveCount(0);
});

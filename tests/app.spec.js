// @ts-check
const { test, expect } = require('/opt/node22/lib/node_modules/playwright/test.js');

const BASE = 'http://localhost:4173/byu-plan';

async function clearStorage(page) {
  await page.goto(BASE);
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k => k.startsWith('byu-')).forEach(k => localStorage.removeItem(k));
  });
  await page.reload();
  await page.waitForTimeout(500);
}

// Exact race-type label (emoji included) to avoid Halbmarathon ⊃ Marathon clash
const RACE_LABEL = {
  backyard:    '🏕️ Backyard Ultra',
  marathon:    '🏆 Marathon',
  halfmarathon:'🥈 Halbmarathon',
  '10k':       '🏃 10 km',
};

// Maps internal restDay value to display label
const REST_LABEL = {MO:'Mo',DI:'Di',MI:'Mi',DO:'Do',FR:'Fr',SA:'Sa',SO:'So'};
const STR_MAIN  = ['Kein Krafttraining','1× pro Woche','2× pro Woche'];

async function completeWizard(page, opts = {}) {
  const {
    raceKind      = 'backyard',
    sessionsPerWeek = 4,
    strengthDays  = 0,
    restDay       = 'SO',
    name          = 'Testathlet',
    pace          = '6:00',
  } = opts;

  // Step 1 – Rennen
  await page.locator('span', { hasText: RACE_LABEL[raceKind] }).click();
  await page.getByText('WEITER').click();

  // Step 2 – Name
  await page.getByPlaceholder('Felix').fill(name);
  await page.getByText('WEITER').click();

  // Step 3 – Ziel (first goal radio option)
  await page.locator('div[style*="cursor: pointer"]').first().click();
  await page.getByText('WEITER').click();

  // Step 4 – Trainingsumfang: sessions/week div has exact text (no sublabel)
  const sessLabel = `${sessionsPerWeek}× pro Woche`;
  await page.locator('div').filter({ hasText: new RegExp(`^${sessLabel}$`) }).first().click();
  // Rest day pill (exact short label like "So")
  await page.getByText(REST_LABEL[restDay] ?? 'So', { exact: true }).first().click();
  await page.getByText('WEITER').click();

  // Step 5 – Krafttraining: label is in a span (sibling sublabel makes div text longer)
  await page.locator('span').filter({ hasText: new RegExp(`^${STR_MAIN[strengthDays]}$`) })
    .first().click();
  await page.getByText('WEITER').click();

  // Step 6 – Fitness: fill optional Strava pace override (stays in Strava mode)
  // The Strava pace-override input is always visible; filling it sets the pace
  const paceInput = page.locator('input[placeholder]').first();
  await paceInput.fill(pace);
  await page.getByText('PLAN STARTEN').click();
  await page.waitForTimeout(1500);
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Wizard Navigation', () => {
  test.beforeEach(async ({ page }) => { await clearStorage(page); });

  test('shows SCHRITT 1/6 and WELCHES RENNEN on load', async ({ page }) => {
    await expect(page.getByText('SCHRITT 1 / 6')).toBeVisible();
    await expect(page.getByText('WELCHES RENNEN?')).toBeVisible();
  });

  test('WEITER advances all 6 steps in order', async ({ page }) => {
    // Step 1 → 2
    await page.locator('span', { hasText: RACE_LABEL.backyard }).click();
    await page.getByText('WEITER').click();
    await expect(page.getByText('SCHRITT 2 / 6')).toBeVisible();

    // Step 2 → 3
    await page.getByText('WEITER').click();
    await expect(page.getByText('SCHRITT 3 / 6')).toBeVisible();

    // Step 3 → 4
    await page.locator('div[style*="cursor: pointer"]').first().click();
    await page.getByText('WEITER').click();
    await expect(page.getByText('SCHRITT 4 / 6')).toBeVisible();

    // Step 4 → 5
    await page.locator('span', { hasText: '4× pro Woche' }).click();
    await page.getByText('WEITER').click();
    await expect(page.getByText('SCHRITT 5 / 6')).toBeVisible();

    // Step 5 → 6
    await page.locator('span', { hasText: 'Kein Krafttraining' }).click();
    await page.getByText('WEITER').click();
    await expect(page.getByText('SCHRITT 6 / 6')).toBeVisible();
  });

  test('ZURÜCK goes back from step 3 → 2 → 1', async ({ page }) => {
    await page.locator('span', { hasText: RACE_LABEL.backyard }).click();
    await page.getByText('WEITER').click();
    await page.getByText('WEITER').click();
    await expect(page.getByText('SCHRITT 3 / 6')).toBeVisible();

    await page.getByText('ZURÜCK').click();
    await expect(page.getByText('SCHRITT 2 / 6')).toBeVisible();

    await page.getByText('ZURÜCK').click();
    await expect(page.getByText('SCHRITT 1 / 6')).toBeVisible();
  });

  test('ZURÜCK from step 6 → 5 → 4', async ({ page }) => {
    await page.locator('span', { hasText: RACE_LABEL.marathon }).click();
    await page.getByText('WEITER').click();
    await page.getByText('WEITER').click();
    await page.locator('div[style*="cursor: pointer"]').first().click();
    await page.getByText('WEITER').click();
    await page.locator('span', { hasText: '4× pro Woche' }).click();
    await page.getByText('WEITER').click();
    await page.locator('span', { hasText: 'Kein Krafttraining' }).click();
    await page.getByText('WEITER').click();
    await expect(page.getByText('SCHRITT 6 / 6')).toBeVisible();

    await page.getByText('ZURÜCK').click();
    await expect(page.getByText('SCHRITT 5 / 6')).toBeVisible();

    await page.getByText('ZURÜCK').click();
    await expect(page.getByText('SCHRITT 4 / 6')).toBeVisible();
  });
});

test.describe('Race Type → Goals', () => {
  test.beforeEach(async ({ page }) => { await clearStorage(page); });

  async function goToGoalStep(page, raceKind) {
    await page.locator('span', { hasText: RACE_LABEL[raceKind] }).click();
    await page.getByText('WEITER').click();
    await page.getByText('WEITER').click(); // skip name step
  }

  test('Marathon shows Sub 5:00h / Sub 3:00h goals', async ({ page }) => {
    await goToGoalStep(page, 'marathon');
    await expect(page.getByText('Sub 5:00h')).toBeVisible();
    await expect(page.getByText('Sub 3:00h')).toBeVisible();
    await expect(page.getByText('12+ Loops')).not.toBeVisible();
  });

  test('Halbmarathon shows Sub 2:00h / Sub 1:30h', async ({ page }) => {
    await goToGoalStep(page, 'halfmarathon');
    await expect(page.getByText('Sub 2:00h')).toBeVisible();
    await expect(page.getByText('Sub 1:30h')).toBeVisible();
    await expect(page.getByText('Sub 3:00h')).not.toBeVisible();
  });

  test('10km shows Sub 60 min / Sub 40 min', async ({ page }) => {
    await goToGoalStep(page, '10k');
    await expect(page.getByText('Sub 60 min')).toBeVisible();
    await expect(page.getByText('Sub 40 min')).toBeVisible();
  });

  test('Backyard shows 12+ / 16+ Loops', async ({ page }) => {
    await goToGoalStep(page, 'backyard');
    await expect(page.getByText('12+ Loops')).toBeVisible();
    await expect(page.getByText('16+ Loops')).toBeVisible();
  });
});

test.describe('Plan Creation', () => {
  test.beforeEach(async ({ page }) => { await clearStorage(page); });

  test('wizard completes and shows plan overview', async ({ page }) => {
    await completeWizard(page, { raceKind: 'backyard' });
    await expect(page.getByText('WOCHEN').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('SCHRITT 1 / 6')).not.toBeVisible();
  });

  test('marathon plan shows 16 weeks', async ({ page }) => {
    await completeWizard(page, { raceKind: 'marathon', pace: '5:30' });
    await expect(page.getByText('16 WOCHEN')).toBeVisible({ timeout: 5000 });
  });

  test('Halbmarathon plan shows 12 weeks', async ({ page }) => {
    await completeWizard(page, { raceKind: 'halfmarathon', pace: '5:30' });
    await expect(page.getByText('12 WOCHEN')).toBeVisible({ timeout: 5000 });
  });

  test('10km plan shows 8 weeks', async ({ page }) => {
    await completeWizard(page, { raceKind: '10k', pace: '5:00' });
    await expect(page.getByText('8 WOCHEN')).toBeVisible({ timeout: 5000 });
  });

  test('plan contains personalised pace (format X:XX/km)', async ({ page }) => {
    await completeWizard(page, { raceKind: 'backyard', pace: '6:00' });
    // Click the first week row to open it
    await page.locator('div[style*="cursor: pointer"]').first().click();
    await page.waitForTimeout(500);
    // Session details should show formatted paces
    await expect(page.getByText(/\d:\d{2}.*\/km/).first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Trainingsumfang & Ruhetag', () => {
  test.beforeEach(async ({ page }) => { await clearStorage(page); });

  test('3× per week: plan shows at most 3 running sessions in first week', async ({ page }) => {
    await completeWizard(page, { sessionsPerWeek: 3, pace: '6:00' });
    // Open first week
    await page.locator('div[style*="cursor: pointer"]').first().click();
    await page.waitForTimeout(500);
    // Count EASY + QUALITY + LONG badges — should be ≤ 3
    const running = ['EASY', 'QUALITY', 'LONG'];
    let total = 0;
    for (const label of running) {
      total += await page.getByText(label, { exact: true }).count();
    }
    expect(total).toBeLessThanOrEqual(3);
  });

  test('6× per week keeps all sessions', async ({ page }) => {
    await completeWizard(page, { sessionsPerWeek: 6, pace: '6:00' });
    await page.locator('div[style*="cursor: pointer"]').first().click();
    await page.waitForTimeout(500);
    const running = ['EASY', 'QUALITY', 'LONG'];
    let total = 0;
    for (const label of running) {
      total += await page.getByText(label, { exact: true }).count();
    }
    expect(total).toBeGreaterThan(3);
  });

  test('fixed rest day SO: Sunday session shows OFF in week', async ({ page }) => {
    await completeWizard(page, { restDay: 'SO', sessionsPerWeek: 5, pace: '6:00' });
    await page.locator('div[style*="cursor: pointer"]').first().click();
    await page.waitForTimeout(500);
    // The SO day should show OFF badge not a running badge
    const offBadges = await page.getByText('OFF', { exact: true }).count();
    expect(offBadges).toBeGreaterThan(0);
  });
});

test.describe('Krafttraining', () => {
  test.beforeEach(async ({ page }) => { await clearStorage(page); });

  test('1× Kraft: first week contains a KRAFT session', async ({ page }) => {
    await completeWizard(page, { strengthDays: 1, sessionsPerWeek: 5, pace: '6:00' });
    // Open first week
    await page.locator('div[style*="cursor: pointer"]').first().click();
    await page.waitForTimeout(500);
    await expect(page.getByText('KRAFT 💪').first()).toBeVisible({ timeout: 5000 });
  });

  test('no Kraft: plan contains no KRAFT badge', async ({ page }) => {
    await completeWizard(page, { strengthDays: 0, pace: '6:00' });
    await page.locator('div[style*="cursor: pointer"]').first().click();
    await page.waitForTimeout(500);
    const kraftCount = await page.getByText('KRAFT 💪').count();
    expect(kraftCount).toBe(0);
  });
});

test.describe('Plan Management', () => {
  test.beforeEach(async ({ page }) => { await clearStorage(page); });

  test('profile list shows after clearing active-id, with NEUE KONFIGURATION', async ({ page }) => {
    await completeWizard(page, { name: 'Plan A' });
    await page.evaluate(() => {
      Object.keys(localStorage).filter(k => k.includes('active-profile-id')).forEach(k => localStorage.removeItem(k));
    });
    await page.reload();
    await expect(page.getByText('NEUE KONFIGURATION')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Plan A').first()).toBeVisible();
  });

  test('delete button removes plan and shows wizard', async ({ page }) => {
    await completeWizard(page, { name: 'Loesch Mich' });
    await page.evaluate(() => {
      Object.keys(localStorage).filter(k => k.includes('active-profile-id')).forEach(k => localStorage.removeItem(k));
    });
    await page.reload();
    await expect(page.getByText('✕ LÖSCHEN')).toBeVisible({ timeout: 5000 });
    page.once('dialog', d => d.accept());
    await page.getByText('✕ LÖSCHEN').first().click();
    await page.waitForTimeout(1000);
    // After deletion of last plan, wizard appears
    await expect(page.getByText('WELCHES RENNEN?')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Design', () => {
  test.beforeEach(async ({ page }) => { await clearStorage(page); });

  test('primary color is orange not indigo', async ({ page }) => {
    // The BYU PLAN gradient uses #ff6500 — check computed backgroundImage of title
    const gradient = await page.locator('div').filter({ hasText: /^BYU PLAN$/ }).first()
      .evaluate(el => window.getComputedStyle(el).backgroundImage);
    // Computed style converts hex to rgb: #ff6500 → rgb(255, 101, 0)
    expect(gradient).toContain('255, 101, 0');
    expect(gradient).not.toContain('99, 102, 241'); // not indigo
  });

  test('WEITER button is orange', async ({ page }) => {
    const bg = await page.getByText('WEITER').last()
      .evaluate(el => window.getComputedStyle(el).backgroundColor);
    expect(bg).toContain('255'); // orange has R=255
    expect(bg).not.toContain('99, 102, 241');
  });

  test('app background is near-black', async ({ page }) => {
    // The outer app div has background #0d0d0d
    const bg = await page.locator('div[style*="background"]').first()
      .evaluate(el => window.getComputedStyle(el).backgroundColor);
    // #0d0d0d = rgb(13, 13, 13) — very dark
    const rgb = bg.match(/\d+/g)?.map(Number) ?? [255,255,255];
    const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
    expect(brightness).toBeLessThan(30); // very dark
  });

  test('selected race type shows orange border', async ({ page }) => {
    await page.locator('span', { hasText: RACE_LABEL.marathon }).click();
    const border = await page.locator('span', { hasText: RACE_LABEL.marathon })
      .locator('..')
      .evaluate(el => window.getComputedStyle(el).borderColor);
    expect(border).toContain('255'); // orange
    expect(border).not.toContain('99, 102, 241');
  });
});

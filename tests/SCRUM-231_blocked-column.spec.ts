import { test, expect } from '@playwright/test';

test.describe('[SCRUM-231] Blocked-Spalte hinzufügen', () => {

  test.beforeEach(async ({ page }) => {
    // Klaren Zustand für jeden Test — kein leftover localStorage
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Warten bis Spalten und Karten gerendert sind
    await page.waitForSelector('.column');
    await page.waitForSelector('.card');
  });

  // ---- AC 1: Neue "Blocked"-Spalte ist auf dem Board sichtbar ----

  test('AC-1: Blocked-Spalte ("Blockiert") ist auf dem Board sichtbar', async ({ page }) => {
    const blockedColumn = page.locator('.column[data-status="blocked"]');
    await expect(blockedColumn).toBeVisible();
  });

  test('AC-1: Blocked-Spalte hat den Titel "Blockiert"', async ({ page }) => {
    const blockedColumn = page.locator('.column[data-status="blocked"]');
    const title = blockedColumn.locator('.column-title');
    await expect(title).toBeVisible();
    await expect(title).toContainText('Blockiert');
  });

  // ---- AC 2: Spalte erscheint zwischen "In Progress" und "Done" ----

  test('AC-2: Blocked-Spalte erscheint zwischen "In Bearbeitung" und "Erledigt"', async ({ page }) => {
    const columnOrder = await page.locator('.column').evaluateAll(columns =>
      columns.map(col => col.dataset.status)
    );
    // Erwartete Reihenfolge: neu, inprogress, blocked, erledigt
    expect(columnOrder).toEqual(['neu', 'inprogress', 'blocked', 'erledigt']);
  });

  test('AC-2: Es gibt insgesamt 4 Spalten auf dem Board', async ({ page }) => {
    const columnCount = await page.locator('.column').count();
    expect(columnCount).toBe(4);
  });

  // ---- AC 3: Karten können per Drag & Drop in die "Blocked"-Spalte verschoben werden ----

  test('AC-3: Karte kann per Drag & Drop in "Blocked"-Spalte verschoben werden', async ({ page }) => {
    // Hole eine Karte aus der "Neu"-Spalte
    const card = page.locator('[data-status="neu"] .card').first();
    const cardTitle = await card.locator('.card-title').textContent();
    expect(cardTitle).not.toBe('');

    // Drag & Drop in die "Blocked"-Spalte
    const blockedDropZone = page.locator('[data-status="blocked"] .column-cards');
    await card.dragTo(blockedDropZone);

    // Karte sollte in "Blocked"-Spalte erscheinen
    const cardInBlocked = page.locator('[data-status="blocked"] .card', { hasText: cardTitle });
    await expect(cardInBlocked).toBeVisible();

    // Karte sollte aus "Neu"-Spalte verschwunden sein
    const cardInNew = page.locator('[data-status="neu"] .card', { hasText: cardTitle });
    await expect(cardInNew).not.toBeVisible({ timeout: 2000 });
  });

  test('AC-3: Kartenzähler aktualisiert sich nach Drag & Drop', async ({ page }) => {
    // Zähler vor dem Drag & Drop
    const newCountBefore = await page.locator('[data-status="neu"] .column-count').textContent();
    const blockedCountBefore = await page.locator('[data-status="blocked"] .column-count').textContent();

    // Karte in "Blocked" ziehen
    const card = page.locator('[data-status="neu"] .card').first();
    const cardTitle = await card.locator('.card-title').textContent();
    const blockedDropZone = page.locator('[data-status="blocked"] .column-cards');
    await card.dragTo(blockedDropZone);

    // Zähler nach dem Drag & Drop
    const newCountAfter = await page.locator('[data-status="neu"] .column-count').textContent();
    const blockedCountAfter = await page.locator('[data-status="blocked"] .column-count').textContent();

    const beforeNew = parseInt(newCountBefore, 10);
    const beforeBlocked = parseInt(blockedCountBefore, 10);

    expect(parseInt(newCountAfter, 10)).toBe(beforeNew - 1);
    expect(parseInt(blockedCountAfter, 10)).toBe(beforeBlocked + 1);
  });

  // ---- AC 4: Visuelle Hervorhebung (rote Akzentfarbe) ----

  test('AC-4: Blocked-Spalte hat rote Akzentfarbe am Header-Bottom-Border', async ({ page }) => {
    const blockedHeader = page.locator('[data-status="blocked"] .column-header');
    const borderBottomColor = await blockedHeader.evaluate(el => {
      return getComputedStyle(el).borderBottomColor;
    });
    // --color-column-blocked ist #d73a49 = rgb(215, 58, 73)
    expect(borderBottomColor).toContain('215');
    expect(borderBottomColor).toContain('58');
    expect(borderBottomColor).toContain('73');
  });

  test('AC-4: Blocked-Spalte verwendet --color-column-blocked CSS Variable', async ({ page }) => {
    const cssVarValue = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-column-blocked').trim();
    });
    // #d73a49 ist rot
    expect(cssVarValue).toBe('#d73a49');
  });

  // ---- AC 5: Persistente Speicherung (über Neuladen) ----

  test('AC-5: In Blocked-Spalte platzierte Karte bleibt nach Reload erhalten', async ({ page }) => {
    // Karte in "Blocked" ziehen
    const card = page.locator('[data-status="neu"] .card').first();
    const cardTitle = await card.locator('.card-title').textContent();
    const blockedDropZone = page.locator('[data-status="blocked"] .column-cards');
    await card.dragTo(blockedDropZone);

    // Erneut laden
    await page.reload();
    await page.waitForSelector('.card');

    // Karte sollte immer noch in "Blocked"-Spalte sein
    const cardInBlockedAfter = page.locator('[data-status="blocked"] .card', { hasText: cardTitle });
    await expect(cardInBlockedAfter).toBeVisible();
  });

  test('AC-5: Blocked-Zustand wird in localStorage gespeichert (kanban_board_data)', async ({ page }) => {
    // Karte in "Blocked" ziehen
    const card = page.locator('[data-status="neu"] .card').first();
    const cardTitle = await card.locator('.card-title').textContent();
    const blockedDropZone = page.locator('[data-status="blocked"] .column-cards');
    await card.dragTo(blockedDropZone);

    // localStorage prüfen
    const storedData = await page.evaluate(() => {
      const raw = localStorage.getItem('kanban_board_data');
      return raw ? JSON.parse(raw) : null;
    });

    expect(storedData.cards).toBeDefined();
    const cardInData = storedData.cards.find(c => c.title === cardTitle);
    expect(cardInData).toBeDefined();
    expect(cardInData.status).toBe('blocked');
  });

  // ---- AC 6: Dark- und Light-Mode ----

  test('AC-6: Blocked-Spalte funktioniert im Light-Mode (Standard)', async ({ page }) => {
    const blockedColumn = page.locator('.column[data-status="blocked"]');
    await expect(blockedColumn).toBeVisible();

    // Light-Mode: keine .dark Klasse auf <html>
    const htmlClass = await page.locator('html').getAttribute('class');
    // getAttribute('class') gibt null zurück wenn keine Klasse existiert — das bestätigt Light-Mode
    if (htmlClass !== null) {
      expect(htmlClass).not.toMatch(/dark/);
    }

    // Border sollte die Light-Mode Block-Farbe sein (#d73a49)
    const borderBottomColor = await blockedColumn.locator('.column-header').evaluate(el => {
      return getComputedStyle(el).borderBottomColor;
    });
    expect(borderBottomColor).toContain('215');
    expect(borderBottomColor).toContain('58');
    expect(borderBottomColor).toContain('73');
  });

  test('AC-6: Blocked-Spalte funktioniert im Dark-Mode', async ({ page }) => {
    // Dark Mode aktivieren
    const toggle = page.locator('#theme-toggle');
    await toggle.click();
    await page.waitForTimeout(400); // CSS Transition abwarten

    // Blocked-Spalte sollte sichtbar bleiben
    const blockedColumn = page.locator('.column[data-status="blocked"]');
    await expect(blockedColumn).toBeVisible();

    // Dark-Mode Farbe sollte #f85149 sein = rgb(248, 81, 73)
    const borderBottomColor = await blockedColumn.locator('.column-header').evaluate(el => {
      return getComputedStyle(el).borderBottomColor;
    });
    expect(borderBottomColor).toContain('248');
    expect(borderBottomColor).toContain('81');
    expect(borderBottomColor).toContain('73');
  });

  test('AC-6: Karte kann im Dark-Mode in Blocked-Spalte per Drag & Drop verschoben werden', async ({ page }) => {
    // Dark Mode aktivieren
    const toggle = page.locator('#theme-toggle');
    await toggle.click();
    await page.waitForTimeout(400);

    // Karte in "Blocked" ziehen
    const card = page.locator('[data-status="neu"] .card').first();
    const cardTitle = await card.locator('.card-title').textContent();
    const blockedDropZone = page.locator('[data-status="blocked"] .column-cards');
    await card.dragTo(blockedDropZone);

    // Karte sollte in "Blocked"-Spalte erscheinen (auch im Dark-Mode)
    const cardInBlocked = page.locator('[data-status="blocked"] .card', { hasText: cardTitle });
    await expect(cardInBlocked).toBeVisible();
  });
});

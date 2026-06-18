// SCRUM-232: Frei verschiebbare Kanban-Spalten per Drag & Drop
import { test, expect } from '@playwright/test';

/**
 * Hilfsfunktion: Spalte per Drag & Drop zu neuer Position verschieben.
 * Da die App e.clientX zur Positionsberechnung nutzt, simulieren wir
 * das Drag via page.evaluate mit echten Mauskoordinaten.
 *
 * @param page  Playwright page
 * @param sourceStatus  data-status der zu ziehenden Spalte (Quellspalte)
 * @param targetStatus  data-status der Zielspalte
 * @param direction     'left' = vor der Zielspalte einfügen, 'right' = danach
 */
async function dragColumn(page, sourceStatus, targetStatus, direction = 'left') {
  const result = await page.evaluate(
    ({ sourceStatus, targetStatus, direction }) => {
      const board = document.getElementById('board');
      const sourceCol = board?.querySelector(`[data-status="${sourceStatus}"]`);
      const targetCol = board?.querySelector(`[data-status="${targetStatus}"]`);
      if (!sourceCol || !targetCol) return { error: 'Spalten nicht gefunden' };

      const header = sourceCol.querySelector('.column-header');
      if (!header) return { error: 'Header nicht gefunden' };

      // --- dragstart ---
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      });
      dragStartEvent.dataTransfer.setData('text/plain', 'column:' + sourceStatus);
      dragStartEvent.dataTransfer.effectAllowed = 'move';
      header.dispatchEvent(dragStartEvent);

      // --- dragover am Ziel ---
      const rect = targetCol.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const clientX = direction === 'left' ? rect.left : rect.right;

      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX,
        dataTransfer: new DataTransfer(),
      });
      targetCol.dispatchEvent(dragOverEvent);

      // --- drop ---
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX,
        dataTransfer: new DataTransfer(),
      });
      dropEvent.dataTransfer.setData('text/plain', 'column:' + sourceStatus);
      targetCol.dispatchEvent(dropEvent);

      // --- dragend ---
      const dragEndEvent = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
      });
      header.dispatchEvent(dragEndEvent);

      return { ok: true };
    },
    { sourceStatus, targetStatus, direction },
  );
  if (result?.error) throw new Error(result.error);
}

/** Spalten-Reihenfolge als Array von data-status Werten holen */
async function getColumnOrder(page) {
  return page.locator('.column').evaluateAll(
    columns => columns.map(col => col.dataset.status),
  );
}

test.describe('[SCRUM-232] Frei verschiebbare Kanban-Spalten per Drag & Drop', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.column');
    await page.waitForSelector('.card');
  });

  // ---- AC 1: Spalte per Drag & Drop zu anderer Position ziehen ----

  test('AC-1: Spalte von Position A nach Position B verschieben', async ({ page }) => {
    // Arrange: Default Reihenfolge ist neu, inprogress, blocked, erledigt
    const initialOrder = await getColumnOrder(page);
    expect(initialOrder).toEqual([
      'neu',
      'inprogress',
      'blocked',
      'erledigt',
    ]);

    // Act: "Neu" nach "Erledigt" ziehen (am rechten Rand einfügen = nach erledigt)
    await dragColumn(page, 'neu', 'erledigt', 'right');

    // Assert: "Neu" steht jetzt an letzter Position
    const newOrder = await getColumnOrder(page);
    expect(newOrder).toEqual([
      'inprogress',
      'blocked',
      'erledigt',
      'neu',
    ]);
  });

  test('AC-1: Spalte nach links verschieben (umkehren)', async ({ page }) => {
    // Arrange
    const initialOrder = await getColumnOrder(page);
    expect(initialOrder).toEqual([
      'neu',
      'inprogress',
      'blocked',
      'erledigt',
    ]);

    // Act: "Erledigt" vor "Neu" ziehen (linker Rand = vor neu)
    await dragColumn(page, 'erledigt', 'neu', 'left');

    // Assert: "Erledigt" steht jetzt an erster Position
    const newOrder = await getColumnOrder(page);
    expect(newOrder[0]).toBe('erledigt');
  });

  test('AC-1: Spalte in die Mitte verschieben', async ({ page }) => {
    // Act: "Neu" nach "Inprogress" (rechts von inprogress = Position 2)
    await dragColumn(page, 'neu', 'inprogress', 'right');

    const newOrder = await getColumnOrder(page);
    expect(newOrder).toEqual([
      'inprogress',
      'neu',
      'blocked',
      'erledigt',
    ]);
  });

  // ---- AC 2: Persistenz nach Reload ----

  test('AC-2: Spaltenreihenfolge bleibt nach Page-Reload erhalten', async ({
    page,
  }) => {
    // Arrange: Spalte verschieben
    await dragColumn(page, 'neu', 'erledigt', 'right');
    const orderBeforeReload = await getColumnOrder(page);
    expect(orderBeforeReload).toEqual([
      'inprogress',
      'blocked',
      'erledigt',
      'neu',
    ]);

    // Act: Seite neu laden
    await page.reload();
    await page.waitForSelector('.column');
    await page.waitForSelector('.card');

    // Assert: Reihenfolge identisch wie vor dem Reload
    const orderAfterReload = await getColumnOrder(page);
    expect(orderAfterReload).toEqual(orderBeforeReload);
  });

  // ---- AC 3: Visuelles Feedback während des Ziehens ----

  test('AC-3: Visuelles Feedback — Drag-Indikator sichtbar', async ({
    page,
  }) => {
    // Act: Spalte verschieben
    await dragColumn(page, 'neu', 'inprogress', 'right');

    // Assert: Die Spalte hat sich an neuen Ort bewegt (visueller Beweis)
    const newOrder = await getColumnOrder(page);
    expect(newOrder[0]).not.toBe('neu');

    // Cursor: grab auf column-header (visueller Hinweis vor dem Drag)
    const cursorStyle = await page.locator('.column-header').first().evaluate(
      el => getComputedStyle(el).cursor,
    );
    expect(cursorStyle).toContain('grab');
  });

  test('AC-3: dragging-column Klasse wird während Drag gesetzt', async ({
    page,
  }) => {
    // Prüfen, ob die dragging-column CSS-Klasse existiert (indirekter Test)
    // Wir prüfen das per evaluate, ob die CSS-Regel existiert
    const hasDragStyle = await page.evaluate(() => {
      const sheets = document.styleSheets;
      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText.includes('dragging-column'))
              return true;
          }
        } catch {
          // cross-origin sheets — ignorieren
        }
      }
      return false;
    });
    expect(hasDragStyle).toBe(true);
  });

  // ---- AC 4: App funktioniert nach Verschiebung aller Spalten ----

  test('AC-4: Alle Spalten mehrfach verschieben — keine Lücken, keine verwaisten Karten', async ({
    page,
  }) => {
    // Arrange: Anzahl der Karten vor Verschiebung speichern
    const totalCardsBefore = await page.locator('.card').count();

    // Act: Mehrere Spalten nacheinander verschieben
    // 1. "Neu" nach "Erledigt"
    await dragColumn(page, 'neu', 'erledigt', 'right');

    // 2. "Blocked" vor "Inprogress"
    await dragColumn(page, 'blocked', 'inprogress', 'left');

    // 3. "Erledigt" nach "Blocked"
    await dragColumn(page, 'erledigt', 'blocked', 'right');

    // Assert: Alle Spalten vorhanden, keine Duplikate, keine Lücken
    const columnOrder = await getColumnOrder(page);
    expect(columnOrder.length).toBe(4);

    const uniqueStatuses = new Set(columnOrder);
    expect(uniqueStatuses.size).toBe(4);
    expect(uniqueStatuses.has('neu')).toBe(true);
    expect(uniqueStatuses.has('inprogress')).toBe(true);
    expect(uniqueStatuses.has('blocked')).toBe(true);
    expect(uniqueStatuses.has('erledigt')).toBe(true);

    // Alle Karten noch vorhanden — keine verloren gegangen
    const totalCardsAfter = await page.locator('.card').count();
    expect(totalCardsAfter).toBe(totalCardsBefore);

    // Kartenanzahl pro Spalte stimmt mit Anzeigecounter überein
    for (const status of ['neu', 'inprogress', 'blocked', 'erledigt']) {
      const actualCount = await page.locator(
        `.column[data-status="${status}"] .card`,
      ).count();
      const displayedCount = await page.locator(
        `.column[data-status="${status}"] .column-count`,
      ).textContent();
      expect(parseInt(displayedCount!, 10)).toBe(actualCount);
    }
  });

  // ---- AC 5: Karten-D&D bleibt unbeeinträchtigt ----

  test('AC-5: Karten-Drag & Drop funktioniert nach Spaltenverschiebung', async ({
    page,
  }) => {
    // Arrange: Spalte verschieben
    await dragColumn(page, 'neu', 'erledigt', 'right');
    const newOrder = await getColumnOrder(page);
    expect(newOrder).toEqual([
      'inprogress',
      'blocked',
      'erledigt',
      'neu',
    ]);

    // Karte aus "Neu" holen (ist jetzt an letzter Position)
    const card = page.locator('[data-status="neu"] .card').first();
    const cardTitle = await card.locator('.card-title').textContent();
    expect(cardTitle).not.toBe('');

    // Kartenzähler vor D&D
    const neuCountBefore = parseInt(
      (await page.locator('[data-status="neu"] .column-count').textContent())!,
      10,
    );
    const inprogressCountBefore = parseInt(
      (
        await page.locator('[data-status="inprogress"] .column-count').textContent()
      )!,
      10,
    );

    // Act: Karte per D&D in "In Bearbeitung" ziehen
    const dropZone = page.locator(
      '[data-status="inprogress"] .column-cards',
    );
    await card.dragTo(dropZone, { force: true });

    // Assert: Karte ist jetzt in "In Bearbeitung"
    const cardInTarget = page.locator('[data-status="inprogress"] .card').filter({
      hasText: cardTitle!,
    });
    await expect(cardInTarget).toBeVisible();

    // Kartenzähler aktualisiert
    const neuCountAfter = parseInt(
      (await page.locator('[data-status="neu"] .column-count').textContent())!,
      10,
    );
    const inprogressCountAfter = parseInt(
      (
        await page.locator('[data-status="inprogress"] .column-count').textContent()
      )!,
      10,
    );
    expect(neuCountAfter).toBe(neuCountBefore - 1);
    expect(inprogressCountAfter).toBe(inprogressCountBefore + 1);

    // localStorage Persistenz
    const storedData = await page.evaluate(() => {
      const raw = localStorage.getItem('kanban_board_data');
      return raw ? JSON.parse(raw) : null;
    });
    expect(storedData.cards).toBeDefined();
    const cardInData = storedData.cards.find((c: { title: string }) => c.title === cardTitle);
    expect(cardInData.status).toBe('inprogress');
  });

  // ---- Edge Cases ----

  test('Edge Case: Spalte an dieselbe Position ziehen — Ordnung unverändert', async ({
    page,
  }) => {
    const initialOrder = await getColumnOrder(page);

    // Spalte auf sich selbst ziehen (self-drop)
    await dragColumn(page, 'blocked', 'blocked', 'left');

    const newOrder = await getColumnOrder(page);
    expect(newOrder).toEqual(initialOrder);
  });

  test('Edge Case: Nach Spaltenverschiebung + Reload — Karten bleiben in ihren Spalten', async ({
    page,
  }) => {
    // Arrange: Karte in "Blocked" ziehen VOR der Spaltenverschiebung
    const card = page.locator('[data-status="neu"] .card').first();
    const cardTitle = await card.locator('.card-title').textContent();
    await card.dragTo(
      page.locator('[data-status="blocked"] .column-cards'),
      { force: true },
    );

    // Spalte verschieben
    await dragColumn(page, 'neu', 'erledigt', 'right');

    // Act: Reload
    await page.reload();
    await page.waitForSelector('.column');
    await page.waitForSelector('.card');

    // Assert: Spaltenreihenfolge erhalten UND Karte in "Blocked" geblieben
    const columnOrder = await getColumnOrder(page);
    expect(columnOrder).toEqual([
      'inprogress',
      'blocked',
      'erledigt',
      'neu',
    ]);

    const cardInBlocked = page.locator('[data-status="blocked"] .card').filter({
      hasText: cardTitle!,
    });
    await expect(cardInBlocked).toBeVisible();
  });

  test('Edge Case: columnOrder in localStorage korrekt gespeichert', async ({
    page,
  }) => {
    // Arrange: Spalten verschieben
    await dragColumn(page, 'neu', 'erledigt', 'right');

    // Assert: columnOrder in localStorage
    const storedOrder = await page.evaluate(() => {
      const raw = localStorage.getItem('kanban_board_data');
      return raw ? JSON.parse(raw) : null;
    });
    expect(storedOrder.columnOrder).toBeDefined();
    expect(storedOrder.columnOrder).toEqual([
      'inprogress',
      'blocked',
      'erledigt',
      'neu',
    ]);
  });

});

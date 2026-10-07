import type { Page } from '@playwright/test';

/** Drags the `order-item` at `from` to the slot of the one at `to`, by its grip, with the mouse. */
export async function dragOrderRow(page: Page, from: number, to: number): Promise<void> {
  const rows = page.getByTestId('order-item');
  const grip = await rows.nth(from).getByTestId('order-grip').boundingBox();
  const target = await rows.nth(to).boundingBox();
  if (!grip || !target) throw new Error(`order: row ${from} or ${to} has no box`);
  const x = grip.x + grip.width / 2;
  const startY = grip.y + grip.height / 2;
  const endY = target.y + target.height / 2 + (to > from ? 4 : -4);
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.mouse.move(x, (startY + endY) / 2, { steps: 6 });
  await page.mouse.move(x, endY, { steps: 6 });
  await page.mouse.up();
}

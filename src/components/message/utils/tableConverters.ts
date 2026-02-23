import { copyToClipboard } from '../../../utils/formatters';

/**
 * Escape a field for CSV format
 */
export function escapeCsvField(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Convert HTML table to CSV string
 */
export function tableToCsv(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map((cell) => escapeCsvField(cell.textContent || '')).join(',');
    })
    .join('\n');
}

/**
 * Convert HTML table to Markdown string
 */
export function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  let markdown = '';

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    const rowText = cells.map((cell) => cell.textContent || '').join(' | ');
    markdown += `| ${rowText} |\n`;

    if (rowIndex === 0) {
      const separator = cells.map(() => '---').join(' | ');
      markdown += `| ${separator} |\n`;
    }
  });

  return markdown;
}

/**
 * Convert HTML table to plain text (tab-separated)
 */
export function tableToPlain(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map((cell) => cell.textContent || '').join('\t');
    })
    .join('\n');
}

/**
 * Copy table as CSV to clipboard
 */
export async function copyTableAsCsv(table: HTMLTableElement): Promise<void> {
  const csv = tableToCsv(table);
  await copyToClipboard(csv);
}

/**
 * Copy table as Markdown to clipboard
 */
export async function copyTableAsMarkdown(table: HTMLTableElement): Promise<void> {
  const markdown = tableToMarkdown(table);
  await copyToClipboard(markdown);
}

/**
 * Copy table as plain text to clipboard
 */
export async function copyTableAsPlain(table: HTMLTableElement): Promise<void> {
  const plain = tableToPlain(table);
  await copyToClipboard(plain);
}

/**
 * Show button feedback animation
 */
export function showButtonFeedback(btn: HTMLElement): void {
  btn.classList.add('copied');
  setTimeout(() => {
    btn.classList.remove('copied');
  }, 1500);
}

/**
 * Download table as CSV file
 */
export function downloadTableAsCsv(table: HTMLTableElement): void {
  const csv = tableToCsv(table);
  downloadFile(csv, 'table.csv', 'text/csv;charset=utf-8;');
}

/**
 * Download table as Markdown file
 */
export function downloadTableAsMarkdown(table: HTMLTableElement): void {
  const markdown = tableToMarkdown(table);
  downloadFile(markdown, 'table.md', 'text/markdown;charset=utf-8;');
}

/**
 * Download content as file
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

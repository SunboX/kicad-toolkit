// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Renders grouped BOM rows as deterministic HTML.
 */
export class BomTableRenderer {
    /**
     * Renders BOM rows.
     * @param {object[]} rows BOM rows.
     * @returns {string}
     */
    static render(rows) {
        const normalizedRows = Array.isArray(rows) ? rows : []
        if (!normalizedRows.length) {
            return '<section class="bom-empty">No BOM rows recovered.</section>'
        }

        return (
            '<table class="bom-table"><thead><tr>' +
            '<th>Designators</th><th>Qty</th><th>Value</th><th>Pattern</th><th>Source</th>' +
            '</tr></thead><tbody>' +
            normalizedRows.map(BomTableRenderer.#renderRow).join('') +
            '</tbody></table>'
        )
    }

    /**
     * Renders one BOM row.
     * @param {object} row BOM row.
     * @returns {string}
     */
    static #renderRow(row) {
        return (
            '<tr><td>' +
            escapeHtml((row.designators || []).join(', ')) +
            '</td><td>' +
            escapeHtml(String(row.quantity || row.designators?.length || 0)) +
            '</td><td>' +
            escapeHtml(row.value || '') +
            '</td><td>' +
            escapeHtml(row.pattern || '') +
            '</td><td>' +
            escapeHtml(row.source || '') +
            '</td></tr>'
        )
    }
}

/**
 * Escapes HTML text.
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
}

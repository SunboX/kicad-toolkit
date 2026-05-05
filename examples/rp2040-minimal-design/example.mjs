// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadPcbParser, PcbSvgRenderer } from '../../src/index.mjs'

const SOURCE_PROJECT_URL =
    'https://github.com/tommy-gilligan/RP2040-minimal-design'
const SOURCE_BOARD_URL =
    'https://raw.githubusercontent.com/tommy-gilligan/RP2040-minimal-design/main/RP2040_minimal.kicad_pcb'
const SOURCE_FILE_NAME = 'RP2040_minimal.kicad_pcb'

/**
 * Coordinates the RP2040 Minimal Design example page.
 */
class Rp2040MinimalDesignExample {
    #activeSide = 'front'
    #board = null
    #elements

    /**
     * Starts the browser example.
     * @returns {void}
     */
    static boot() {
        new Rp2040MinimalDesignExample().#bind()
    }

    /**
     * Creates the example controller.
     */
    constructor() {
        this.#elements = {
            output: document.querySelector('#board'),
            sideButtons: [...document.querySelectorAll('[data-side]')],
            status: document.querySelector('#status')
        }
    }

    /**
     * Wires page controls and starts loading the credited board.
     * @returns {void}
     */
    #bind() {
        for (const button of this.#elements.sideButtons) {
            button.addEventListener('click', () => {
                this.#setActiveSide(button.dataset.side)
            })
        }

        this.#loadSourceBoard()
    }

    /**
     * Fetches and parses the credited source board.
     * @returns {Promise<void>}
     */
    async #loadSourceBoard() {
        this.#setStatus('Loading credited source board from GitHub...', 'busy')

        try {
            const source = await this.#fetchSourceBoard()
            this.#board = KicadPcbParser.parse(source, {
                fileName: SOURCE_FILE_NAME
            })
            this.#setStatus(
                'Loaded ' +
                    SOURCE_FILE_NAME +
                    ' from ' +
                    new URL(SOURCE_PROJECT_URL).host +
                    '.',
                'ready'
            )
            this.#render()
        } catch (error) {
            this.#board = null
            this.#setStatus(this.#formatError(error), 'error')
            this.#renderError(error)
        }
    }

    /**
     * Fetches the raw KiCad board source from GitHub.
     * @returns {Promise<string>}
     */
    async #fetchSourceBoard() {
        const response = await fetch(SOURCE_BOARD_URL)
        if (!response.ok) {
            throw new Error(
                'GitHub returned HTTP ' +
                    response.status +
                    ' for ' +
                    SOURCE_FILE_NAME +
                    '.'
            )
        }

        return response.text()
    }

    /**
     * Updates the active side and re-renders the existing board.
     * @param {string | undefined} side
     * @returns {void}
     */
    #setActiveSide(side) {
        if (side !== 'front' && side !== 'back') return

        this.#activeSide = side
        this.#syncSideButtons()
        this.#render()
    }

    /**
     * Renders the currently selected PCB side.
     * @returns {void}
     */
    #render() {
        this.#syncSideButtons()
        if (!this.#board) {
            this.#elements.output.innerHTML = this.#renderLoadingState()
            return
        }

        this.#elements.output.innerHTML = PcbSvgRenderer.render(this.#board, {
            side: this.#activeSide
        })
    }

    /**
     * Updates side button state.
     * @returns {void}
     */
    #syncSideButtons() {
        for (const button of this.#elements.sideButtons) {
            const isActive = button.dataset.side === this.#activeSide
            button.classList.toggle('is-active', isActive)
            button.setAttribute('aria-pressed', String(isActive))
        }
    }

    /**
     * Updates the visible status message.
     * @param {string} message
     * @param {'busy' | 'error' | 'ready'} tone
     * @returns {void}
     */
    #setStatus(message, tone) {
        this.#elements.status.textContent = message
        this.#elements.status.dataset.tone = tone
    }

    /**
     * Renders the loading state.
     * @returns {string}
     */
    #renderLoadingState() {
        return [
            '<section class="empty-state">',
            '<h2>Loading credited source board</h2>',
            '<p>The example fetches the public KiCad board from GitHub at runtime. The source board file is not redistributed in this repository.</p>',
            '</section>'
        ].join('')
    }

    /**
     * Renders a parse or fetch error.
     * @param {unknown} error
     * @returns {void}
     */
    #renderError(error) {
        this.#elements.output.innerHTML = [
            '<section class="empty-state empty-state--error">',
            '<h2>Unable to load RP2040 board</h2>',
            '<p>',
            escapeText(this.#formatError(error)),
            '</p>',
            '</section>'
        ].join('')
    }

    /**
     * Formats an unknown thrown value for display.
     * @param {unknown} error
     * @returns {string}
     */
    #formatError(error) {
        return error instanceof Error ? error.message : String(error)
    }
}

/**
 * Escapes text content for safe HTML insertion.
 * @param {unknown} value
 * @returns {string}
 */
function escapeText(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
}

Rp2040MinimalDesignExample.boot()

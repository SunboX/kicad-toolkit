// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadPcbParser, PcbSvgRenderer } from '../../src/index.mjs'

const boardNode = document.querySelector('#board')
const sideButtons = [...document.querySelectorAll('[data-side]')]
const source = await fetch('/tests/fixtures/minimal.kicad_pcb').then(
    (response) => response.text()
)
const board = KicadPcbParser.parse(source, {
    fileName: 'minimal.kicad_pcb'
})

/**
 * Renders one board side.
 * @param {'front' | 'back'} side
 * @returns {void}
 */
function render(side) {
    boardNode.innerHTML = PcbSvgRenderer.render(board, { side })
    sideButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.side === side)
    })
}

sideButtons.forEach((button) => {
    button.addEventListener('click', () => render(button.dataset.side))
})

render('front')

// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const strokeFontScale = 1 / 21
const fontOffset = -8
const firstPrintableCodePoint = 32
const fallbackGlyphIndex = '?'.charCodeAt(0) - firstPrintableCodePoint

// Printable ASCII subset of KiCad's newstroke_font.cpp glyph table.
const asciiNewstrokeFont = [
    'JZ',
    'MWRYSZR[QZRYR[ RRSQGRFSGRSRF',
    'JZNFNJ RVFVJ',
    'H]LM[M RRDL_ RYVJV RS_YD',
    'H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG RRCR^',
    'F^J[ZF RMFOGPIOKMLKKJIKGMF RYZZXYVWUUVTXUZW[YZ',
    'E_[[Z[XZUWPQNNMKMINGPFQFSGTITJSLRMLQKRJTJWKYLZN[Q[SZTYWUXRXP',
    'MWSFQJ',
    'KYVcUbS_R]QZPUPQQLRISGUDVC',
    'KYNcObQ_R]SZTUTQSLRIQGODNC',
    'JZRFRK RMIRKWI ROORKUO',
    'E_JSZS RR[RK',
    'MWSZS[R]Q^',
    'E_JSZS',
    'MWRYSZR[QZRYR[',
    'G][EI`',
    'H\\QFSFUGVHWJXNXSWWVYUZS[Q[OZNYMWLSLNMJNHOGQF',
    'H\\X[L[ RR[RFPINKLL',
    'H\\LHMGOFTFVGWHXJXLWOK[X[',
    'H\\KFXFQNTNVOWPXRXWWYVZT[N[LZKY',
    'H\\VMV[ RQELTYT',
    'H\\WFMFLPMOONTNVOWPXRXWWYVZT[O[MZLY',
    'H\\VFRFPGOHMKLOLWMYNZP[T[VZWYXWXRWPVOTNPNNOMPLR',
    'H\\KFYFP[',
    'H\\PONNMMLKLJMHNGPFTFVGWHXJXKWMVNTOPONPMQLSLWMYNZP[T[VZWYXWXSWQVPTO',
    'H\\N[R[TZUYWVXRXJWHVGTFPFNGMHLJLOMQNRPSTSVRWQXO',
    'MWRYSZR[QZRYR[ RRNSORPQORNRP',
    'MWSZS[R]Q^ RRNSORPQORNRP',
    'E_ZMJSZY',
    'E_JPZP RZVJV',
    'E_JMZSJY',
    'I[QYRZQ[PZQYQ[ RMGOFTFVGWIWKVMUNSORPQRQS',
    'D_VQUPSOQOOPNQMSMUNWOXQYSYUXVW RVOVWWXXXZW[U[PYMVKRJNKKMIPHTIXK[N]R^V]Y[',
    'I[MUWU RK[RFY[',
    'G\\SPVQWRXTXWWYVZT[L[LFSFUGVHWJWLVNUOSPLP',
    'F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH',
    'G\\L[LFQFTGVIWKXOXRWVVXTZQ[L[',
    'H[MPTP RW[M[MFWF',
    'HZTPMP RM[MFWF',
    'F[VGTFQFNGLIKKJOJRKVLXNZQ[S[VZWYWRSR',
    'G]L[LF RLPXP RX[XF',
    'MWR[RF',
    'JZUFUUTXRZO[M[',
    'G\\L[LF RX[OO RXFLR',
    'HYW[M[MF',
    'F^K[KFRUYFY[',
    'G]L[LFX[XF',
    'G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF',
    'G\\L[LFTFVGWHXJXMWOVPTQLQ',
    'G]Z]X\\VZSWQVOV RP[NZLXKTKMLINGPFTFVGXIYMYTXXVZT[P[',
    'G\\X[QQ RL[LFTFVGWHXJXMWOVPTQLQ',
    'H\\LZO[T[VZWYXWXUWSVRTQPPNOMNLLLJMHNGPFUFXG',
    'JZLFXF RR[RF',
    'G]LFLWMYNZP[T[VZWYXWXF',
    'I[KFR[YF',
    'F^IFN[RLV[[F',
    'H\\KFY[ RYFK[',
    'I[RQR[ RKFRQYF',
    'H\\KFYFK[Y[',
    'KYVbQbQDVD',
    'KYID[_',
    'KYNbSbSDND',
    'LXNHREVH',
    'JZJ]Z]',
    'NVPESH',
    'I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR',
    'H[M[MF RMNOMSMUNVOWQWWVYUZS[O[MZ',
    'HZVZT[P[NZMYLWLQMONNPMTMVN',
    'I\\W[WF RWZU[Q[OZNYMWMQNOONQMUMWN',
    'I[VZT[P[NZMXMPNNPMTMVNWPWRMT',
    'MYOMWM RR[RISGUFWF',
    'I\\WMW^V`UaSbPbNa RWZU[Q[OZNYMWMQNOONQMUMWN',
    'H[M[MF RV[VPUNSMPMNNMO',
    'MWR[RM RRFQGRHSGRFRH',
    'MWRMR_QaObNb RRFQGRHSGRFRH',
    'IZN[NF RPSV[ RVMNU',
    'MXU[SZRXRF',
    'D`I[IM RIOJNLMOMQNRPR[ RRPSNUMXMZN[P[[',
    'I\\NMN[ RNOONQMTMVNWPW[',
    'H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[',
    'H[MMMb RMNOMSMUNVOWQWWVYUZS[O[MZ',
    'I\\WMWb RWZU[Q[OZNYMWMQNOONQMUMWN',
    'KXP[PM RPQQORNTMVM',
    'J[NZP[T[VZWXWWVUTTQTOSNQNPONQMTMVN',
    'MYOMWM RRFRXSZU[W[',
    'H[VMV[ RMMMXNZP[S[UZVY',
    'JZMMR[WM',
    'G]JMN[RQV[ZM',
    'IZL[WM RLMW[',
    'JZMMR[ RWMR[P`OaMb',
    'IZLMWML[W[',
    'KYVcUcSbR`RVQTOSQRRPRFSDUCVC',
    'H\\RbRD',
    'KYNcOcQbR`RVSTUSSRRPRFQDOCNC',
    'KZMSNRPQTSVRWQ'
]
const glyphs = asciiNewstrokeFont.map(parseGlyph)
const spaceWidth = glyphs[0].bounds.maxX

/**
 * KiCad NewStroke glyph renderer for PCB text.
 */
export class KicadStrokeFont {
    /**
     * Measures one text line using KiCad's full stroke glyph cursor advance.
     * @param {string} value
     * @param {number} sizeX
     * @returns {number}
     */
    static measureLine(value, sizeX) {
        return lineAdvance(value, sizeX)
    }

    /**
     * Converts one text line into KiCad-scaled stroke point lists.
     * @param {string} value
     * @param {{ x: number, y: number, sizeX: number, sizeY: number }} attrs
     * @returns {{ x: number, y: number }[][]}
     */
    static strokeLine(value, attrs) {
        const strokes = []
        let cursorX = attrs.x

        for (const char of String(value || '')) {
            if (char === ' ') {
                cursorX += attrs.sizeX * spaceWidth
                continue
            }

            const glyph = glyphForCharacter(char)
            glyph.strokes.forEach((stroke) => {
                strokes.push(
                    stroke.map((point) => ({
                        x: cursorX + point.x * attrs.sizeX,
                        y: attrs.y + point.y * attrs.sizeY
                    }))
                )
            })
            cursorX += glyph.bounds.maxX * attrs.sizeX
        }

        return strokes
    }
}

function lineAdvance(value, sizeX) {
    let advance = 0

    for (const char of String(value || '')) {
        const glyph = char === ' ' ? glyphs[0] : glyphForCharacter(char)
        advance += glyph.bounds.maxX * sizeX
    }

    return Math.max(advance, 0)
}

function glyphForCharacter(char) {
    const index = char.codePointAt(0) - firstPrintableCodePoint
    return glyphs[index] || glyphs[fallbackGlyphIndex]
}

function parseGlyph(data) {
    const glyphStartX = coordinateValue(data[0]) * strokeFontScale
    const glyphEndX = coordinateValue(data[1]) * strokeFontScale
    const strokes = []
    let stroke = []

    for (let index = 2; index < data.length; index += 2) {
        const xValue = data[index]
        const yValue = data[index + 1]

        if (xValue === ' ' && yValue === 'R') {
            stroke = []
            continue
        }

        if (stroke.length === 0) {
            strokes.push(stroke)
        }

        stroke.push({
            x: coordinateValue(xValue) * strokeFontScale - glyphStartX,
            y: (coordinateValue(yValue) + fontOffset) * strokeFontScale
        })
    }

    return {
        strokes,
        bounds: glyphBounds(strokes, glyphEndX - glyphStartX)
    }
}

function glyphBounds(strokes, width) {
    const bounds = { minX: 0, minY: 0, maxX: width, maxY: 0 }

    strokes.flat().forEach((point) => {
        bounds.minX = Math.min(bounds.minX, point.x)
        bounds.minY = Math.min(bounds.minY, point.y)
        bounds.maxX = Math.max(bounds.maxX, point.x)
        bounds.maxY = Math.max(bounds.maxY, point.y)
    })

    return bounds
}

function coordinateValue(value) {
    return value.charCodeAt(0) - 'R'.charCodeAt(0)
}

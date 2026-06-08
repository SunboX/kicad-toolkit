// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const strokeFontScale = 1 / 21
const fontOffset = -8
const firstPrintableCodePoint = 32
const fallbackGlyphIndex = '?'.charCodeAt(0) - firstPrintableCodePoint
const tabWidth = 4
const overbarTrimRatio = 0.1
const overbarHeightRatio = 1.23
const superSubSizeMultiplier = 0.8
const superscriptHeightOffset = 0.35
const subscriptHeightOffset = 0.15
const textStyleSubscript = 1
const textStyleSuperscript = 2

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
// Latin-1 Supplement subset from KiCad's generated newstroke_font.cpp glyph table.
const latin1NewstrokeFont = new Map([
    [0x00a0, 'JZ'],
    [0x00a1, 'MWROQNRMSNRORM RRUSaRbQaRURb'],
    [0x00a2, 'HZVZT[P[NZMYLWLQMONNPMTMVN RRJR^'],
    [0x00a3, 'H[LMTM RL[W[ RO[OIPGRFUFWG'],
    [0x00a4, 'H]LYOV RLLOO RVVYY RVOYL RVVTWQWOVNTNQOOQNTNVOWQWTVV'],
    [0x00a5, 'F^JTZT RJMZM RRQR[ RKFRQYF'],
    [0x00a6, 'MWRbRW RRFRQ'],
    [0x00a7, 'I[N]P^S^U]V[UYOSNQNPONQM RVGTFQFOGNIOKUQVSVTUVSW'],
    [0x00a8, 'LXNFOGNHMGNFNH RVFWGVHUGVFVH'],
    [
        0x00a9,
        '@dVKTJPJNKLMKOKSLUNWPXTXVW RRCMDHGELDQEVH[M^R_W^\\[_V`Q_L\\GWDRC'
    ],
    [0x00aa, 'KZOEQDSDUEVGVN RVMTNQNOMNKOIQHVH'],
    [0x00ab, 'H\\RMLSRY RXWTSXO'],
    [0x00ac, 'E_JQZQZV'],
    [0x00ad, 'RR'],
    [
        0x00ae,
        '@dWXRR RNXNJTJVKWMWOVQTRNR RRCMDHGELDQEVH[M^R_W^\\[_V`Q_L\\GWDRC'
    ],
    [0x00af, 'LXMGWG'],
    [0x00b0, 'JZRFPGOIPKRLTKUITGRF'],
    [0x00b1, 'E_JOZO RRWRG RZ[J['],
    [0x00b2, 'JZNAP@S@UAVCVEUGNNVN'],
    [0x00b3, 'JZN@V@RESEUFVHVKUMSNPNNM'],
    [0x00b4, 'NVTEQH'],
    [0x00b5, 'H^MMMb RWXXZZ[ RMXNZP[T[VZWXWM'],
    [0x00b6, 'F]VMV[ ROMOXNZL[ RZMMMKNJP'],
    [0x00b7, 'JZRRQSRTSSRRRT'],
    [0x00b8, 'MWR\\T]U_TaRbOb'],
    [0x00b9, 'JZVNNN RNCPBR@RN'],
    [0x00ba, 'KYQNOMNKNGOEQDSDUEVGVKUMSNQN'],
    [0x00bb, 'H\\RMXSRY RLWPSLO'],
    [0x00bc, 'G]KQYQ RVNNN RNCPBR@RN RUYUa RQSN]W]'],
    [0x00bd, 'G]KQYQ RVNNN RNCPBR@RN RNTPSSSUTVVVXUZNaVa'],
    [0x00be, 'G]KQYQ RN@V@RESEUFVHVKUMSNPNNM RUYUa RQSN]W]'],
    [0x00bf, 'I[SORNSMTNSOSM RWaUbPbNaM_M]N[OZQYRXSVSU'],
    [0x00c0, 'I[MUWU RK[RFY[ RP>SA'],
    [0x00c1, 'I[MUWU RK[RFY[ RT>QA'],
    [0x00c2, 'I[MUWU RK[RFY[ RNAR>VA'],
    [0x00c3, 'I[MUWU RK[RFY[ RMAN@P?TAV@W?'],
    [0x00c4, 'I[MUWU RK[RFY[ RN?O@NAM@N?NA RV?W@VAU@V?VA'],
    [0x00c5, 'I[MUWU RK[RFY[ RRFPEOCPAR@TAUCTERF'],
    [0x00c6, 'F`JURU RRPYP RH[OF\\F RRFR[\\['],
    [0x00c7, 'F[WYVZS[Q[NZLXKVJRJOKKLINGQFSFVGWH RR\\T]U_TaRbOb'],
    [0x00c8, 'H[MPTP RW[M[MFWF RP>SA'],
    [0x00c9, 'H[MPTP RW[M[MFWF RT>QA'],
    [0x00ca, 'H[MPTP RW[M[MFWF RNAR>VA'],
    [0x00cb, 'H[MPTP RW[M[MFWF RN?O@NAM@N?NA RV?W@VAU@V?VA'],
    [0x00cc, 'MWR[RF RP>SA'],
    [0x00cd, 'MWR[RF RT>QA'],
    [0x00ce, 'MWR[RF RNAR>VA'],
    [0x00cf, 'MWR[RF RN?O@NAM@N?NA RV?W@VAU@V?VA'],
    [0x00d0, 'G\\L[LFQFTGVIWKXOXRWVVXTZQ[L[ RIPQP'],
    [0x00d1, 'G]L[LFX[XF RMAN@P?TAV@W?'],
    [0x00d2, 'G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RP>SA'],
    [0x00d3, 'G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RT>QA'],
    [0x00d4, 'G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RNAR>VA'],
    [0x00d5, 'G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RMAN@P?TAV@W?'],
    [
        0x00d6,
        'G]PFTFVGXIYMYTXXVZT[P[NZLXKTKMLINGPF RN?O@NAM@N?NA RV?W@VAU@V?VA'
    ],
    [0x00d7, 'E_LMXY RXMLY'],
    [0x00d8, 'G]ZFJ[ RP[NZLXKTKMLINGPFTFVGXIYMYTXXVZT[P['],
    [0x00d9, 'G]LFLWMYNZP[T[VZWYXWXF RP>SA'],
    [0x00da, 'G]LFLWMYNZP[T[VZWYXWXF RT>QA'],
    [0x00db, 'G]LFLWMYNZP[T[VZWYXWXF RNAR>VA'],
    [0x00dc, 'G]LFLWMYNZP[T[VZWYXWXF RN?O@NAM@N?NA RV?W@VAU@V?VA'],
    [0x00dd, 'I[RQR[ RKFRQYF RT>QA'],
    [0x00de, 'G\\LFL[ RLKTKVLWMXOXRWTVUTVLV'],
    [0x00df, 'F]K[KJLHMGOFRFTGUHVJVMSMQNPPPQQSSTVTXUYWYXXZV[R[PZ'],
    [0x00e0, 'I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RPESH'],
    [0x00e1, 'I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RTEQH'],
    [0x00e2, 'I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNHREVH'],
    [0x00e3, 'I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RMHNGPFTHVGWF'],
    [
        0x00e4,
        'I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RNFOGNHMGNFNH RVFWGVHUGVFVH'
    ],
    [0x00e5, 'I\\W[WPVNTMPMNN RWZU[P[NZMXMVNTPSUSWR RRHPGOEPCRBTCUETGRH'],
    [0x00e6, 'D`INKMOMQNRP R[ZY[U[SZRXRPSNUMYM[N\\P\\RRSKSITHVHXIZK[O[QZRX'],
    [0x00e7, 'HZVZT[P[NZMYLWLQMONNPMTMVN RR\\T]U_TaRbOb'],
    [0x00e8, 'I[VZT[P[NZMXMPNNPMTMVNWPWRMT RPESH'],
    [0x00e9, 'I[VZT[P[NZMXMPNNPMTMVNWPWRMT RTEQH'],
    [0x00ea, 'I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNHREVH'],
    [0x00eb, 'I[VZT[P[NZMXMPNNPMTMVNWPWRMT RNFOGNHMGNFNH RVFWGVHUGVFVH'],
    [0x00ec, 'MWR[RM RPESH'],
    [0x00ed, 'MWR[RM RTEQH'],
    [0x00ee, 'LXNHREVH RR[RM'],
    [0x00ef, 'LXNFOGNHMGNFNH RVFWGVHUGVFVH RR[RM'],
    [0x00f0, 'I\\SCQI RWNUMQMONNOMQMXNZP[T[VZWXWLVITGRFNE'],
    [0x00f1, 'I\\NMN[ RNOONQMTMVNWPW[ RMHNGPFTHVGWF'],
    [0x00f2, 'H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RPESH'],
    [0x00f3, 'H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RTEQH'],
    [0x00f4, 'H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNHREVH'],
    [0x00f5, 'H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RMHNGPFTHVGWF'],
    [
        0x00f6,
        'H[P[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P[ RNFOGNHMGNFNH RVFWGVHUGVFVH'
    ],
    [0x00f7, 'E_ZSJS RRXSYRZQYRXRZ RRLSMRNQMRLRN'],
    [0x00f8, 'H[XMK[ RP[NZMYLWLQMONNPMSMUNVOWQWWVYUZS[P['],
    [0x00f9, 'H[VMV[ RMMMXNZP[S[UZVY RPESH'],
    [0x00fa, 'H[VMV[ RMMMXNZP[S[UZVY RTEQH'],
    [0x00fb, 'H[VMV[ RMMMXNZP[S[UZVY RNHREVH'],
    [0x00fc, 'H[VMV[ RMMMXNZP[S[UZVY RNFOGNHMGNFNH RVFWGVHUGVFVH'],
    [0x00fd, 'JZMMR[ RWMR[P`OaMb RTEQH'],
    [0x00fe, 'H[MFMb RMNOMSMUNVOWQWWVYUZS[O[MZ'],
    [0x00ff, 'JZMMR[ RWMR[P`OaMb RNFOGNHMGNFNH RVFWGVHUGVFVH']
])
const glyphs = asciiNewstrokeFont.map(parseGlyph)
const latin1Glyphs = new Map(
    [...latin1NewstrokeFont].map(([codePoint, glyph]) => [
        codePoint,
        parseGlyph(glyph)
    ])
)
const spaceWidth = glyphs[0].bounds.maxX
const lineLayoutCacheLimit = 2048
const lineLayoutCache = new Map()

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
     * Converts one text line into stroke point lists and its advance width.
     * @param {string} value
     * @param {{ x: number, y: number, sizeX: number, sizeY: number }} attrs
     * @returns {{ width: number, strokes: { x: number, y: number }[][] }}
     */
    static layoutLine(value, attrs) {
        return layoutLine(value, attrs)
    }

    /**
     * Converts one text line into KiCad-scaled stroke point lists.
     * @param {string} value
     * @param {{ x: number, y: number, sizeX: number, sizeY: number }} attrs
     * @returns {{ x: number, y: number }[][]}
     */
    static strokeLine(value, attrs) {
        return layoutLine(value, attrs).strokes
    }
}

/**
 * Measures one KiCad markup-aware text line.
 * @param {string} value Text line.
 * @param {number} sizeX Glyph width.
 * @returns {number}
 */
function lineAdvance(value, sizeX) {
    return cachedLineLayout(value, sizeX, sizeX).width
}

/**
 * Lays out one line at the requested origin.
 * @param {string} value Text line.
 * @param {{ x: number, y: number, sizeX: number, sizeY: number }} attrs Text attributes.
 * @returns {{ width: number, strokes: { x: number, y: number }[][] }}
 */
function layoutLine(value, attrs) {
    const state = textRunState(attrs)
    const layout = cachedLineLayout(value, state.sizeX, state.sizeY)

    return {
        width: layout.width,
        strokes: offsetStrokes(layout.strokes, state.x, state.y)
    }
}

/**
 * Resolves a reusable zero-origin line layout.
 * @param {string} value Text line.
 * @param {number} sizeX Glyph width.
 * @param {number} sizeY Glyph height.
 * @returns {{ width: number, strokes: { x: number, y: number }[][] }}
 */
function cachedLineLayout(value, sizeX, sizeY) {
    const normalizedValue = String(value || '')
    const normalizedSizeX = Number(sizeX || 1)
    const normalizedSizeY = Number(sizeY || normalizedSizeX || 1)
    const cacheKey = `${normalizedValue}\u0000${normalizedSizeX}\u0000${normalizedSizeY}`
    const cached = lineLayoutCache.get(cacheKey)

    if (cached) {
        lineLayoutCache.delete(cacheKey)
        lineLayoutCache.set(cacheKey, cached)
        return cached
    }

    const strokes = []
    const width = Math.max(
        strokeMarkupNodes(
            parseMarkup(normalizedValue),
            { x: 0, y: 0, sizeX: normalizedSizeX, sizeY: normalizedSizeY },
            0,
            strokes
        ),
        0
    )
    const layout = { width, strokes }
    lineLayoutCache.set(cacheKey, layout)

    if (lineLayoutCache.size > lineLayoutCacheLimit) {
        lineLayoutCache.delete(lineLayoutCache.keys().next().value)
    }

    return layout
}

/**
 * Copies cached zero-origin strokes to a requested line origin.
 * @param {{ x: number, y: number }[][]} strokes Cached strokes.
 * @param {number} offsetX X offset.
 * @param {number} offsetY Y offset.
 * @returns {{ x: number, y: number }[][]}
 */
function offsetStrokes(strokes, offsetX, offsetY) {
    return strokes.map((stroke) =>
        stroke.map((point) => ({
            x: point.x + offsetX,
            y: point.y + offsetY
        }))
    )
}

/**
 * Resolves a printable glyph, falling back like KiCad's stroke font.
 * @param {string} char Character.
 * @returns {object}
 */
function glyphForCharacter(char) {
    const codePoint = char.codePointAt(0)
    const index = codePoint - firstPrintableCodePoint

    if (index >= 0 && index < glyphs.length && glyphs[index]) {
        return glyphs[index]
    }

    return latin1Glyphs.get(codePoint) || glyphs[fallbackGlyphIndex]
}

/**
 * Parses KiCad text markup commands.
 * @param {string} value Text value.
 * @returns {object[]}
 */
function parseMarkup(value) {
    return parseMarkupUntil(String(value || ''), 0, '').nodes
}

/**
 * Parses markup nodes until an optional terminator.
 * @param {string} value Text value.
 * @param {number} start Start index.
 * @param {string} terminator Terminator character.
 * @returns {{ nodes: object[], index: number, closed: boolean }}
 */
function parseMarkupUntil(value, start, terminator) {
    const nodes = []
    let text = ''
    let index = start

    while (index < value.length) {
        const char = value[index]

        if (terminator && char === terminator) {
            pushTextNode(nodes, text)
            return { nodes, index, closed: true }
        }

        if (isMarkupCommand(value, index)) {
            const parsed = parseMarkupUntil(value, index + 2, '}')

            if (parsed.closed) {
                pushTextNode(nodes, text)
                text = ''
                nodes.push({
                    type: markupCommandType(char),
                    children: parsed.nodes
                })
                index = parsed.index + 1
                continue
            }
        }

        text += char
        index += 1
    }

    pushTextNode(nodes, text)
    return { nodes, index, closed: !terminator }
}

/**
 * Appends a text node when the text is non-empty.
 * @param {object[]} nodes Node list.
 * @param {string} text Text content.
 */
function pushTextNode(nodes, text) {
    if (text) nodes.push({ type: 'text', value: text })
}

/**
 * Checks for a KiCad markup command prefix.
 * @param {string} value Text value.
 * @param {number} index Candidate index.
 * @returns {boolean}
 */
function isMarkupCommand(value, index) {
    return ['~', '_', '^'].includes(value[index]) && value[index + 1] === '{'
}

/**
 * Maps KiCad markup command characters to node types.
 * @param {string} char Command character.
 * @returns {string}
 */
function markupCommandType(char) {
    if (char === '~') return 'overbar'
    if (char === '_') return 'subscript'
    return 'superscript'
}

/**
 * Creates a text-run state from stroke-font attributes.
 * @param {{ x: number, y: number, sizeX: number, sizeY: number }} attrs Text attributes.
 * @returns {{ x: number, y: number, sizeX: number, sizeY: number }}
 */
function textRunState(attrs) {
    return {
        x: Number(attrs.x || 0),
        y: Number(attrs.y || 0),
        sizeX: Number(attrs.sizeX || 1),
        sizeY: Number(attrs.sizeY || attrs.sizeX || 1)
    }
}

/**
 * Converts markup nodes into stroke paths and returns the next cursor x.
 * @param {object[]} nodes Markup nodes.
 * @param {object} state Text run state.
 * @param {number} style Text style flags.
 * @param {Array[] | undefined} strokes Stroke output.
 * @returns {number}
 */
function strokeMarkupNodes(nodes, state, style, strokes) {
    let cursorX = state.x

    for (const node of nodes) {
        const nextState = { ...state, x: cursorX }
        cursorX = strokeMarkupNode(node, nextState, style, strokes)
    }

    return cursorX
}

/**
 * Converts one markup node into stroke paths.
 * @param {object} node Markup node.
 * @param {object} state Text run state.
 * @param {number} style Text style flags.
 * @param {Array[] | undefined} strokes Stroke output.
 * @returns {number}
 */
function strokeMarkupNode(node, state, style, strokes) {
    if (node.type === 'text') {
        return strokeTextRun(node.value, state, style, strokes)
    }

    let nodeStyle = style
    if (node.type === 'subscript') nodeStyle |= textStyleSubscript
    if (node.type === 'superscript') nodeStyle |= textStyleSuperscript

    const startX = state.x
    const endX = strokeMarkupNodes(
        node.children || [],
        state,
        nodeStyle,
        strokes
    )

    if (node.type === 'overbar' && strokes) {
        strokes.push(overbarStroke(startX, endX, state))
    }

    return endX
}

/**
 * Converts one plain-text run into stroke paths.
 * @param {string} value Text run.
 * @param {object} state Text run state.
 * @param {number} style Text style flags.
 * @param {Array[] | undefined} strokes Stroke output.
 * @returns {number}
 */
function strokeTextRun(value, state, style, strokes) {
    const metrics = styledRunMetrics(state, style)
    let cursorX = state.x
    let charCount = 0

    for (const char of String(value || '')) {
        if (char === '\t') {
            charCount = Math.floor(charCount / tabWidth + 1) * tabWidth - 1
            let newCursor =
                state.x + metrics.sizeX * charCount + metrics.sizeX * spaceWidth

            while (newCursor <= cursorX) {
                charCount += tabWidth
                newCursor += metrics.sizeX * tabWidth
            }

            cursorX = newCursor
        } else if (char === ' ') {
            cursorX += metrics.sizeX * spaceWidth
        } else {
            const glyph = glyphForCharacter(char)
            if (strokes) {
                glyph.strokes.forEach((stroke) => {
                    strokes.push(
                        stroke.map((point) => ({
                            x: cursorX + point.x * metrics.sizeX,
                            y: metrics.y + point.y * metrics.sizeY
                        }))
                    )
                })
            }
            cursorX += glyph.bounds.maxX * metrics.sizeX
        }

        charCount += 1
    }

    return cursorX
}

/**
 * Resolves glyph size and baseline for KiCad subscript/superscript flags.
 * @param {object} state Text run state.
 * @param {number} style Text style flags.
 * @returns {{ sizeX: number, sizeY: number, y: number }}
 */
function styledRunMetrics(state, style) {
    let sizeX = state.sizeX
    let sizeY = state.sizeY
    let y = state.y

    if (style & (textStyleSubscript | textStyleSuperscript)) {
        sizeX *= superSubSizeMultiplier
        sizeY *= superSubSizeMultiplier

        if (style & textStyleSubscript) {
            y += sizeY * subscriptHeightOffset
        } else {
            y -= sizeY * superscriptHeightOffset
        }
    }

    return { sizeX, sizeY, y }
}

/**
 * Builds KiCad's overbar stroke for a marked text range.
 * @param {number} startX Range start x.
 * @param {number} endX Range end x.
 * @param {object} state Text run state.
 * @returns {{ x: number, y: number }[]}
 */
function overbarStroke(startX, endX, state) {
    const trim = state.sizeX * overbarTrimRatio
    const y = state.y - state.sizeY * overbarHeightRatio
    return [
        { x: startX + trim, y },
        { x: endX - trim, y }
    ]
}

/**
 * Parses one Hershey-style glyph entry.
 * @param {string} data Glyph source.
 * @returns {object}
 */
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

/**
 * Calculates glyph bounds.
 * @param {Array[]} strokes Glyph strokes.
 * @param {number} width Advance width.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
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

/**
 * Converts KiCad encoded glyph coordinates to numbers.
 * @param {string} value Encoded coordinate.
 * @returns {number}
 */
function coordinateValue(value) {
    return value.charCodeAt(0) - 'R'.charCodeAt(0)
}

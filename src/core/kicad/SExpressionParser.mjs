// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const simpleEscapes = Object.freeze({
    a: '\x07',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
    '"': '"',
    '\\': '\\'
})

/**
 * Parser for KiCad-style S-expression files.
 */
export class SExpressionParser {
    /**
     * Parses one S-expression document.
     * @param {string} source
     * @returns {Array}
     */
    static parse(source) {
        const tokens = SExpressionParser.tokenize(source)
        const roots = []
        const stack = []
        let current = null

        for (const token of tokens) {
            if (token === '(') {
                const nextList = []
                if (current) {
                    current.push(nextList)
                    stack.push(current)
                } else {
                    roots.push(nextList)
                }
                current = nextList
                continue
            }

            if (token === ')') {
                if (!current) {
                    throw new Error('Unexpected closing parenthesis')
                }
                current = stack.pop() || null
                continue
            }

            if (!current) {
                throw new Error('Atom found outside list: ' + token)
            }
            current.push(SExpressionParser.normalizeToken(token))
        }

        if (current || stack.length > 0) {
            throw new Error('Unclosed S-expression list')
        }

        if (roots.length !== 1) {
            throw new Error('Expected one S-expression root')
        }

        return roots[0]
    }

    /**
     * Tokenizes source while preserving quoted strings.
     * @param {string} source
     * @returns {string[]}
     */
    static tokenize(source) {
        const text = String(source || '')
        const tokens = []
        let index = 0

        while (index < text.length) {
            const char = text[index]

            if (/\s/.test(char)) {
                index += 1
                continue
            }

            if (
                char === ';' ||
                (char === '#' &&
                    SExpressionParser.isLineCommentStart(text, index))
            ) {
                index = SExpressionParser.skipComment(text, index)
                continue
            }

            if (char === '(' || char === ')' || char === '|') {
                tokens.push(char)
                index += 1
                continue
            }

            if (char === '"') {
                const parsed = SExpressionParser.readString(text, index)
                tokens.push(parsed.value)
                index = parsed.nextIndex
                continue
            }

            const parsed = SExpressionParser.readAtom(text, index)
            tokens.push(parsed.value)
            index = parsed.nextIndex
        }

        return tokens
    }

    /**
     * Normalizes numeric atoms.
     * @param {string} token
     * @returns {string | number}
     */
    static normalizeToken(token) {
        if (/^[+-]?0x[0-9a-fA-F_]+$/i.test(token)) {
            const sign = String(token).startsWith('-') ? -1 : 1
            const unsigned = String(token).replace(/^[+-]?0x/i, '')
            return sign * Number.parseInt(unsigned.replace(/_/g, ''), 16)
        }

        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token)) {
            return Number(token)
        }
        return token
    }

    /**
     * Skips a line comment.
     * @param {string} text
     * @param {number} index
     * @returns {number}
     */
    static skipComment(text, index) {
        let cursor = index
        while (cursor < text.length && text[cursor] !== '\n') {
            cursor += 1
        }
        return cursor
    }

    /**
     * Reads a quoted string and decodes common escapes.
     * @param {string} text
     * @param {number} index
     * @returns {{ value: string, nextIndex: number }}
     */
    static readString(text, index) {
        let cursor = index + 1
        let value = ''

        while (cursor < text.length) {
            const char = text[cursor]
            if (char === '\\') {
                const parsed = SExpressionParser.readEscapeSequence(
                    text,
                    cursor + 1
                )
                value += parsed.value
                cursor = parsed.nextIndex
                continue
            }
            if (char === '"') {
                return { value, nextIndex: cursor + 1 }
            }
            value += char
            cursor += 1
        }

        throw new Error('Unclosed quoted string')
    }

    /**
     * Reads an unquoted atom.
     * @param {string} text
     * @param {number} index
     * @returns {{ value: string, nextIndex: number }}
     */
    static readAtom(text, index) {
        let cursor = index
        let value = ''

        while (cursor < text.length) {
            const char = text[cursor]
            if (
                /\s/.test(char) ||
                char === '(' ||
                char === ')' ||
                char === '|' ||
                char === ';'
            ) {
                break
            }
            value += char
            cursor += 1
        }

        return { value, nextIndex: cursor }
    }

    /**
     * Reads a KiCad quoted-string escape sequence.
     * @param {string} text Source text.
     * @param {number} index Index immediately after the backslash.
     * @returns {{ value: string, nextIndex: number }}
     */
    static readEscapeSequence(text, index) {
        const char = text[index]
        if (Object.hasOwn(simpleEscapes, char)) {
            return {
                value: simpleEscapes[char],
                nextIndex: index + 1
            }
        }

        if (char === 'x') {
            return SExpressionParser.readHexEscape(text, index + 1)
        }

        if (SExpressionParser.isOctalDigit(char)) {
            return SExpressionParser.readOctalEscape(text, index)
        }

        return {
            value: '\\',
            nextIndex: index
        }
    }

    /**
     * Reads a one- or two-byte KiCad hex escape.
     * @param {string} text Source text.
     * @param {number} index First possible hex digit.
     * @returns {{ value: string, nextIndex: number }}
     */
    static readHexEscape(text, index) {
        let cursor = index
        let digits = ''

        while (
            cursor < text.length &&
            digits.length < 2 &&
            SExpressionParser.isHexDigit(text[cursor])
        ) {
            digits += text[cursor]
            cursor += 1
        }

        if (digits.length === 0) {
            return { value: 'x', nextIndex: index }
        }

        return {
            value: String.fromCharCode(Number.parseInt(digits, 16)),
            nextIndex: cursor
        }
    }

    /**
     * Reads a one- to three-byte KiCad octal escape.
     * @param {string} text Source text.
     * @param {number} index First octal digit.
     * @returns {{ value: string, nextIndex: number }}
     */
    static readOctalEscape(text, index) {
        let cursor = index
        let digits = ''

        while (
            cursor < text.length &&
            digits.length < 3 &&
            SExpressionParser.isOctalDigit(text[cursor])
        ) {
            digits += text[cursor]
            cursor += 1
        }

        return {
            value: String.fromCharCode(Number.parseInt(digits, 8)),
            nextIndex: cursor
        }
    }

    /**
     * Checks whether a hash begins a KiCad line comment.
     * @param {string} text Source text.
     * @param {number} index Hash character index.
     * @returns {boolean}
     */
    static isLineCommentStart(text, index) {
        let cursor = index - 1
        while (cursor >= 0 && text[cursor] !== '\n' && text[cursor] !== '\r') {
            if (text[cursor] !== ' ' && text[cursor] !== '\t') return false
            cursor -= 1
        }
        return true
    }

    /**
     * Checks whether a character is a hex digit.
     * @param {string | undefined} value Character.
     * @returns {boolean}
     */
    static isHexDigit(value) {
        return /^[0-9a-fA-F]$/.test(value || '')
    }

    /**
     * Checks whether a character is an octal digit.
     * @param {string | undefined} value Character.
     * @returns {boolean}
     */
    static isOctalDigit(value) {
        return /^[0-7]$/.test(value || '')
    }

    /**
     * Decodes a single escaped character.
     * @param {string} value Escape marker.
     * @returns {string}
     */
    static unescapeCharacter(value) {
        return simpleEscapes[value] || value || ''
    }
}

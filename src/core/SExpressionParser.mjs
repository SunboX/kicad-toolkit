// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

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

            if (char === ';') {
                index = SExpressionParser.skipComment(text, index)
                continue
            }

            if (char === '(' || char === ')') {
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
                const next = text[cursor + 1]
                value += SExpressionParser.unescapeCharacter(next)
                cursor += 2
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
     * Decodes a single escaped character.
     * @param {string} value
     * @returns {string}
     */
    static unescapeCharacter(value) {
        const map = {
            n: '\n',
            r: '\r',
            t: '\t',
            '"': '"',
            '\\': '\\'
        }
        return map[value] || value || ''
    }
}

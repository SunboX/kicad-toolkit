// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Builds deterministic image-like payload manifests from parsed KiCad models.
 */
export class KicadImagePayloadManifestBuilder {
    static SCHEMA = 'kicad-toolkit.image-payloads.a1'

    /**
     * Builds a payload manifest from parsed KiCad documents.
     * @param {object | object[]} input Project result, document array, or document.
     * @returns {{ schema: string, summary: object, payloads: object[], diagnostics: object[] }}
     */
    static build(input) {
        const imageRows = rowsForDocuments(resolveDocuments(input))
        const payloads = []
        const diagnostics = []

        for (const image of imageRows) {
            const bytes = payloadBytes(image)
            if (!bytes.length) {
                diagnostics.push(missingPayloadDiagnostic(image))
                continue
            }

            payloads.push(payloadRecord(image, bytes))
        }

        return {
            schema: KicadImagePayloadManifestBuilder.SCHEMA,
            summary: {
                imageCount: imageRows.length,
                payloadCount: payloads.length,
                diagnosticCount: diagnostics.length
            },
            payloads,
            diagnostics
        }
    }
}

/**
 * Resolves document rows from supported input shapes.
 * @param {object | object[]} input Input value.
 * @returns {object[]}
 */
function resolveDocuments(input) {
    if (Array.isArray(input)) return input
    if (Array.isArray(input?.documents)) return input.documents
    if (input?.kind) return [input]
    return []
}

/**
 * Collects image-like payload rows from documents.
 * @param {object[]} documents Parsed document rows.
 * @returns {object[]}
 */
function rowsForDocuments(documents) {
    return (documents || []).flatMap((document) => {
        if (document.kind === 'schematic') return schematicRows(document)
        if (document.kind === 'worksheet') return worksheetRows(document)
        if (document.kind === 'pcb') return pcbRows(document)
        return []
    })
}

/**
 * Collects schematic image and embedded file rows.
 * @param {object} document Schematic document.
 * @returns {object[]}
 */
function schematicRows(document) {
    const schematic = document.schematic || {}
    return [
        ...(schematic.images || []).map((image, index) =>
            row({
                sourceDocument: document.fileName,
                kind: 'schematic-image',
                imageId: image.uuid || image.id || 'schematic-image-' + index,
                name: image.name || 'schematic-image-' + index,
                nativeFormat: image.format || image.nativeFormat || '',
                data: image.data
            })
        ),
        ...(schematic.embeddedFiles || []).map((file, index) =>
            row({
                sourceDocument: document.fileName,
                kind: 'schematic-embedded-file',
                imageId: file.uuid || file.id || 'embedded-file-' + index,
                name: file.name || 'embedded-file-' + index,
                nativeFormat: file.format || extension(file.name),
                data: file.data
            })
        )
    ]
}

/**
 * Collects worksheet bitmap rows.
 * @param {object} document Worksheet document.
 * @returns {object[]}
 */
function worksheetRows(document) {
    return (document.bitmaps || []).map((bitmap, index) =>
        row({
            sourceDocument: document.fileName,
            kind: 'worksheet-bitmap',
            imageId: bitmap.uuid || bitmap.id || 'worksheet-bitmap-' + index,
            name: bitmap.name || 'worksheet-bitmap-' + index,
            nativeFormat: bitmap.format || extension(bitmap.name),
            data: bitmap.data
        })
    )
}

/**
 * Collects PCB image rows from normalized or raw KiCad board payloads.
 * @param {object} document PCB document.
 * @returns {object[]}
 */
function pcbRows(document) {
    const drawings = [
        ...(document.pcb?.drawings || []),
        ...(document.pcb?.kicadBoard?.drawings || [])
    ]

    return drawings
        .filter((drawing) => {
            return drawing.type === 'image' || drawing.sourceType === 'image'
        })
        .map((image, index) =>
            row({
                sourceDocument: document.fileName,
                kind: 'pcb-image',
                imageId: image.uuid || image.id || 'pcb-image-' + index,
                name: image.name || 'pcb-image-' + index,
                nativeFormat: image.format || image.nativeFormat || '',
                data: image.data
            })
        )
}

/**
 * Builds one image row.
 * @param {object} value Row fields.
 * @returns {object}
 */
function row(value) {
    return stripUndefined({
        sourceDocument: String(value.sourceDocument || ''),
        kind: String(value.kind || ''),
        imageId: String(value.imageId || ''),
        name: String(value.name || ''),
        nativeFormat: String(value.nativeFormat || ''),
        data: value.data
    })
}

/**
 * Builds one payload manifest record.
 * @param {object} image Image row.
 * @param {Uint8Array} bytes Payload bytes.
 * @returns {object}
 */
function payloadRecord(image, bytes) {
    return stripUndefined({
        sourceDocument: image.sourceDocument,
        kind: image.kind,
        imageId: image.imageId,
        name: image.name,
        nativeFormat: image.nativeFormat,
        byteSize: bytes.byteLength,
        checksum: {
            algorithm: 'fnv1a32',
            value: fnv1a32(bytes)
        }
    })
}

/**
 * Builds a structured missing-payload diagnostic.
 * @param {object} image Image row.
 * @returns {object}
 */
function missingPayloadDiagnostic(image) {
    return stripUndefined({
        code: 'kicad.image-payload.missing-bytes',
        severity: 'warning',
        sourceDocument: image.sourceDocument,
        kind: image.kind,
        imageId: image.imageId,
        name: image.name,
        message: 'KiCad image payload did not include payload bytes.'
    })
}

/**
 * Extracts base64 payload bytes.
 * @param {object} image Image row.
 * @returns {Uint8Array}
 */
function payloadBytes(image) {
    return decodeBase64(image?.data)
}

/**
 * Decodes a base64 value without Node-only globals.
 * @param {string} value Base64 text.
 * @returns {Uint8Array}
 */
function decodeBase64(value) {
    const normalized = String(value || '').replace(/\s+/gu, '')
    if (!normalized) return new Uint8Array()

    try {
        const binary = globalThis.atob(normalized)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index)
        }
        return bytes
    } catch {
        return new Uint8Array()
    }
}

/**
 * Computes an FNV-1a 32-bit checksum.
 * @param {Uint8Array} bytes Payload bytes.
 * @returns {string}
 */
function fnv1a32(bytes) {
    let hash = 0x811c9dc5

    for (const value of bytes) {
        hash ^= value
        hash = Math.imul(hash, 0x01000193) >>> 0
    }

    return hash.toString(16).padStart(8, '0')
}

/**
 * Returns a lowercase file extension without dot.
 * @param {unknown} path Path value.
 * @returns {string}
 */
function extension(path) {
    const match = String(path || '').match(/\.([^.\\/]+)$/u)
    return match ? match[1].toLowerCase() : ''
}

/**
 * Removes undefined fields.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripUndefined(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(
            ([, entryValue]) => entryValue !== undefined
        )
    )
}

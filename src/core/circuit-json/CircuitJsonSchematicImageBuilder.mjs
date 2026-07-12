import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'

const Primitives = CircuitJsonModelAdapterPrimitives
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const GIF_SIGNATURES = ['GIF87a', 'GIF89a']

/** Projects native KiCad images to canonical rows and ToolkitAsset inputs. */
export class CircuitJsonSchematicImageBuilder {
    /**
     * Appends asset-backed schematic image rows.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {{ assets: object[], diagnostics: object[] }} Projection result.
     */
    static append(circuitJson, schematic, idScope, componentIds) {
        const assets = []
        const diagnostics = []
        for (const [index, image] of Primitives.array(
            schematic.images
        ).entries()) {
            const result = CircuitJsonSchematicImageBuilder.#project(
                image,
                index,
                idScope,
                componentIds
            )
            if (result.element) circuitJson.push(result.element)
            if (result.asset) assets.push(result.asset)
            if (result.diagnostic) diagnostics.push(result.diagnostic)
        }
        return { assets, diagnostics }
    }

    /**
     * Projects one native image.
     * @param {Record<string, any>} image Native image.
     * @param {number} index Native index.
     * @param {string} idScope Stable id scope.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {{ element: object | null, asset: object | null, diagnostic: object | null }} Result.
     */
    static #project(image, index, idScope, componentIds) {
        const sourcePath = CircuitJsonSchematicImageBuilder.#sourcePath(image)
        const decoded = CircuitJsonSchematicImageBuilder.#base64Bytes(
            image.data
        )
        const bytes = decoded || new Uint8Array()
        const mediaType = CircuitJsonSchematicImageBuilder.#mediaType(
            bytes,
            image,
            sourcePath
        )
        const dimensions = CircuitJsonSchematicImageBuilder.#dimensions(
            image,
            bytes
        )
        const sourceName = CircuitJsonSchematicImageBuilder.#sourceName(
            image,
            index,
            sourcePath,
            mediaType
        )
        const identity = image.uuid || image.id || sourcePath || index
        const assetId = Primitives.id(idScope, [
            'asset',
            'schematic_image',
            identity
        ])
        const diagnostic = CircuitJsonSchematicImageBuilder.#diagnostic(
            image,
            index,
            decoded,
            bytes,
            mediaType,
            dimensions,
            sourcePath
        )
        if (!dimensions || (!bytes.length && !sourcePath)) {
            return { element: null, asset: null, diagnostic }
        }
        const scale = Math.max(0, Primitives.number(image.scale, 1))
        const size = {
            width: Primitives.round(dimensions.width * scale),
            height: Primitives.round(dimensions.height * scale)
        }
        if (!(size.width > 0 && size.height > 0)) {
            return {
                element: null,
                asset: null,
                diagnostic:
                    diagnostic ||
                    CircuitJsonSchematicImageBuilder.#warning(
                        'kicad.schematic.image.invalid-size',
                        'KiCad schematic image has no positive rendered size.',
                        image,
                        index,
                        sourcePath
                    )
            }
        }
        const element = {
            type: 'schematic_image',
            schematic_image_id: Primitives.id(idScope, [
                'schematic_image',
                identity
            ]),
            asset_id: assetId,
            center: Primitives.point(
                Primitives.number(image.x, 0) + size.width / 2,
                Primitives.number(image.y, 0) + size.height / 2
            ),
            size,
            rotation: Primitives.number(image.rotation, 0),
            opacity: CircuitJsonSchematicImageBuilder.#opacity(image.opacity),
            preserve_aspect_ratio: image.preserveAspectRatio !== false,
            render_order: Number.isSafeInteger(image.renderOrder)
                ? image.renderOrder
                : index,
            source_name: sourceName,
            ...(sourcePath ? { source_path: sourcePath } : {}),
            ...CircuitJsonSchematicImageBuilder.#ownership(image, componentIds),
            ...CircuitJsonSchematicImageBuilder.#sheetOwnership(image)
        }
        const asset = {
            id: assetId,
            kind: 'schematic-image',
            name: sourceName,
            mediaType,
            data: bytes.length ? bytes : null,
            source: {
                format: 'kicad',
                embedded: bytes.length > 0,
                sourceName,
                ...(sourcePath ? { sourcePath } : {})
            }
        }
        return { element, asset, diagnostic }
    }

    /**
     * Resolves the first useful source path.
     * @param {Record<string, any>} image Native image.
     * @returns {string} Source path.
     */
    static #sourcePath(image) {
        return String(
            image.sourcePath || image.path || image.fileName || ''
        ).trim()
    }

    /**
     * Resolves one stable source asset name.
     * @param {Record<string, any>} image Native image.
     * @param {number} index Native index.
     * @param {string} sourcePath Source path.
     * @param {string} mediaType Detected media type.
     * @returns {string} Asset name.
     */
    static #sourceName(image, index, sourcePath, mediaType) {
        const explicit = String(image.sourceName || '').trim()
        if (explicit) return explicit
        const fromPath = sourcePath.split(/[\\/]/u).filter(Boolean).at(-1)
        if (fromPath) return fromPath
        const stem = String(
            image.uuid || image.id || 'image-' + String(index + 1)
        )
        return stem + CircuitJsonSchematicImageBuilder.#extension(mediaType)
    }

    /**
     * Resolves a conventional file extension.
     * @param {string} mediaType Image media type.
     * @returns {string} Dot-prefixed extension.
     */
    static #extension(mediaType) {
        if (mediaType === 'image/jpeg') return '.jpg'
        if (mediaType === 'image/gif') return '.gif'
        if (mediaType === 'image/bmp') return '.bmp'
        if (mediaType === 'image/webp') return '.webp'
        return '.png'
    }

    /**
     * Decodes canonical base64 text.
     * @param {unknown} value Payload text.
     * @returns {Uint8Array | null} Bytes, empty bytes, or null when invalid.
     */
    static #base64Bytes(value) {
        const text = String(value || '').replace(/\s+/gu, '')
        if (!text) return new Uint8Array()
        if (
            text.length % 4 !== 0 ||
            !/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u.test(
                text
            ) ||
            typeof globalThis.atob !== 'function'
        ) {
            return null
        }
        try {
            const binary = globalThis.atob(text)
            const bytes = new Uint8Array(binary.length)
            for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index)
            }
            return bytes
        } catch {
            return null
        }
    }

    /**
     * Resolves image dimensions from explicit fields or payload headers.
     * @param {Record<string, any>} image Native image.
     * @param {Uint8Array} bytes Image bytes.
     * @returns {{ width: number, height: number } | null} Dimensions.
     */
    static #dimensions(image, bytes) {
        const explicit = {
            width: Primitives.number(
                image.width ?? image.nativeWidth ?? image.size?.width,
                0
            ),
            height: Primitives.number(
                image.height ?? image.nativeHeight ?? image.size?.height,
                0
            )
        }
        if (explicit.width > 0 && explicit.height > 0) return explicit
        return (
            CircuitJsonSchematicImageBuilder.#pngDimensions(bytes) ||
            CircuitJsonSchematicImageBuilder.#gifDimensions(bytes) ||
            CircuitJsonSchematicImageBuilder.#bmpDimensions(bytes) ||
            CircuitJsonSchematicImageBuilder.#jpegDimensions(bytes)
        )
    }

    /**
     * Reads PNG dimensions.
     * @param {Uint8Array} bytes Image bytes.
     * @returns {{ width: number, height: number } | null} Dimensions.
     */
    static #pngDimensions(bytes) {
        if (
            bytes.length < 24 ||
            !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
        ) {
            return null
        }
        return CircuitJsonSchematicImageBuilder.#positiveDimensions(
            CircuitJsonSchematicImageBuilder.#uint32be(bytes, 16),
            CircuitJsonSchematicImageBuilder.#uint32be(bytes, 20)
        )
    }

    /**
     * Reads GIF dimensions.
     * @param {Uint8Array} bytes Image bytes.
     * @returns {{ width: number, height: number } | null} Dimensions.
     */
    static #gifDimensions(bytes) {
        if (bytes.length < 10) return null
        const signature = String.fromCharCode(...bytes.subarray(0, 6))
        if (!GIF_SIGNATURES.includes(signature)) return null
        return CircuitJsonSchematicImageBuilder.#positiveDimensions(
            CircuitJsonSchematicImageBuilder.#uint16le(bytes, 6),
            CircuitJsonSchematicImageBuilder.#uint16le(bytes, 8)
        )
    }

    /**
     * Reads BMP dimensions.
     * @param {Uint8Array} bytes Image bytes.
     * @returns {{ width: number, height: number } | null} Dimensions.
     */
    static #bmpDimensions(bytes) {
        if (bytes.length < 26 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
            return null
        }
        return CircuitJsonSchematicImageBuilder.#positiveDimensions(
            Math.abs(CircuitJsonSchematicImageBuilder.#int32le(bytes, 18)),
            Math.abs(CircuitJsonSchematicImageBuilder.#int32le(bytes, 22))
        )
    }

    /**
     * Reads dimensions from JPEG start-of-frame markers.
     * @param {Uint8Array} bytes Image bytes.
     * @returns {{ width: number, height: number } | null} Dimensions.
     */
    static #jpegDimensions(bytes) {
        if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
            return null
        }
        for (let offset = 2; offset + 8 < bytes.length;) {
            if (bytes[offset] !== 0xff) {
                offset += 1
                continue
            }
            const marker = bytes[offset + 1]
            if (marker === 0xd8 || marker === 0xd9) {
                offset += 2
                continue
            }
            const length = CircuitJsonSchematicImageBuilder.#uint16be(
                bytes,
                offset + 2
            )
            if (length < 2 || offset + 2 + length > bytes.length) return null
            if (
                ((marker >= 0xc0 && marker <= 0xc3) ||
                    (marker >= 0xc5 && marker <= 0xc7) ||
                    (marker >= 0xc9 && marker <= 0xcb) ||
                    (marker >= 0xcd && marker <= 0xcf)) &&
                length >= 7
            ) {
                return CircuitJsonSchematicImageBuilder.#positiveDimensions(
                    CircuitJsonSchematicImageBuilder.#uint16be(
                        bytes,
                        offset + 7
                    ),
                    CircuitJsonSchematicImageBuilder.#uint16be(
                        bytes,
                        offset + 5
                    )
                )
            }
            offset += length + 2
        }
        return null
    }

    /**
     * Resolves an image media type from bytes, native metadata, or path.
     * @param {Uint8Array} bytes Image bytes.
     * @param {Record<string, any>} image Native image.
     * @param {string} sourcePath Source path.
     * @returns {string} Media type.
     */
    static #mediaType(bytes, image, sourcePath) {
        if (CircuitJsonSchematicImageBuilder.#pngDimensions(bytes)) {
            return 'image/png'
        }
        if (CircuitJsonSchematicImageBuilder.#gifDimensions(bytes)) {
            return 'image/gif'
        }
        if (CircuitJsonSchematicImageBuilder.#bmpDimensions(bytes)) {
            return 'image/bmp'
        }
        if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
        const explicit = String(image.mimeType || image.mediaType || '')
            .trim()
            .toLowerCase()
        if (explicit.startsWith('image/')) return explicit
        const format = String(image.format || sourcePath)
            .trim()
            .toLowerCase()
        if (/\.(?:jpg|jpeg)$/u.test(format) || format === 'jpg') {
            return 'image/jpeg'
        }
        if (/\.gif$/u.test(format) || format === 'gif') return 'image/gif'
        if (/\.bmp$/u.test(format) || format === 'bmp') return 'image/bmp'
        if (/\.webp$/u.test(format) || format === 'webp') return 'image/webp'
        return 'image/png'
    }

    /**
     * Normalizes a positive dimension pair.
     * @param {number} width Width.
     * @param {number} height Height.
     * @returns {{ width: number, height: number } | null} Dimensions.
     */
    static #positiveDimensions(width, height) {
        return width > 0 && height > 0 ? { width, height } : null
    }

    /**
     * Reads an unsigned big-endian 16-bit value.
     * @param {Uint8Array} bytes Bytes.
     * @param {number} offset Offset.
     * @returns {number} Value.
     */
    static #uint16be(bytes, offset) {
        return (bytes[offset] << 8) | bytes[offset + 1]
    }

    /**
     * Reads an unsigned little-endian 16-bit value.
     * @param {Uint8Array} bytes Bytes.
     * @param {number} offset Offset.
     * @returns {number} Value.
     */
    static #uint16le(bytes, offset) {
        return bytes[offset] | (bytes[offset + 1] << 8)
    }

    /**
     * Reads an unsigned big-endian 32-bit value.
     * @param {Uint8Array} bytes Bytes.
     * @param {number} offset Offset.
     * @returns {number} Value.
     */
    static #uint32be(bytes, offset) {
        return (
            ((bytes[offset] << 24) |
                (bytes[offset + 1] << 16) |
                (bytes[offset + 2] << 8) |
                bytes[offset + 3]) >>>
            0
        )
    }

    /**
     * Reads a signed little-endian 32-bit value.
     * @param {Uint8Array} bytes Bytes.
     * @param {number} offset Offset.
     * @returns {number} Value.
     */
    static #int32le(bytes, offset) {
        return (
            bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            (bytes[offset + 3] << 24)
        )
    }

    /**
     * Builds one deterministic image diagnostic.
     * @param {Record<string, any>} image Native image.
     * @param {number} index Native index.
     * @param {Uint8Array | null} decoded Decode result.
     * @param {Uint8Array} bytes Decoded bytes.
     * @param {string} mediaType Media type.
     * @param {object | null} dimensions Image dimensions.
     * @param {string} sourcePath Source path.
     * @returns {object | null} Diagnostic.
     */
    static #diagnostic(
        image,
        index,
        decoded,
        bytes,
        mediaType,
        dimensions,
        sourcePath
    ) {
        if (decoded === null) {
            return CircuitJsonSchematicImageBuilder.#warning(
                'kicad.schematic.image.invalid',
                'KiCad schematic image payload could not be decoded.',
                image,
                index,
                sourcePath
            )
        }
        if (!bytes.length && sourcePath) {
            return CircuitJsonSchematicImageBuilder.#warning(
                'kicad.schematic.image.unresolved',
                'KiCad schematic image source is not available as a document asset.',
                image,
                index,
                sourcePath
            )
        }
        if (!dimensions) {
            return CircuitJsonSchematicImageBuilder.#warning(
                'kicad.schematic.image.dimensions',
                'KiCad schematic ' +
                    mediaType +
                    ' image dimensions could not be resolved.',
                image,
                index,
                sourcePath
            )
        }
        return null
    }

    /**
     * Builds one normalized warning.
     * @param {string} code Diagnostic code.
     * @param {string} message Diagnostic message.
     * @param {Record<string, any>} image Native image.
     * @param {number} index Native index.
     * @param {string} sourcePath Source path.
     * @returns {object} Diagnostic.
     */
    static #warning(code, message, image, index, sourcePath) {
        return {
            severity: 'warning',
            code,
            message,
            source: sourcePath,
            details: {
                imageId: String(image.uuid || image.id || index),
                ...(sourcePath ? { sourcePath } : {})
            }
        }
    }

    /**
     * Resolves optional component ownership.
     * @param {Record<string, any>} image Native image.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {object} Ownership fields.
     */
    static #ownership(image, componentIds) {
        if (!(componentIds instanceof Map)) return {}
        for (const key of [
            image.ownerIndex,
            image.componentIndex,
            image.ownerId
        ]) {
            const id = componentIds.get(String(key ?? '').trim())
            if (id) return { schematic_component_id: id }
        }
        return {}
    }

    /**
     * Resolves optional actual-page ownership.
     * @param {Record<string, any>} image Native image.
     * @returns {object} Sheet ownership fields.
     */
    static #sheetOwnership(image) {
        const id = String(image.schematicSheetId || '').trim()
        return id ? { schematic_sheet_id: id } : {}
    }

    /**
     * Resolves a valid canonical opacity.
     * @param {unknown} value Native opacity.
     * @returns {number} Opacity.
     */
    static #opacity(value) {
        const opacity = Primitives.number(value, 1)
        return Math.min(1, Math.max(0, opacity))
    }
}

Object.freeze(CircuitJsonSchematicImageBuilder.prototype)
Object.freeze(CircuitJsonSchematicImageBuilder)

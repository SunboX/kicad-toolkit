// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { strFromU8, unzipSync } from 'fflate'
import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

const REPOSITORY_SCHEMA =
    'https://go.kicad.org/pcm/schemas/v2#/definitions/Repository'
const REPORT_SCHEMA = 'kicad-toolkit.pcm-repository-index.a1'
const PACKAGE_CONTENT_TYPE = 'application/zip'
const JSON_CONTENT_TYPE = 'application/json'

/**
 * Builds KiCad package repository metadata from installable package archives.
 */
export class KicadPcmRepositoryIndexBuilder {
    /**
     * Builds repository.json, packages.json, and archive preview entries.
     * @param {{ name?: string, maintainer?: string | object, baseUrl?: string, packagesPath?: string, updateTimestamp?: number, updateTimeUtc?: string, packages?: object[], resources?: object }} [options] Repository options.
     * @returns {{ entries: object[], archives: object[], repository: object, packages: object, diagnostics: object[] }}
     */
    static build(options = {}) {
        const diagnostics = []
        const archives = KicadPcmRepositoryIndexBuilder.#archiveEntries(
            options.packages
        )
        const packageRecords = archives
            .map((archive) =>
                KicadPcmRepositoryIndexBuilder.#packageRecord(
                    archive,
                    options,
                    diagnostics
                )
            )
            .filter(Boolean)
            .sort((left, right) =>
                Utils.text(left.identifier).localeCompare(
                    Utils.text(right.identifier)
                )
            )
        const packages = { packages: packageRecords }
        const packagesEntry = KicadPcmRepositoryIndexBuilder.#jsonEntry(
            'packages.json',
            packages
        )
        const repository = KicadPcmRepositoryIndexBuilder.#repositoryMetadata(
            packagesEntry,
            options
        )
        const entries = [
            packagesEntry,
            KicadPcmRepositoryIndexBuilder.#jsonEntry(
                'repository.json',
                repository
            )
        ]

        return {
            schema: REPORT_SCHEMA,
            entries,
            archives,
            repository,
            packages,
            diagnostics
        }
    }

    /**
     * Resolves a preview response for local repository serving tests.
     * @param {{ entries?: object[], archives?: object[] }} result Repository build result.
     * @param {string} requestPath Requested URL path.
     * @returns {{ status: number, path: string, contentType: string, bytes: Uint8Array }}
     */
    static previewResponse(result, requestPath = '/') {
        const normalizedPath =
            Utils.normalizeBasePath(
                String(requestPath || '/')
                    .split('?')[0]
                    .split('#')[0]
            ) || 'repository.json'
        const entries = [...(result.entries || []), ...(result.archives || [])]
        const entry = entries.find((candidate) => {
            return Utils.normalizeBasePath(candidate.path) === normalizedPath
        })
        if (!entry) {
            return {
                status: 404,
                path: normalizedPath,
                contentType: 'text/plain',
                bytes: new TextEncoder().encode('Not found')
            }
        }
        return {
            status: 200,
            path: entry.path,
            contentType: entry.contentType || 'application/octet-stream',
            bytes: entry.bytes
        }
    }

    /**
     * Builds a SHA-256 hex digest for byte-like input.
     * @param {unknown} value Byte-like value.
     * @returns {string}
     */
    static sha256Hex(value) {
        return sha256Hex(Utils.bytes(value))
    }

    /**
     * Builds archive entries from package inputs.
     * @param {unknown} packages Candidate package inputs.
     * @returns {object[]}
     */
    static #archiveEntries(packages) {
        return (Array.isArray(packages) ? packages : []).map((entry, index) => {
            const archive = entry && typeof entry === 'object' ? entry : {}
            const fileName = Utils.safeFileName(
                archive.fileName ||
                    archive.name ||
                    'package-' + (index + 1) + '.zip'
            )
            const archiveBytes = Utils.bytes(
                archive.archiveBytes || archive.bytes
            )
            return {
                ...archive,
                fileName,
                archiveBytes,
                path: fileName,
                bytes: archiveBytes,
                contentType: PACKAGE_CONTENT_TYPE
            }
        })
    }

    /**
     * Builds one package metadata record for packages.json.
     * @param {object} archive Archive input.
     * @param {object} options Repository options.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {object | null}
     */
    static #packageRecord(archive, options, diagnostics) {
        const metadata = KicadPcmRepositoryIndexBuilder.#packageMetadata(
            archive,
            diagnostics
        )
        if (!metadata) return null
        if (!archive.archiveBytes.length) {
            diagnostics.push(
                KicadPcmRepositoryIndexBuilder.#diagnostic(
                    'kicad-pcm-repository.archive-missing',
                    archive.fileName,
                    'Package archive bytes are required for repository hashes.'
                )
            )
        }

        const versions = KicadPcmRepositoryIndexBuilder.#versions(
            metadata,
            archive,
            options
        )
        return {
            ...metadata,
            versions
        }
    }

    /**
     * Resolves package metadata from direct metadata, entries, or ZIP bytes.
     * @param {object} archive Archive input.
     * @param {object[]} diagnostics Diagnostics sink.
     * @returns {object | null}
     */
    static #packageMetadata(archive, diagnostics) {
        if (archive.metadata && typeof archive.metadata === 'object') {
            return KicadPcmRepositoryIndexBuilder.#cloneJson(archive.metadata)
        }

        const entries = KicadPcmRepositoryIndexBuilder.#packageEntries(archive)
        const metadataEntry = entries.find(
            (entry) => Utils.normalizeBasePath(entry.path) === 'metadata.json'
        )
        if (!metadataEntry) {
            diagnostics.push(
                KicadPcmRepositoryIndexBuilder.#diagnostic(
                    'kicad-pcm-repository.metadata-missing',
                    archive.fileName,
                    'Package archive is missing root metadata.json.'
                )
            )
            return null
        }

        try {
            return JSON.parse(strFromU8(metadataEntry.bytes))
        } catch (error) {
            diagnostics.push(
                KicadPcmRepositoryIndexBuilder.#diagnostic(
                    'kicad-pcm-repository.metadata-invalid',
                    archive.fileName,
                    'Package metadata.json is not valid JSON.',
                    error
                )
            )
            return null
        }
    }

    /**
     * Resolves package content entries from input entries or ZIP bytes.
     * @param {object} archive Archive input.
     * @returns {{ path: string, bytes: Uint8Array }[]}
     */
    static #packageEntries(archive) {
        if (Array.isArray(archive.entries)) {
            return archive.entries.map((entry) => ({
                path: Utils.normalizeBasePath(entry.path || entry.name),
                bytes: Utils.bytes(entry.bytes)
            }))
        }

        if (!archive.archiveBytes.length) return []
        return Object.entries(unzipSync(archive.archiveBytes)).map(
            ([path, bytes]) => ({
                path: Utils.normalizeBasePath(path),
                bytes
            })
        )
    }

    /**
     * Builds repository-side package version rows.
     * @param {object} metadata Package metadata.
     * @param {object} archive Archive input.
     * @param {object} options Repository options.
     * @returns {object[]}
     */
    static #versions(metadata, archive, options) {
        const sourceVersions = Array.isArray(metadata.versions)
            ? metadata.versions
            : [{}]
        const archiveSha =
            Utils.text(archive.downloadSha256) ||
            KicadPcmRepositoryIndexBuilder.sha256Hex(archive.archiveBytes)
        const downloadUrl =
            Utils.text(archive.downloadUrl) ||
            KicadPcmRepositoryIndexBuilder.#joinUrl(
                options.baseUrl,
                archive.fileName
            )
        const explicitInstallSize = Utils.number(archive.installSize, NaN)
        const installSize = Number.isFinite(explicitInstallSize)
            ? explicitInstallSize
            : KicadPcmRepositoryIndexBuilder.#installSize(archive)

        return sourceVersions.map((version) => ({
            ...version,
            download_sha256: archiveSha,
            download_size: archive.archiveBytes.byteLength,
            download_url: downloadUrl,
            install_size: installSize
        }))
    }

    /**
     * Calculates package install size from expanded entries.
     * @param {object} archive Archive input.
     * @returns {number}
     */
    static #installSize(archive) {
        return KicadPcmRepositoryIndexBuilder.#packageEntries(archive).reduce(
            (total, entry) => total + entry.bytes.byteLength,
            0
        )
    }

    /**
     * Builds repository.json metadata.
     * @param {object} packagesEntry packages.json entry.
     * @param {object} options Repository options.
     * @returns {object}
     */
    static #repositoryMetadata(packagesEntry, options) {
        const update = KicadPcmRepositoryIndexBuilder.#updateMetadata(options)
        return {
            $schema: REPOSITORY_SCHEMA,
            maintainer: KicadPcmRepositoryIndexBuilder.#person(
                options.maintainer,
                'Unspecified'
            ),
            name: Utils.text(options.name, 'KiCad package repository'),
            packages: {
                sha256: KicadPcmRepositoryIndexBuilder.sha256Hex(
                    packagesEntry.bytes
                ),
                update_time_utc: update.updateTimeUtc,
                update_timestamp: update.updateTimestamp,
                url: KicadPcmRepositoryIndexBuilder.#joinUrl(
                    options.baseUrl,
                    Utils.text(options.packagesPath, 'packages.json')
                )
            },
            ...(options.resources
                ? {
                      resources:
                          KicadPcmRepositoryIndexBuilder.#repositoryResource(
                              options.resources,
                              update
                          )
                  }
                : {}),
            schema_version: 2
        }
    }

    /**
     * Builds repository resource metadata.
     * @param {object} resources Resource options.
     * @param {{ updateTimeUtc: string, updateTimestamp: number }} update Update metadata.
     * @returns {object}
     */
    static #repositoryResource(resources, update) {
        return {
            sha256: Utils.text(resources.sha256),
            update_time_utc: Utils.text(
                resources.updateTimeUtc,
                update.updateTimeUtc
            ),
            update_timestamp: Utils.number(
                resources.updateTimestamp,
                update.updateTimestamp
            ),
            url: Utils.text(resources.url)
        }
    }

    /**
     * Resolves deterministic update metadata.
     * @param {object} options Repository options.
     * @returns {{ updateTimeUtc: string, updateTimestamp: number }}
     */
    static #updateMetadata(options) {
        const updateTimestamp = Math.trunc(
            Utils.number(options.updateTimestamp, Math.floor(Date.now() / 1000))
        )
        return {
            updateTimeUtc:
                Utils.text(options.updateTimeUtc) ||
                KicadPcmRepositoryIndexBuilder.#utcTime(updateTimestamp),
            updateTimestamp
        }
    }

    /**
     * Formats a UNIX timestamp as KiCad repository UTC text.
     * @param {number} timestamp UNIX timestamp in seconds.
     * @returns {string}
     */
    static #utcTime(timestamp) {
        return new Date(timestamp * 1000)
            .toISOString()
            .replace('T', ' ')
            .replace(/\.\d{3}Z$/u, '')
    }

    /**
     * Normalizes a person record.
     * @param {unknown} value Candidate person.
     * @param {string} fallbackName Fallback name.
     * @returns {{ name: string, contact: object }}
     */
    static #person(value, fallbackName) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return {
                ...value,
                name: Utils.text(value.name, fallbackName),
                contact:
                    value.contact &&
                    typeof value.contact === 'object' &&
                    !Array.isArray(value.contact)
                        ? { ...value.contact }
                        : {}
            }
        }
        return {
            name: Utils.text(value, fallbackName),
            contact: {}
        }
    }

    /**
     * Creates a JSON archive entry.
     * @param {string} path Entry path.
     * @param {object} value JSON value.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }}
     */
    static #jsonEntry(path, value) {
        return {
            path,
            bytes: new TextEncoder().encode(
                JSON.stringify(value, null, 2) + '\n'
            ),
            contentType: JSON_CONTENT_TYPE
        }
    }

    /**
     * Joins a base URL and relative path.
     * @param {unknown} baseUrl Base URL.
     * @param {unknown} relativePath Relative path.
     * @returns {string}
     */
    static #joinUrl(baseUrl, relativePath) {
        const base = Utils.text(baseUrl).replace(/\/+$/gu, '')
        const relative = Utils.normalizeBasePath(relativePath)
        return base ? base + '/' + relative : relative
    }

    /**
     * Clones JSON-safe metadata.
     * @param {object} value Source value.
     * @returns {object}
     */
    static #cloneJson(value) {
        return JSON.parse(JSON.stringify(value))
    }

    /**
     * Builds one repository diagnostic.
     * @param {string} code Diagnostic code.
     * @param {string} packageFile Package file.
     * @param {string} message Diagnostic message.
     * @param {unknown} [error] Source error.
     * @returns {object}
     */
    static #diagnostic(code, packageFile, message, error) {
        return {
            severity: 'error',
            code,
            packageFile,
            message,
            ...(error
                ? {
                      error:
                          error instanceof Error ? error.message : String(error)
                  }
                : {})
        }
    }
}

/**
 * Builds a SHA-256 digest as hex text.
 * @param {Uint8Array} bytes Source bytes.
 * @returns {string}
 */
function sha256Hex(bytes) {
    const hash = sha256(bytes)
    return Array.from(hash)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Builds a SHA-256 digest.
 * @param {Uint8Array} bytes Source bytes.
 * @returns {Uint8Array}
 */
function sha256(bytes) {
    const padded = paddedSha256Bytes(bytes)
    const hash = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
        0x1f83d9ab, 0x5be0cd19
    ]
    const words = new Uint32Array(64)

    for (let offset = 0; offset < padded.length; offset += 64) {
        for (let index = 0; index < 16; index += 1) {
            const byteOffset = offset + index * 4
            words[index] =
                (padded[byteOffset] << 24) |
                (padded[byteOffset + 1] << 16) |
                (padded[byteOffset + 2] << 8) |
                padded[byteOffset + 3]
        }

        for (let index = 16; index < 64; index += 1) {
            words[index] =
                (smallSigma1(words[index - 2]) +
                    words[index - 7] +
                    smallSigma0(words[index - 15]) +
                    words[index - 16]) >>>
                0
        }

        compressSha256Block(hash, words)
    }

    return hashWordsToBytes(hash)
}

/**
 * Builds padded SHA-256 message bytes.
 * @param {Uint8Array} bytes Source bytes.
 * @returns {Uint8Array}
 */
function paddedSha256Bytes(bytes) {
    const bitLength = bytes.length * 8
    const totalLength = Math.ceil((bytes.length + 9) / 64) * 64
    const padded = new Uint8Array(totalLength)
    padded.set(bytes)
    padded[bytes.length] = 0x80

    let length = bitLength
    for (let index = 0; index < 8; index += 1) {
        padded[totalLength - 1 - index] = length & 0xff
        length = Math.floor(length / 256)
    }

    return padded
}

/**
 * Compresses one SHA-256 message block into the hash words.
 * @param {number[]} hash Current hash words.
 * @param {Uint32Array} words Message schedule words.
 * @returns {void}
 */
function compressSha256Block(hash, words) {
    let [a, b, c, d, e, f, g, h] = hash

    for (let index = 0; index < 64; index += 1) {
        const temp1 =
            (h +
                bigSigma1(e) +
                choose(e, f, g) +
                SHA256_CONSTANTS[index] +
                words[index]) >>>
            0
        const temp2 = (bigSigma0(a) + majority(a, b, c)) >>> 0
        h = g
        g = f
        f = e
        e = (d + temp1) >>> 0
        d = c
        c = b
        b = a
        a = (temp1 + temp2) >>> 0
    }

    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
}

/**
 * Converts SHA-256 hash words to bytes.
 * @param {number[]} words Hash words.
 * @returns {Uint8Array}
 */
function hashWordsToBytes(words) {
    const bytes = new Uint8Array(32)
    for (const [index, word] of words.entries()) {
        bytes[index * 4] = (word >>> 24) & 0xff
        bytes[index * 4 + 1] = (word >>> 16) & 0xff
        bytes[index * 4 + 2] = (word >>> 8) & 0xff
        bytes[index * 4 + 3] = word & 0xff
    }
    return bytes
}

/**
 * Rotates one 32-bit word right.
 * @param {number} value Source word.
 * @param {number} shift Shift count.
 * @returns {number}
 */
function rotateRight(value, shift) {
    return (value >>> shift) | (value << (32 - shift))
}

/**
 * Applies the SHA-256 choice function.
 * @param {number} x First word.
 * @param {number} y Second word.
 * @param {number} z Third word.
 * @returns {number}
 */
function choose(x, y, z) {
    return (x & y) ^ (~x & z)
}

/**
 * Applies the SHA-256 majority function.
 * @param {number} x First word.
 * @param {number} y Second word.
 * @param {number} z Third word.
 * @returns {number}
 */
function majority(x, y, z) {
    return (x & y) ^ (x & z) ^ (y & z)
}

/**
 * Applies uppercase sigma 0.
 * @param {number} value Source word.
 * @returns {number}
 */
function bigSigma0(value) {
    return (
        rotateRight(value, 2) ^ rotateRight(value, 13) ^ rotateRight(value, 22)
    )
}

/**
 * Applies uppercase sigma 1.
 * @param {number} value Source word.
 * @returns {number}
 */
function bigSigma1(value) {
    return (
        rotateRight(value, 6) ^ rotateRight(value, 11) ^ rotateRight(value, 25)
    )
}

/**
 * Applies lowercase sigma 0.
 * @param {number} value Source word.
 * @returns {number}
 */
function smallSigma0(value) {
    return rotateRight(value, 7) ^ rotateRight(value, 18) ^ (value >>> 3)
}

/**
 * Applies lowercase sigma 1.
 * @param {number} value Source word.
 * @returns {number}
 */
function smallSigma1(value) {
    return rotateRight(value, 17) ^ rotateRight(value, 19) ^ (value >>> 10)
}

const SHA256_CONSTANTS = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

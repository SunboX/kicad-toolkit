// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import { CircuitJsonDocument } from 'circuitjson-toolkit'
import { zipSync } from 'fflate'

import { Parser } from '../src/parser.mjs'
import { ProjectLoader } from '../src/project.mjs'

const ENCODER = new TextEncoder()

/**
 * Builds a small board with one independently transformed 3D model.
 * @param {string} modelPath KiCad model reference.
 * @param {string} [additionalModels] Additional model nodes.
 * @returns {string} KiCad board source.
 */
function boardSource(modelPath, additionalModels = '') {
    return `(kicad_pcb
        (version 20241229)
        (gr_rect
            (start 0 0)
            (end 30 20)
            (stroke (width 0.15) (type solid))
            (fill none)
            (layer "Edge.Cuts")
        )
        (footprint "Fixture:Body"
            (layer "F.Cu")
            (at 10 12 30)
            (property "Reference" "U1"
                (at 0 -3 0)
                (layer "F.SilkS")
                (effects (font (size 1 1)))
            )
            (property "Value" "Body"
                (at 0 3 0)
                (layer "F.Fab")
                (effects (font (size 1 1)))
            )
            (model "${modelPath}"
                (offset (xyz 1 2 3))
                (scale (xyz 1 2 0.5))
                (rotate (xyz 4 5 6))
            )
            ${additionalModels}
        )
    )`
}

test('project loader resolves KIPRJMOD models to exact canonical asset paths', () => {
    const modelBytes = Uint8Array.from([0x53, 0x54, 0x45, 0x50, 1, 2, 3])
    const project = ProjectLoader.load(
        [
            {
                name: 'project/active-board.kicad_pcb',
                data: ENCODER.encode(boardSource('${KIPRJMOD}/parts/body.step'))
            },
            { name: 'project/parts/body.step', data: modelBytes }
        ],
        { decodeAssets: 'full' }
    )
    const document = project.documents[0]
    const cadComponent = document.model.find(
        (element) => element.type === 'cad_component'
    )
    const pcbComponent = document.model.find(
        (element) => element.type === 'pcb_component'
    )

    assert.equal(CircuitJsonDocument.isModel(document.model), true)
    assert.ok(cadComponent)
    assert.ok(pcbComponent)
    assert.equal(cadComponent.pcb_component_id, pcbComponent.pcb_component_id)
    assert.equal(
        cadComponent.source_component_id,
        pcbComponent.source_component_id
    )
    assert.equal(cadComponent.layer, 'top')
    assert.deepEqual(cadComponent.position, { x: 10, y: 12, z: 0.8 })
    assert.deepEqual(cadComponent.rotation, { x: 0, y: 0, z: 30 })
    assert.deepEqual(cadComponent.model_offset, { x: 1, y: 2, z: 3 })
    assert.deepEqual(cadComponent.model_rotation, { x: 4, y: 5, z: 6 })
    assert.deepEqual(cadComponent.model_scale, { x: 1, y: 2, z: 0.5 })
    assert.equal(cadComponent.model_step_url, 'project/parts/body.step')
    assert.deepEqual(cadComponent.model_asset, {
        project_relative_path: 'project/parts/body.step',
        url: 'project/parts/body.step',
        mimetype: 'model/step'
    })
    assert.deepEqual(project.assets[0].data, modelBytes)
})

test('KIPRJMOD uses the project root for nested boards and ZIP members', () => {
    const board = ENCODER.encode(boardSource('${KIPRJMOD}/parts/body.step'))
    const model = Uint8Array.from([0x53, 0x54, 0x45, 0x50])
    const direct = ProjectLoader.load([
        { name: 'root/demo.kicad_pro', data: ENCODER.encode('{}') },
        { name: 'root/boards/main.kicad_pcb', data: board },
        { name: 'root/parts/body.step', data: model }
    ])
    const archive = zipSync({
        'root/demo.kicad_pro': ENCODER.encode('{}'),
        'root/boards/main.kicad_pcb': board,
        'root/parts/body.step': model
    })
    const zipped = ProjectLoader.load([
        { name: 'source-bundle.zip', data: archive }
    ])
    const directCad = direct.documents[0].model.find(
        (element) => element.type === 'cad_component'
    )
    const zippedCad = zipped.documents[0].model.find(
        (element) => element.type === 'cad_component'
    )

    assert.equal(directCad.model_step_url, 'root/parts/body.step')
    assert.equal(zippedCad.model_step_url, 'source-bundle/root/parts/body.step')
    assert.equal(
        direct.documents[0].diagnostics.some(
            (diagnostic) =>
                diagnostic.code === 'kicad.pcb.3d-model.unresolved-reference'
        ),
        false
    )
    assert.equal(
        zipped.documents[0].diagnostics.some(
            (diagnostic) =>
                diagnostic.code === 'kicad.pcb.3d-model.unresolved-reference'
        ),
        false
    )
})

test('parser retains unresolved model variables and reports the missing mapping', () => {
    const rawReference = '${CUSTOM_3D_ROOT}/parts/body.step'
    const document = Parser.parse({
        fileName: 'project/active-board.kicad_pcb',
        data: boardSource(rawReference)
    })
    const cadComponent = document.model.find(
        (element) => element.type === 'cad_component'
    )

    assert.ok(cadComponent)
    assert.equal(cadComponent.model_step_url, rawReference)
    assert.equal(cadComponent.model_asset.project_relative_path, rawReference)
    assert.equal(cadComponent.model_asset.url, rawReference)
    assert.equal(
        document.diagnostics.some(
            (diagnostic) =>
                diagnostic.code === 'kicad.pcb.3d-model.unresolved-variable'
        ),
        true
    )
})

test('project loader emits every visible footprint model with stable identities', () => {
    const source = boardSource(
        '${KIPRJMOD}/parts/body.step',
        `(model "\${KIPRJMOD}/parts/cap.vrml"
            (offset (xyz -1 -2 -3))
            (scale (xyz 0.5 0.75 1.25))
            (rotate (xyz 10 20 40))
        )
        (model "\${KIPRJMOD}/parts/hidden.step"
            (offset (xyz 0 0 0))
            (scale (xyz 1 1 1))
            (rotate (xyz 0 0 0))
            (hide yes)
        )`
    )
    const entries = [
        {
            name: 'project/active-board.kicad_pcb',
            data: ENCODER.encode(source)
        },
        {
            name: 'project/parts/body.step',
            data: Uint8Array.from([1])
        },
        { name: 'project/parts/cap.vrml', data: Uint8Array.from([2]) },
        {
            name: 'project/parts/hidden.step',
            data: Uint8Array.from([3])
        }
    ]
    const first = ProjectLoader.load(entries)
    const second = ProjectLoader.load(entries)
    const cadComponents = first.documents[0].model.filter(
        (element) => element.type === 'cad_component'
    )
    const repeatedIds = second.documents[0].model
        .filter((element) => element.type === 'cad_component')
        .map((element) => element.cad_component_id)

    assert.equal(cadComponents.length, 2)
    assert.equal(
        cadComponents[0].pcb_component_id,
        cadComponents[1].pcb_component_id
    )
    assert.notEqual(
        cadComponents[0].cad_component_id,
        cadComponents[1].cad_component_id
    )
    assert.deepEqual(
        cadComponents.map((element) => element.cad_component_id),
        repeatedIds
    )
    assert.equal(cadComponents[1].model_wrl_url, 'project/parts/cap.vrml')
    assert.equal(cadComponents[1].model_asset.mimetype, 'model/vrml')
    assert.deepEqual(cadComponents[1].model_offset, { x: -1, y: -2, z: -3 })
    assert.deepEqual(cadComponents[1].model_rotation, { x: 10, y: 20, z: 40 })
    assert.deepEqual(cadComponents[1].model_scale, {
        x: 0.5,
        y: 0.75,
        z: 1.25
    })
    assert.equal(
        first.documents[0].diagnostics.some(
            (diagnostic) =>
                diagnostic.code === 'kicad.pcb.3d-model.hidden' &&
                diagnostic.details.modelReference.endsWith('hidden.step')
        ),
        true
    )
})

test('CAD placements use parsed top and bottom board surface heights', () => {
    for (const [layer, expectedZ] of [
        ['F.Cu', 1.2],
        ['B.Cu', -1.2]
    ]) {
        const source = boardSource('${KIPRJMOD}/parts/body.step')
            .replace(
                '(version 20241229)',
                '(version 20241229) (general (thickness 2.4))'
            )
            .replace('(layer "F.Cu")', `(layer "${layer}")`)
        const document = Parser.parse({
            fileName: `project/${layer}.kicad_pcb`,
            data: source
        })
        const board = document.model.find(
            (element) => element.type === 'pcb_board'
        )
        const cadComponent = document.model.find(
            (element) => element.type === 'cad_component'
        )

        assert.equal(board.thickness, 2.4)
        assert.equal(cadComponent.position.z, expectedZ)
        assert.equal(cadComponent.layer, layer === 'B.Cu' ? 'bottom' : 'top')
    }
})

import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  formatLibraryHash,
  nextInteractiveStep,
  parseLibraryHash,
} from '../lib/library-hash'
import { labelForFlowAction, listFlowActionFilterOptions } from '../lib/flow-action-options'
import { paths } from '../lib/paths'

describe('library hash routing', () => {
  it('parses flows list detail and interactive hashes', () => {
    assert.deepEqual(parseLibraryHash('#/library/flows'), { view: 'flows' })
    assert.deepEqual(parseLibraryHash('#/library/flows/flow_x'), {
      view: 'flow_detail',
      flowId: 'flow_x',
    })
    assert.deepEqual(parseLibraryHash('#/library/flows/flow_x/interactive?step=fs_home'), {
      view: 'flow_interactive',
      flowId: 'flow_x',
      step: 'fs_home',
    })
    assert.equal(formatLibraryHash({ view: 'flows' }), '#/library/flows')
    assert.equal(
      formatLibraryHash({ view: 'flow_interactive', flowId: 'flow_x', step: 'fs_home' }),
      '#/library/flows/flow_x/interactive?step=fs_home',
    )
  })

  it('parses screen detail hashes', () => {
    assert.deepEqual(parseLibraryHash('#/library/screens/vpc_opel_desktop'), {
      view: 'screen_detail',
      viewportCaptureId: 'vpc_opel_desktop',
    })
    assert.equal(
      formatLibraryHash({ view: 'screen_detail', viewportCaptureId: 'vpc_opel_desktop' }),
      '#/library/screens/vpc_opel_desktop',
    )
    assert.equal(paths.libraryCopy.screenDetailOverlay, 'Section overlay')
  })

  it('parses devices gallery hashes and viewport chips', () => {
    assert.deepEqual(parseLibraryHash('#/library/devices'), { view: 'devices', viewport: 'all' })
    assert.deepEqual(parseLibraryHash('#/library/devices?viewport=tablet'), {
      view: 'devices',
      viewport: 'tablet',
    })
    assert.deepEqual(parseLibraryHash('#/library/devices?viewport=mobile'), {
      view: 'devices',
      viewport: 'mobile',
    })
    assert.equal(formatLibraryHash({ view: 'devices' }), '#/library/devices')
    assert.equal(
      formatLibraryHash({ view: 'devices', viewport: 'tablet' }),
      '#/library/devices?viewport=tablet',
    )
    assert.equal(formatLibraryHash({ view: 'devices', viewport: 'all' }), '#/library/devices')
    assert.equal(paths.libraryCopy.devicesLabel, 'Devices')
  })

  it('requires explicit hotspot choice on branches', () => {
    const steps = [
      {
        flow_screen_id: 'fs_welcome',
        hotspots: [
          { to_screen_id: 'fs_tips' },
          { to_screen_id: 'fs_skip_done' },
        ],
        advance_anywhere: false,
      },
      { flow_screen_id: 'fs_tips', hotspots: [], advance_anywhere: true },
    ]
    assert.equal(
      nextInteractiveStep({ steps, currentScreenId: 'fs_welcome' }),
      null,
    )
    assert.equal(
      nextInteractiveStep({
        steps,
        currentScreenId: 'fs_welcome',
        hotspotTo: 'fs_tips',
      }),
      'fs_tips',
    )
  })
})

describe('flow action filter options', () => {
  it('excludes unknown and labels logging_in', () => {
    const options = listFlowActionFilterOptions()
    assert.ok(options.every((item) => item.id !== 'dig:flow.unknown'))
    assert.equal(labelForFlowAction('dig:flow.logging_in'), 'Logging in')
    assert.deepEqual(paths.libraryModes, ['screens', 'devices', 'sections', 'flows'])
    assert.equal(paths.digApiLibraryFlows, '/api/library/flows')
    assert.equal(paths.digApiLibraryPageFlows, '/api/library/page-flows')
    assert.equal(paths.libraryCopy.pageNarrativeLabel, 'Page narrative')
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  communityTone,
  convexHull,
  godNodeRadius,
  hullPath,
  neighborsFor,
  nodeDegree,
  shortGraphLabel,
  shortestPath,
} from '../lib/graphify-communities'

describe('graphify communities', () => {
  it('shortens labels to domain first', () => {
    assert.equal(
      shortGraphLabel({
        domain: 'www.hedvig.com',
        title: 'Long marketing title about insurance',
        craftLabel: 'modern minimal · monochrome',
      }),
      'hedvig.com',
    )
  })

  it('assigns stable community tones by legend order', () => {
    const order = ['monochrome', 'saturated', 'editorial']
    assert.equal(communityTone('monochrome', order).fill, communityTone('monochrome', order).fill)
    assert.notEqual(communityTone('monochrome', order).fill, communityTone('saturated', order).fill)
  })

  it('sizes god nodes by relative degree', () => {
    assert.ok(godNodeRadius(8, 8) > godNodeRadius(1, 8))
    assert.equal(nodeDegree('a', [
      { from_id: 'a', to_id: 'b' },
      { from_id: 'c', to_id: 'a' },
      { from_id: 'b', to_id: 'c' },
    ]), 2)
  })

  it('builds a convex hull path for community blobs', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 },
    ])
    assert.equal(hull.length, 4)
    const path = hullPath(hull, 4)
    assert.ok(path?.startsWith('M '))
    assert.ok(path?.endsWith(' Z'))
  })

  it('returns top neighbors by score', () => {
    const neighbors = neighborsFor(
      'a',
      [
        { from_id: 'a', to_id: 'b', score: 0.9 },
        { from_id: 'c', to_id: 'a', score: 0.7 },
        { from_id: 'a', to_id: 'd', score: 0.4 },
      ],
      2,
    )
    assert.deepEqual(
      neighbors.map((item) => item.id),
      ['b', 'c'],
    )
  })

  it('finds a shortest path between screens', () => {
    const path = shortestPath('a', 'd', [
      { from_id: 'a', to_id: 'b', score: 0.9 },
      { from_id: 'b', to_id: 'c', score: 0.8 },
      { from_id: 'c', to_id: 'd', score: 0.7 },
      { from_id: 'a', to_id: 'x', score: 0.5 },
    ])
    assert.deepEqual(path, ['a', 'b', 'c', 'd'])
    assert.equal(shortestPath('a', 'missing', [{ from_id: 'a', to_id: 'b', score: 1 }]), null)
  })
})

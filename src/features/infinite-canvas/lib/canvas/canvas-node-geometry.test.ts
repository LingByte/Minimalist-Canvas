import { describe, expect, it } from 'vitest'

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from '../../types/canvas'
import { arrangeCanvasNodes } from './canvas-node-geometry'

function node(
  id: string,
  type: CanvasNodeType,
  x: number,
  y: number,
  width = 280,
  height = 360
): CanvasNodeData {
  return { id, type, title: id, position: { x, y }, width, height }
}

function byId(nodes: CanvasNodeData[]) {
  return new Map(nodes.map((item) => [item.id, item]))
}

describe('arrangeCanvasNodes', () => {
  it('places connected results to the right of their sources', () => {
    const nodes = [
      node('img', CanvasNodeType.Image, 40, 20),
      node('vid', CanvasNodeType.Video, 80, 800, 480, 270),
    ]
    const connections: CanvasConnection[] = [
      { id: 'c', fromNodeId: 'img', toNodeId: 'vid' },
    ]
    const next = byId(arrangeCanvasNodes(nodes, connections))
    expect(next.get('vid')!.position.x).toBeGreaterThan(next.get('img')!.position.x)
  })

  it('keeps a linear chain left to right', () => {
    const nodes = [
      node('a', CanvasNodeType.Image, 0, 0),
      node('b', CanvasNodeType.Image, 40, 80),
      node('c', CanvasNodeType.Video, 80, 160, 480, 270),
    ]
    const connections: CanvasConnection[] = [
      { id: 'ab', fromNodeId: 'a', toNodeId: 'b' },
      { id: 'bc', fromNodeId: 'b', toNodeId: 'c' },
    ]
    const next = byId(arrangeCanvasNodes(nodes, connections))
    expect(next.get('b')!.position.x).toBeGreaterThan(next.get('a')!.position.x)
    expect(next.get('c')!.position.x).toBeGreaterThan(next.get('b')!.position.x)
  })

  it('tiles disconnected graphs into side-by-side zones', () => {
    const nodes = [
      node('a', CanvasNodeType.Image, 0, 0),
      node('b', CanvasNodeType.Video, 40, 40, 480, 270),
      node('c', CanvasNodeType.Image, 0, 900),
      node('d', CanvasNodeType.Video, 40, 940, 480, 270),
    ]
    const connections: CanvasConnection[] = [
      { id: 'ab', fromNodeId: 'a', toNodeId: 'b' },
      { id: 'cd', fromNodeId: 'c', toNodeId: 'd' },
    ]
    const next = byId(arrangeCanvasNodes(nodes, connections))
    expect(next.get('b')!.position.x).toBeGreaterThan(next.get('a')!.position.x)
    expect(next.get('d')!.position.x).toBeGreaterThan(next.get('c')!.position.x)
    expect(next.get('c')!.position.x).toBeGreaterThan(next.get('b')!.position.x)
    expect(Math.abs(next.get('a')!.position.y - next.get('c')!.position.y)).toBeLessThan(48)
  })

  it('does not stack a long rank into a single column', () => {
    const sources = Array.from({ length: 6 }, (_, index) =>
      node(`s${index}`, CanvasNodeType.Image, 0, index * 20)
    )
    const sink = node('t', CanvasNodeType.Video, 400, 0, 480, 270)
    const connections: CanvasConnection[] = sources.map((source, index) => ({
      id: `c${index}`,
      fromNodeId: source.id,
      toNodeId: 't',
    }))
    const next = byId(arrangeCanvasNodes([...sources, sink], connections))
    const xs = new Set(sources.map((source) => next.get(source.id)!.position.x))
    const ys = new Set(sources.map((source) => next.get(source.id)!.position.y))
    expect(xs.size).toBeGreaterThan(1)
    expect(ys.size).toBeGreaterThan(xs.size)
    expect(next.get('t')!.position.x).toBeGreaterThan(Math.max(...xs))
  })
})

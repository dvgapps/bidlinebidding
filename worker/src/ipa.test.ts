import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { IpaFormatError, IpaNoDataError, parseIpaMobile } from './ipa'

const sample = readFileSync('test/fixtures/ipa-mobile.html', 'utf8') // tests run from worker/

describe('parseIpaMobile', () => {
  it('reads the header and every row of the sample page', () => {
    const s = parseIpaMobile(sample)
    expect(s.updated).toBe('11/04/26 at 11:35z')
    expect(s.holding).toBe(813)
    expect(s.seniorBids).toBe(251)
    expect(s.rows).toHaveLength(12)
    expect(s.rows[0]).toEqual({ choice: 1, line: 818, status: 'unavailable' })
    expect(s.rows[1]).toEqual({ choice: 2, line: 813, status: 'current' })
    expect(s.rows[2]).toEqual({ choice: 3, line: 800, status: 'available' })
    expect(s.rows.map((r) => r.choice)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('reads the multiple-award count of a reserve line', () => {
    const html = sample.replace(/(<span class="linenum">800<\/span>\s*<span class="avail">)(<\/span>)/, '$1(2)$2')
    expect(parseIpaMobile(html).rows[2]).toEqual({ choice: 3, line: 800, status: 'available', count: 2 })
  })

  it('treats a page without bid lines as no data, never as all unavailable', () => {
    expect(() => parseIpaMobile('<html><body>No bid on file for this fleet</body></html>')).toThrow(IpaNoDataError)
  })

  it('fails loudly when the markup changes', () => {
    expect(() => parseIpaMobile('<html><body><h1>Maintenance</h1></body></html>')).toThrow(IpaFormatError)
    expect(() => parseIpaMobile(sample.replace('Delete24', 'Mystery24'))).toThrow(/format changed/)
    expect(() => parseIpaMobile(sample.replace('<span class="linenum">818</span>', '<span class="linenum">x</span>'))).toThrow(IpaFormatError)
    expect(() => parseIpaMobile(sample.replace('<span class="linenum">818</span>', '<span class="linenum">813</span>'))).toThrow(/twice/)
  })

  it('has no employee id in the fixture', () => {
    // the only employee id in the fixture is the placeholder
    expect(sample).toContain('gems=0000000')
    expect(sample).not.toMatch(/gems=(?!0000000)d+/)
  })
})

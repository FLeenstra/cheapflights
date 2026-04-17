import { describe, it, expect } from 'vitest'
import { sanitizeText, sanitizeEmail } from './sanitize'

describe('sanitizeText', () => {
  it('passes through normal text unchanged', () => {
    expect(sanitizeText('hello world')).toBe('hello world')
  })

  it('strips null bytes (0x00)', () => {
    expect(sanitizeText('hel\x00lo')).toBe('hello')
  })

  it('strips C0 control characters (0x01–0x08)', () => {
    expect(sanitizeText('a\x01b\x08c')).toBe('abc')
  })

  it('preserves tab (0x09)', () => {
    expect(sanitizeText('col1\tcol2')).toBe('col1\tcol2')
  })

  it('strips vertical tab and form feed (0x0B, 0x0C)', () => {
    expect(sanitizeText('a\x0Bb\x0Cc')).toBe('abc')
  })

  it('strips remaining C0 chars (0x0E–0x1F)', () => {
    expect(sanitizeText('a\x0Eb\x1Fc')).toBe('abc')
  })

  it('strips DEL (0x7F)', () => {
    expect(sanitizeText('ab\x7Fc')).toBe('abc')
  })

  it('preserves newline (0x0A) and carriage return (0x0D)', () => {
    expect(sanitizeText('line1\nline2')).toBe('line1\nline2')
    expect(sanitizeText('line1\r\nline2')).toBe('line1\r\nline2')
  })

  it('preserves unicode characters', () => {
    expect(sanitizeText('café ☕ 中文')).toBe('café ☕ 中文')
  })

  it('returns empty string unchanged', () => {
    expect(sanitizeText('')).toBe('')
  })
})

describe('sanitizeEmail', () => {
  it('lowercases the value', () => {
    expect(sanitizeEmail('User@Example.COM')).toBe('user@example.com')
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeEmail('  user@example.com  ')).toBe('user@example.com')
  })

  it('strips control characters and lowercases', () => {
    expect(sanitizeEmail('User\x00@Example.COM')).toBe('user@example.com')
  })

  it('returns empty string unchanged', () => {
    expect(sanitizeEmail('')).toBe('')
  })
})

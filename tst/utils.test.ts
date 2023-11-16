import { describe, test, expect } from '@jest/globals';
import * as Utils from '@src/utils';

describe('Test global utilities', () => {
  test('Test is empty', () => {
    expect(Utils.isEmpty(0)).toBeFalsy();
    expect(Utils.isEmpty(false)).toBeFalsy();
    expect(Utils.isEmpty(undefined)).toBeTruthy();
    expect(Utils.isEmpty(new Date())).toBeFalsy();
    expect(Utils.isEmpty({})).toBeTruthy();
    expect(Utils.isEmpty([])).toBeTruthy();
    expect(Utils.isEmpty({ a: [] })).toBeFalsy();
    expect(Utils.isEmpty(['a'])).toBeFalsy();
    expect(Utils.isEmpty('')).toBeTruthy();
    expect(Utils.isEmpty([{}, {}])).toBeTruthy();
    expect(Utils.isEmpty([[]])).toBeTruthy();
  });

  test('get or throw if empty', () => {
    expect(() => Utils.getOrThrowIfEmpty('')).toThrow();
    expect(() => Utils.getOrThrowIfEmpty(undefined)).toThrow();
    expect(Utils.getOrThrowIfEmpty(['a'])).toEqual(['a']);
  });
});

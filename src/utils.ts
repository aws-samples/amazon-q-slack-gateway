/* eslint @typescript-eslint/no-explicit-any: "off" */

export const isEmpty = <T>(value: T | undefined, checkAttributes = false): value is undefined => {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return false;
  }

  if (value instanceof Date) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => isEmpty(item));
  }

  if (value instanceof Object) {
    if (Object.keys(value).length === 0) {
      return true;
    }

    if (checkAttributes) {
      return Object.values(value).every((item) => isEmpty(item));
    }
  }

  return <any>value === '';
};

export const getOrThrowIfEmpty = <T>(value: T | undefined, name = 'element') => {
  if (isEmpty(value)) {
    throw new Error(`InvalidArgumentException: ${name} can't be empty`);
  }

  return value;
};

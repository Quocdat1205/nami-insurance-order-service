export const isEmptyValue = (input: any) => {
  return (
    (!input && input !== false && input !== 0) ||
    (typeof input === 'string' && /^\s+$/.test(input)) ||
    (input instanceof Object && !Object.keys(input).length) ||
    (Array.isArray(input) && !input.length)
  );
};

export const removeEmptyValue = (obj: any) => {
  if (!(obj instanceof Object)) return {};
  Object.keys(obj).forEach((key) => isEmptyValue(obj[key]) && delete obj[key]);
  return obj;
};

export const buildQueryString = (params: object) => {
  if (!params) return '';
  return Object.entries(params).map(stringifyKeyValuePair).join('&');
};

const stringifyKeyValuePair = ([key, value]) => {
  const valueString = Array.isArray(value) ? `["${value.join('","')}"]` : value;
  return `${key}=${encodeURIComponent(valueString)}`;
};

export const isSuccessResponse = (data: any) => {
  if (!data || data?.code < 0) return false;
  return true;
};

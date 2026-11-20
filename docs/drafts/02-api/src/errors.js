export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireFound(value, entity = 'Project') {
  if (!value) throw new HttpError(404, 'NOT_FOUND', `${entity} not found.`);
  return value;
}

export function publicError(error) {
  if (error instanceof HttpError) return error;
  if (error.type === 'entity.too.large') return new HttpError(413, 'BODY_TOO_LARGE', 'JSON body exceeds 128 KB.');
  if (error.type === 'entity.parse.failed' || error instanceof URIError) {
    return new HttpError(400, 'INVALID_JSON_OR_URL', 'Malformed JSON or URL.');
  }
  if (error.status === 415) return new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported request encoding.');
  if (['23514', '23502', '22001', '22P02', '23503'].includes(error.code) || error.code === 121) {
    return new HttpError(400, 'DATABASE_CONSTRAINT', 'The data violates a database rule.');
  }
  if (error.code === '23505' || error.code === 11000) return new HttpError(409, 'CONFLICT', 'The record already exists.');
  if (['ECONNREFUSED', 'ECONNRESET', '57P01', '55P03', '57014'].includes(error.code)
      || /Mongo(Network|ServerSelection)/.test(error.name ?? '')) {
    return new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database temporarily unavailable; try again.');
  }
  return new HttpError(500, 'INTERNAL_ERROR', 'Unexpected server error.');
}

export function modelFileKey(id: string, version: string, index: number): string {
  return `${id}/${version}/${index}`;
}

export function offlineUrlKey(request: string): string {
  return `offline-url/${request}`;
}

export function partialModelFileKey(id: string, version: string, index: number, chunk: number): string {
  return `partial/${id}/${version}/${index}/${chunk}`;
}

export function partialModelMetaKey(id: string, version: string, index: number): string {
  return `partial-meta/${id}/${version}/${index}`;
}

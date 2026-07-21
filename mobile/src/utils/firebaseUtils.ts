/**
 * Recursively cleans an object to ensure it has no undefined values.
 * Firestore will throw an error if you attempt to save an object with `undefined` properties.
 */
export function deepSanitize(obj: any): any {
  if (obj === null) return null;
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (obj[key] !== undefined) {
        newObj[key] = deepSanitize(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

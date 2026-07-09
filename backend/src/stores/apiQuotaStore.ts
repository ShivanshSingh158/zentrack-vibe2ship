export const apiQuotaStore = {
  recordRequest: () => {},
  getCapacity: () => ({ used: 0, max: 100 }),
  isThrottled: () => false
};

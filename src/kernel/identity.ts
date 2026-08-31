declare const tenantIdBrand: unique symbol;
declare const userIdBrand: unique symbol;

export type TenantId = string & { readonly [tenantIdBrand]: true };
export type UserId = string & { readonly [userIdBrand]: true };

const canonicalId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/;

export function tenantId(value: string): TenantId {
  if (!canonicalId.test(value)) {
    throw new Error('Tenant ID must be 3-64 safe characters.');
  }
  return value as TenantId;
}

export function userId(value: string): UserId {
  if (!canonicalId.test(value)) {
    throw new Error('User ID must be 3-64 safe characters.');
  }
  return value as UserId;
}


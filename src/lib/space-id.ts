declare const spaceIdBrand: unique symbol;
export type SpaceId = string & { readonly [spaceIdBrand]: true };

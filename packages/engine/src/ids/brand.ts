declare const BRAND: unique symbol;

/**
 * Nominal typing over a primitive.
 *
 * `Brand<string, 'EventId'>` is assignable to `string` but a plain `string` is not
 * assignable to it, so `Record<FlagId, …>` and `Record<EventId, …>` stop being the same
 * type. That distinction is load-bearing here: RunState holds four separate id-keyed maps
 * (flags, relationships, eventMemory, visas) and mixing them up would typecheck perfectly
 * without brands.
 *
 * The symbol is `declare`d, so it never exists at runtime and adds nothing to the bundle.
 * A branded id IS a string at runtime — JSON.stringify round-trips it unchanged, which
 * engine-spec 1 requires.
 */
export type Brand<T, B extends string> = T & { readonly [BRAND]: B };

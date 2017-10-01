export type Predicate<T> = (object: T) => boolean;

/**
 * Creates a new Predicate returning true if and only if each input predicate
 * accepts a given object.
 */
export function every<T>(...predicates: Predicate<T>[]): Predicate<T> {
    return (object: T) => {
        for (const predicate of predicates) {
            if (!predicate(object)) {
                return false;
            }
        }
        return true;
    };
}

/**
 * Creates a new Predicate returning true if and only if at least one input
 * predicate accepts a given object.
 */
export function some<T>(...predicates: Predicate<T>[]): Predicate<T> {
    return (object: T) => {
        for (const predicate of predicates) {
            if (predicate(object)) {
                return true;
            }
        }
        return false;
    };
}

/**
 * Creates a new Predicate accepting an object of the unmapped type.
 * @param mapper Maps objects from `T1` to `T2`
 * @param predicate The original predicate.
 */
export function map<T1, T2>(
    mapper: (object: T1) => T2,
    predicate: Predicate<T2>
): Predicate<T1> {
    return (object: T1) => predicate(mapper(object));
}

/**
 * Creates a new Predicate returning the complement of the input predicate.
 * @param predicate The original predicate.
 */
export function not<T>(predicate: Predicate<T>): Predicate<T> {
    return (object: T) => !predicate(object);
}

/**
 * Creates a new Predicate returning true if and only if exactly one of the
 * input predicates returned true.
 */
export function oneOf<T>(...predicates: Predicate<T>[]): Predicate<T> {
    return (object: T) => {
        return predicates.filter(pred => pred(object)).length === 1;
    };
}

/**
 * Creates a new Predicate returning true if and only no supplied predicate
 * accepts a given input.
 */
export function noneOf<T>(...predicates: Predicate<T>[]): Predicate<T> {
    return every(... predicates.map(not));
}

"use strict";

export type Maybe<T> = T | void;
export function hasValue<T>(m: Maybe<T>): m is T {
    return m !== undefined;
}
export function getOrElse<T>(m: Maybe<T>, els: T): T {
    if (hasValue<T>(m)) {
        return m;
    } else return els;
}
export function map<T, R>(m: Maybe<T>, f: (m: T)=>R): Maybe<R> {
    if (hasValue<T>(m)) {
        return f(m);
    } else return m;
}
export function flatMap<T, R>(m: Maybe<T>, f: (m: T)=>Maybe<R>): Maybe<R> {
    if (hasValue<T>(m)) {
        return f(m);
    } else return m;
}
export function filter<T>(m: Maybe<T>, f: (m: T)=>boolean): Maybe<T> {
    return hasValue<T>(m) && f(m) ? m : undefined;
}

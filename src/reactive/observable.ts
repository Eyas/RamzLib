"use strict";

export interface ObservableLike<T> {
    forEach(each: (obj: T) => void): Promise<void>;
    map<R>(mapper: (obj: T) => R): ObservableLike<R>;
    flatMap<R>(mapper: (obj: T) => Observable<R>): ObservableLike<R>;
    filter(mapper: (obj: T) => boolean): ObservableLike<T>;
    reduce<R>(
        initialValue: R, accumulate: (residue: R, next: T) => R): Observable<R>;
    withTimeout(timeoutMs: number): ObservableLike<T>;
    withConditions(...conditions: ((obj: T) => boolean)[]): ObservableLike<T>;
    whileConditions(...condition: ((obj: T) => boolean)[]): ObservableLike<T>;
    subscribe(executor: (
        unsubscribe: Signal,
        failAndUnsubscribe: (err: any) => void
    ) => Listener<T> | void): ObservableLike<T>;
    firstN(n: number): ObservableLike<T>;
    firstT(timeoutMillis: number): ObservableLike<T>;
}

export type Listener<T> = (obj: T) => void;
export type Signal = () => void;

export const ERROR_TIMEOUT = new Error("Observable timed out.");

// Implementation detail of Observable
type CallbackItem<T> = {
    listener: Listener<T>, resolve: Signal, reject: (err: any) => void
};

/**
 * Provides access to a stream of events that could be listened to and operated
 * on through a series of monad interfaces.
 */
export class Observable<T> implements ObservableLike<T> {
    // caller of Observable<T> constructor should do something similar
    // to that of Promise<T>:
    // var obs = new Observable<T>((trigger, done, fail) => {
    //     ... call trigger(obj) when needed
    //     ... call done() once complete
    //     ... call fail(err) with error if a failed condition happens
    // })
    constructor(
        executor: (trigger: (obj: T) => void,
                   done: Signal,
                   fail: (err: any) => void) => void
    ) {
        const trigger = (obj: T) => {
            // we choose to silently no-op if trigger happens after done
            this._callbacks && this._callbacks.forEach((cb, idx) => {
                if (!cb) return;

                try {
                    cb.listener(obj);
                } catch (e) {
                    cb.reject(e);
                    if (this._callbacks) {
                        this._callbacks[idx] = undefined;
                    }
                }
            });
        };

        const done = () => {
            // we choose to silently no-op if done is called multiple times
            this._callbacks && this._callbacks.forEach(d => d && d.resolve());
            this._callbacks = undefined;
        };

        const fail = (err: any) => {
            this._callbacks && this._callbacks.forEach(d => d && d.reject(err));
            this._callbacks = undefined;
        };

        executor(trigger, done, fail);
    }

    forEach(each: (obj: T) => void): Promise<void> {
        if (this.isDone()) {
            // signal `done` if isDone already.
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            this._callbacks!.push({ listener: each, resolve, reject });
        });
    }
    map<R>(mapper: (obj: T) => R): Observable<R> {
        return new Observable<R>((trigger, done, fail) => {
            this.forEach(obj => trigger(mapper(obj)));
        });
    }
    filter(predicate: (obj: T) => boolean): Observable<T> {
        return new Observable<T>((trigger, done, fail) => {
            this.forEach(obj => {
                if (predicate(obj)) trigger(obj);
            }).then(done).catch(fail);
        });
    }
    filterWhere<R extends T>(predicate: (obj: T) => obj is R): Observable<R> {
        return new Observable<R>((trigger, done, fail) => {
            this.forEach(obj => {
                if (predicate(obj)) trigger(obj);
            }).then(done).catch(fail);
        });
    }
    flatMap<R>(mapper: (obj: T) => Observable<R>): Observable<R> {
        return new Observable<R>((trigger, done, fail) => {
            // TODO: flatMap currently never terminates; unclear which
            // `done` to take seriously or how do we know when all is done
            this.forEach(obj => mapper(obj).forEach(trigger));
        });
    }
    reduce<R>(initialValue: R, reducer: (v1: R, v2: T) => R): Observable<R> {
        return new Observable<R>((trigger, done, fail) => {
            trigger(initialValue);
            this.forEach(obj => {
                initialValue = reducer(initialValue, obj);
                trigger(initialValue);
            }).then(done).catch(fail);
        });
    }
    concat(other: Observable<T>): Observable<T> {
        return new Observable<T>((trigger, done, fail) => {
            this.forEach(trigger)
                .then(() => other.forEach(trigger))
                .then(done)
                .catch(fail);
        });
    }
    all(predicate: (t: T) => boolean): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            if (this.isDone()) {
                resolve(true);
                return;
            }
            let resolved = false;
            this.subscribe(unsubscribe => {
                return obj => {
                    if (!predicate(obj)) {
                        unsubscribe();
                        resolved = true;
                        resolve(false);
                    }
                };
            }).then(() => {
                if (!resolved) { resolve(true); }
            }).catch(reject);
        });
    }
    any(predicate: (t: T) => boolean): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            if (this.isDone()) {
                resolve(false);
                return;
            }
            let resolved = false;
            this.subscribe(unsubscribe => {
                return obj => {
                    if (predicate(obj)) {
                        unsubscribe();
                        resolved = true;
                        resolve(true);
                    }
                };
            }).then(() => {
                if (!resolved) { resolve(false); }
            }).catch(reject);
        });
    }

    /**
     * Returns a Promise which resolves only when the Observable has completed.
     * @param action  specifies the action to be taken once this observable has
     *                completed.
     */
    then<R>(action: () => R): Promise<R> {
        if (this.isDone()) return Promise.resolve(action());
        else {
            return new Promise((resolve, reject) => {
                // isDone() is true iff _callbacks is undefined
                this._callbacks!.push({
                    listener: () => { },
                    resolve: () => resolve(action()),
                    reject
                });
            });
        }
    }

    /**
     * @returns  an array of all values observed since this subscription
     */
    collect(): Promise<T[]> {
        if (this.isDone()) return Promise.resolve([]);

        const c: T[] = [];
        return this.forEach(t => c.push(t)).then(() => c);
    }

    /**
     * @param n  number of events to skip
     * @returns  a new observable which triggers on each event after the first n.
     */
    skipN(n: number): Observable<T> {
        return new Observable<T>((trigger, done, fail) => {
            this.forEach(obj => {
                if (n <= 0) trigger(obj);
                else n--;
            }).then(done).catch(fail);
        });
    }

    /**
     * Returns a new observable which triggers on each event after
     * milliseconds
     * @param t  interval to skip before events are issued
     */
    skipT(t: number): Observable<T> {
        return new Observable<T>((trigger, done, fail) => {
            setTimeout(() => {
                this.forEach(trigger).then(done).catch(fail);
            }, t);
        });
    }

    /**
     * @returns  whether this Observable has copmleted.
     */
    isDone(): boolean {
        return this._callbacks === undefined;
    }

    /**
     * Returns a copy of this Observable that is a subscription.
     * A subscription is an observable that can be 'unsubscribed', which no
     * longer causes it to trigger events on its parent observable.
     *
     * @param executor  Supplied by the user and called immediately, executor
     *                  allows the subscriber to unsubscribe or fail a given
     *                  subscription. Optionally returns a listener functor to
     *                  trigger on each event.
     */
    subscribe(executor: (
        unsubscribe: Signal,
        failAndUnsubscribe: (err: any) => void
    ) => Listener<T> | void): Observable<T> {

        if (this.isDone) {
            return Observable.empty();
        }

        return new Observable<T>((trigger, done, fail) => {
            const index = this._callbacks!.length;
            const unsubscribeOnly = () => {
                if (this._callbacks && this._callbacks[index]) {
                    this._callbacks[index] = undefined;
                    return true;  // unsubscribed
                }
                return false;  // already unsubscribed
            };
            const unsubscribeDone = () => {
                if (unsubscribeOnly()) done();
            };
            const unsubscribeFail = (err: any) => {
                if (unsubscribeOnly()) fail(err);
            };

            const preTrigger = (obj: T) => {
                trigger(obj);
                if (listener) {
                    listener(obj);
                }
            };

            this._callbacks!.push({
                listener: preTrigger,
                resolve: unsubscribeDone,
                reject: unsubscribeFail
            });

            const listener = executor(unsubscribeDone, unsubscribeFail);
        });
    }

    /**
     * Returns a new Observable whose lifetime is at most timeoutMs, failing
     * if the underlying Observable has a longer lifetime.
     *
     * If this Observable is done before timeoutMs, the returned Observable
     * will be done. If this Observable fails before timeoutMs, the returned
     * Observable will fail. If this Observable is still ongoing after
     * timeoutMs, the returned Observable will fail.
     *
     * @param timeoutMs amount of time before an ongoing Observable is ended.
     */
    withTimeout(timeoutMs: number): Observable<T> {
        return this.subscribe((unsubscribe, fail) => {
            setTimeout(() => {
                fail(ERROR_TIMEOUT);
            }, timeoutMs);
        });
    }

    /**
     * @param conditions Predicates for whether obj should be included
     * @returns a new Observable that triggers only on objects in this
     * Observable where each condition of conditions passed applies.
     */
    withConditions(...conditions: ((obj: T) => boolean)[]): Observable<T> {
        return new Observable((trigger, done, fail) => {
            this.forEach((obj: T) => {
                if (conditions.every(c => c(obj))) {
                    trigger(obj);
                }
            }).then(done).catch(fail);
        });
    }

    /**
     * @param conditions Predicates for whether the Observable should be
     *                   included. If any of these return false, the Observable
     *                   will signal an end.
     * @returns a new Observable that triggers all objects in this Observable
     * until one of the condition predicates evaluates to `false` for a given
     * event.
     */
    whileConditions(...conditions: ((obj: T) => boolean)[]): Observable<T> {
        return this.subscribe((unsubscribe, fail) => {
            return (obj: T) => {
                if (!conditions.every(c => c(obj))) {
                    unsubscribe();
                }
            };
        });
    }

    /**
     * Returns a new Observable based on this, with at most n events before
     * terminating successfully.
     * @param n The maximum number of events to include in this Observable.
     */
    firstN(n: number): Observable<T> {
        if (n <= 0) return Observable.empty();

        return this.subscribe(unsubscribe => {
            return (obj: T) => {
                if (n-- === 0) {
                    unsubscribe();
                }
            };
        });
    }

    /**
     * Returns a new Observable whose lifetime is at most timeoutMs.
     *
     * If this Observable is done before timeoutMs, the returned Observable
     * will be done. If this Observable fails before timeoutMs, the returned
     * Observable will fail. If this Observable is still ongoing after
     * timeoutMs, the returned Observable will be done.
     *
     * This is similar to withTimeout, but succeeds if the timeout elapses and
     * the underlying Observable has not yet completed.
     *
     * @param timeoutMs amount of time before an ongoing Observable is ended.
     */
    firstT(timeoutMs: number): Observable<T> {
        return this.subscribe(unsubscribe => {
            setTimeout(() => {
                unsubscribe();
            }, timeoutMs);
        });
    }

    private _callbacks?: (CallbackItem<T> | undefined)[] = [];

    // static manipulation functions
    static merge<T>(a: Observable<T>, b: Observable<T>): Observable<T> {
        return new Observable((trigger, done, fail) => {
            Promise.all([
                a.forEach(trigger),
                b.forEach(trigger)
            ]).then(done).catch(fail);
        });
    }

    // static creation functions
    static interval(timeout: number): Observable<number> {
        return new Observable((trigger, done, fail) => {
            let count = 0;
            setInterval(() => {
                trigger(count);
                ++count;
            }, timeout);
            // done() is never called
        });
    }
    static fromArray<T>(array: T[]): Observable<T> {
        return new Observable((trigger, done, fail) => {
            array.forEach(trigger);
            done();
        });
    }
    static fromPromise<T>(p: Promise<T>): Observable<T> {
        return new Observable((trigger, done, fail) => {
            p.then(v => {
                trigger(v);
                done();
            }).catch(fail);
        });
    }
    static just<T>(val: T): Observable<T> {
        return new Observable((trigger, done) => {
            trigger(val);
            done();
        });
    }
    static empty(): Observable<never> {
        return new Observable((trigger, done) => {
            done();
        });
    }
    static never(): Observable<never> {
        return new Observable((trigger, done) => { });
    }
    static throw(error: Error): Observable<never> {
        return new Observable((trigger, done, fail) => {
            fail(error);
        });
    }
}

/**
 * A Subscription<T> is a similar type to Observable<T> but can be
 * unsubscribed externally through the dispose() API call.
 */
export class Subscription<T> extends Observable<T> {

    public dispose: () => void;

    constructor(
        executor: (trigger: Listener<T>,
                   done: Signal,
                   fail: Listener<any>) => void
    ) {
        super((trigger, done, fail) => {
            this.dispose = done;
            executor(trigger, done, fail);
        });
    }

    // static creation functions
    static interval(timeout: number): Subscription<number> {
        return new Subscription((trigger, done) => {
            let count = 0;
            setInterval(() => {
                trigger(count);
                ++count;
            }, timeout);
            // done() is never called
        });
    }
    static fromListener<K extends keyof HTMLElementEventMap>(
        element: HTMLElement, event: K): Subscription<HTMLElementEventMap[K]> {

        const sub = new Subscription<HTMLElementEventMap[K]>(
            (trigger, done) => {
                element.addEventListener( event, cb => trigger(cb));
                sub.then(() => element.removeEventListener(event, trigger));
            });
        return sub;
    }
}

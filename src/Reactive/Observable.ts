"use strict";

export interface ObservableLike<T> {
    forEach(each: (obj: T) => void): void;
    map<R>(mapper: (obj: T) => R): ObservableLike<R>;
    flatMap<R>(mapper: (obj: T) => Observable<R>): ObservableLike<R>;
    filter(mapper: (obj: T) => boolean): ObservableLike<T>;
    reduce<R>(initialValue: R, accumulate: (residue: R, next: T) => R): Observable<R>;
}

export type Listener<T> = (obj: T) => any;
export type Signal = () => void;

// Implementation detail of Observable
type CallbackItem<T> = { listener: Listener<T>, resolve: Signal, reject: (err: any) => void };

/**
 * Provides access to a stream of events that could be listened to and operated on
 * through a series of monad interfaces.
 */
export class Observable<T> implements ObservableLike<T> {
    // caller of Observable<T> constructor should do something similar
    // to that of Promise<T>:
    // var obs = new Observable<T>((trigger, done, fail) => {
    //     ... call trigger(obj) when needed
    //     ... call done() once complete
    //     ... call fail(err) with error if a failed condition happens
    // })
    constructor(executor: (trigger: (obj: T) => void, done: Signal, fail: (err: any) => void) => void) {
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
            this.forEach(trigger).then(() => other.forEach(trigger)).then(done).catch(fail);
        });
    }
    all(predicate: (t: T) => boolean): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            if (this.isDone()) {
                resolve(true);
                return;
            }
            let resolved = false;
            this.forEach(obj => {
                if (!predicate(obj)) {
                    resolved = true;
                    resolve(false);
                }
            }).then(() => {
                if (!resolved) resolve(true);
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
            this.forEach(obj => {
                if (predicate(obj)) {
                    resolved = true;
                    resolve(true);
                }
            }).then(() => {
                if (!resolved) resolve(false);
            }).catch(reject);
        });
    }

    /**
     * @param action  specifies the action to be taken once the observable has completed.
     * @returns       a Promise which resolves only when the Observable has completed.
     */
    then<R>(action: () => R): Promise<R> {
        if (this.isDone()) return Promise.resolve(action());
        else { return new Promise((resolve, reject) => {
            // isDone() is true iff _callbacks is undefined
            this._callbacks!.push({
                listener: () => {},
                resolve: () => resolve(action()),
                reject });
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
     * @param t  interval to skip before events are issued
     * @returns  a new observable which triggers on each event after t milliseconds.
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

    protected _callbacks?: (CallbackItem<T>|undefined)[] = [];

    // static manipulation functions
    static merge<T>(a: Observable<T>, b: Observable<T>): Observable<T> {
        return new Observable((trigger) => {
            a.forEach(trigger);
            b.forEach(trigger);
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
    static empty(): Observable<any> { // ideally Never/Undefined
        return new Observable((trigger, done) => {
            done();
        });
    }
    static never(): Observable<any> { // ideally Never/Undefined
        return new Observable((trigger, done) => { });
    }
}

/**
 * A Subscription<T> is a similar type to Observable<T> but can be unsubscribed externally
 * through the dispose() API call.
 */
export class Subscription<T> extends Observable<T> {

    dispose(): void {
        // we'll just re-implement done again, better than exposing it to the naughties
        this._callbacks && this._callbacks.forEach(d => d && d.resolve());
        this._callbacks = undefined;
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
    static fromListener<K extends keyof HTMLElementEventMap>(element: HTMLElement, event: K): Subscription<HTMLElementEventMap[K]> {
        const sub = new Subscription<HTMLElementEventMap[K]>((trigger, done) => {
            element.addEventListener(event, (cb: Event) => trigger(cb));
            sub.then(() => element.removeEventListener(event, trigger));
        });
        return sub;
    }
}

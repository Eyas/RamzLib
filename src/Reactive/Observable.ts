"use strict";

export interface ObservableLike<T> {
    forEach(each: (obj: T) => void): void;
    map<R>(mapper: (obj: T) => R): ObservableLike<R>
    flatMap<R>(mapper: (obj: T) => Observable<R>): ObservableLike<R>
    filter<R>(mapper: (obj: T) => boolean): ObservableLike<T>
}

export type Listener<T> = (obj: T) => any;
export type Signal = () => void;

/**
 * Provides access to a stream of events that could be listened to and operated on
 * through a series of monad interfaces.
 */
export class Observable<T> implements ObservableLike<T> {
    // caller of Observable<T> constructor should do something similar
    // to that of Promise<T>:
    // var obs = new Observable<T>((trigger, done) => {
    //     ... call trigger(obj) when needed
    //     ... call done() once compelte
    // })
    constructor(executor: (trigger: (obj: T) => void, done: Signal, fail: (err: any)=>void) => void) {
        var self = this;
        var trigger = (obj: T) => {
            // we choose to silently no-op if trigger happens after done
            self._callbacks && self._callbacks.forEach((cb, idx) => {
                if (!cb) return;

                try {
                    cb.listener(obj);
                } catch (e) {
                    cb.reject(e);
                    self._callbacks[idx] = undefined;
                }
            });
        };

        var done = () => {
            // we choose to silently no-op if done is called multiple times
            self._callbacks && self._callbacks.forEach(d => d.resolve());
            self._callbacks = undefined;
        };

        var fail = (err: any) => {
            self._callbacks && self._callbacks.forEach(d => d.reject(err));
            self._callbacks = undefined;
        };

        executor(trigger, done, fail);
    }
    forEach(each: (obj: T) => void): Promise<void> {
        var self = this;
        if (self.isDone()) {
            // signal `done` if isDone already.
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            self._callbacks.push({ listener: each, resolve: resolve, reject: reject });
        });
    }
    map<R>(mapper: (obj: T) => R): Observable<R> {
        var self = this; // not necessary with arrow functions?
        return new Observable<R>((trigger, done, fail) => {
            self.forEach(obj => trigger(mapper(obj)));
        });
    }
    filter(predicate: (obj: T) => boolean): Observable<T> {
        var self = this;
        return new Observable<T>((trigger, done, fail) => {
            self.forEach(obj => {
                if (predicate(obj)) trigger(obj);
            }).then(done).catch(fail);
        });
    }
    filterWhere<R extends T>(predicate: (obj: T) => obj is R): Observable<R> {
        var self = this;
        return new Observable<R>((trigger, done, fail) => {
            self.forEach(obj => {
                if (predicate(obj)) trigger(obj);
            }).then(done).catch(fail);
        });
    }
    flatMap<R>(mapper: (obj: T) => Observable<R>): Observable<R> {
        var self = this;
        return new Observable<R>((trigger, done, fail) => {
            // TODO: flatMap currently never terminates; unclear which
            // `done` to take seriously or how do we know when all is done
            self.forEach(obj => mapper(obj).forEach(trigger));
        });
    }
    reduce<R>(initialValue: R, reducer: (v1: R, v2: T) => R): Observable<R> {
        var self = this;
        return new Observable<R>((trigger, done, fail) => {
            trigger(initialValue);
            self.forEach(obj => {
                initialValue = reducer(initialValue, obj);
                trigger(initialValue);
            }).then(done).catch(fail);
        });
    }
    concat(other: Observable<T>): Observable<T> {
        var self = this;
        return new Observable<T>((trigger, done, fail) => {
            self.forEach(trigger).then(() => other.forEach(trigger)).then(done).catch(fail);
        });
    }
    all(predicate: (t: T) => boolean): Promise<boolean> {
        var self = this;
        return new Promise<boolean>((resolve, reject) => {
            if (self.isDone()) {
                resolve(true);
                return;
            }
            var resolved = false;
            self.forEach(obj => {
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
        var self = this;
        return new Promise<boolean>((resolve, reject) => {
            if (self.isDone()) {
                resolve(false);
                return;
            }
            var resolved = false;
            self.forEach(obj => {
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
    then<R>(action: ()=>R): Promise<R> {
        var self = this;
        if (this.isDone()) return Promise.resolve(action());
        else return new Promise((resolve, reject) => {
            this._callbacks.push({
                listener: () => {},
                resolve: () => resolve(action()),
                reject: reject });
        });
    }

    /**
     * @param n  number of events to skip
     * @returns  a new observable which triggers on each event after the first n.
     */
    skipN(n: number): Observable<T> {
        var self = this;
        return new Observable<T>((trigger, done, fail) => {
            self.forEach(obj => {
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
        var self = this;
        return new Observable<T>((trigger, done, fail) => {
            setTimeout(() => {
                self.forEach(trigger).then(done).catch(fail);
            }, t);
        });
    }

    /**
     * @returns  whether this Observable has copmleted.
     */
    isDone(): boolean {
        return this._callbacks === undefined;
    }
    protected _callbacks: { listener: Listener<T>, resolve: Signal, reject: (err: any) => void}[] = [];

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
           var count = 0;
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
        })
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
        this._callbacks && this._callbacks.forEach(d => d.resolve());
    }
    
    // static creation functions
    static interval(timeout: number): Subscription<number> {
        return new Subscription((trigger, done) => {
           var count = 0;
           setInterval(() => {
               trigger(count);
               ++count;
           }, timeout);
           // done() is never called
        });
    }
    static fromListener(element: HTMLElement, event: string): Subscription<Event> {
        var sub = new Subscription<Event>((trigger, done) => {
            element.addEventListener(event, (cb: Event) => trigger(cb));
            sub.then(() => element.removeEventListener(event, trigger));
        });
        return sub;
    }
}

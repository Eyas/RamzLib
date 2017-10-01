import { ObservableLike } from "./observable";

export class AsyncIteratorDone {
    private constructor() {}
    // Workaround for TypeScript issue #18186. Do not depend on this value.
    private readonly __internal: "AED" = "AED";
    public static readonly Instance = new AsyncIteratorDone();
}

export interface IAsyncIterator<T> {
    next(): Promise<T | AsyncIteratorDone>;
}


export class ObservableAsyncIterator<T> implements IAsyncIterator<T> {
    private demanded: {
        resolve: (value: T | AsyncIteratorDone) => void,
        reject: (err: any) => void
    }[] = [];
    private queued: T[] = [];
    private done: Promise<AsyncIteratorDone> | undefined = undefined;

    constructor(observable: ObservableLike<T>) {
        observable.forEach(object => {
            const demanded = this.demanded.shift();
            if (demanded) {
                demanded.resolve(object);
            } else {
                this.queued.push(object);
            }

        }).then(() => {
            // Mark as done
            this.done = Promise.resolve(AsyncIteratorDone.Instance);

            // If there are any demanded promises, mark them all as done.
            for (const demanded of this.demanded) {
                demanded.resolve(AsyncIteratorDone.Instance);
            }
            this.demanded = [];

        }).catch((err) => {
            // Mark as 'done' (but really, failed)
            this.done = Promise.reject(err);

            // If there are any demanded promises, mark them all as rejected:
            for (const demanded of this.demanded) {
                demanded.reject(err);
            }
            this.demanded = [];
        });
    }

    next(): Promise<T | AsyncIteratorDone> {
        // if an event is queued, it is due to resolve first.
        const queued = this.queued.shift();
        if (queued) return Promise.resolve(queued);

        // otherwise, if we are done, resolve now.
        if (this.done) return this.done;

        // otherwise, enqueue this demand for more:
        return new Promise((resolve, reject) => {
            this.demanded.push({resolve, reject});
        });
    }
}

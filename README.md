# RamzLib
Reactive Library for TypeScript

Provides reactive constructs such as `Observable` to Node and browser code via TypeScript.

## Using Observables

The basic building block of RamzLib is the `Observable<T>` type. This provides a functional API on top of repeatable
asynchronous events. If you're unfamiliar with the Observable concept, then `Observable<T>` is to `T[]` as `Promise<T>` is to `T` itself.

```ts
// `timeout` is an example static helper from Observable;
// counter will have a monotonically increasing number Observed every second
const counter: Observable<number> = Observable.timeout(1000);

counter.forEach(n => console.log(n + " seconds passed."));
counter.map(n => n * 1000).forEach(n => console.log(n + " milliseconds passed."));

// observable can be used to process expensive data that we
// receive asynchronously, without waiting for the rest:
function processAsync(observable: Observable<number>): Observable<string> {
  return observable.reduce("", expensiveOp);
}
```

## Building

This project requires: [NodeJS](https://nodejs.org/) and [npm](https://www.npmjs.com/). Now you can manage the rest of the dependencies through `npm` (these are located in `package.json`):

```sh
npm install
```

Now you are ready to build and run tests:

```sh
npm run build
```

will produce output to `built/`.

```sh
npm run test
```

will run tests in [Jest](https://facebook.github.io/jest/).

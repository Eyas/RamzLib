"use strict";

// This could be improved with project references-- right now we include src/**/*.ts in
// our compilation just to get this line to work.
import { Observable, Listener, Signal } from "../src/reactive/observable";


describe("Observable", function() {
    function getObservable<T>(): { o: Observable<T>, t: Listener<T>, d: Signal, r: (e: any) => void} {
        let t: Listener<T>;
        let d: Signal;
        let r: (e: any) => void;
        return {
            o: new Observable<T>((trigger, done, reject) => {
                t = trigger;
                d = done;
                r = reject;
            }),
            t: t!,
            d: d!,
            r: r!
        };
    }

    it("executes executor immediately", function() {
        let executed = false;
        new Observable<number>(() => { executed = true; });
        expect(executed).toBe(true);
    });

    describe("foreach", function() {
        it("triggers when called", function() {
            const numbers: number[] = [];
            const obs = getObservable<number>();
            obs.o.forEach((o) => numbers.push(o));

            expect(numbers.length).toBe(0);

            obs.t(1);
            expect(numbers.length).toBe(1);

            obs.t(2);
            expect(numbers.length).toBe(2);

            obs.d();
            expect(numbers.length).toBe(2);
            obs.t(3);
            expect(numbers.length).toBe(2);

            expect(obs.o.isDone()).toBe(true);
        });

        it("resolves its promise", function(done) {
            const numbers: number[] = [];
            const obs = getObservable<number>();
            obs.o.forEach((o) => numbers.push(o)).then(done).catch(fail);

            expect(numbers.length).toBe(0);

            obs.t(1);
            expect(numbers.length).toBe(1);

            obs.t(2);
            expect(numbers.length).toBe(2);

            obs.d();
        });

        it("globally fails its promise", function(done) {
            const numbers: number[] = [];
            const obs = getObservable<number>();
            obs.o.forEach((o) => numbers.push(o)).then(fail).catch((err) => {
                expect(err).toBe("global");
                done();
            });

            expect(numbers.length).toBe(0);

            obs.t(1);
            expect(numbers.length).toBe(1);

            obs.t(2);
            expect(numbers.length).toBe(2);

            obs.r("global");
        });

        it("locally fails its promise", function(done) {
            const numbers: number[] = [];
            const obs = getObservable<number>();
            obs.o.forEach((o) => {
                if (o === 3) throw "local";
                else numbers.push(o);
            }).then(fail).catch((err) => {
                expect(err).toBe("local");
                done();
            });

            expect(numbers.length).toBe(0);

            obs.t(1);
            expect(numbers.length).toBe(1);

            obs.t(2);
            expect(numbers.length).toBe(2);

            obs.t(3);
            expect(numbers.length).toBe(2);
        });


    });

    describe("then", function(){
        it("works with success", function(done) {
            const obs = getObservable<number>();
            obs.o.then(done).catch(fail);

            obs.t(1); obs.t(2); obs.t(3); obs.d();
        });

        it("works with failure", function(done) {
            const obs = getObservable<number>();
            obs.o.then(fail).catch((e: any) => {
                expect(e).toBe("failed");
                done();
            });

            obs.t(1); obs.t(2); obs.t(3); obs.r("failed"); obs.d();
        });
    });

});

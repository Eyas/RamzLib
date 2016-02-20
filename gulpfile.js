var gulp = require('gulp');
var tsc = require('gulp-typescript');
var del = require('del');
var jasmine = require('gulp-jasmine');
var merge = require('merge2');

gulp.task('clean', function() {
    return del('built');
});

gulp.task('build', function() {
    var result =
        gulp.src(['src/**/*.ts', 'typings/**/*.d.ts'])
        .pipe(tsc({
            noImplicitAny: true,
            target: 'ES6',
            declaration: true,
            noExternalResolve: true
        }));
    return merge([
        result.dts.pipe(gulp.dest('built/definitions')),
        result.js.pipe(gulp.dest('built/js'))
    ]);
});

gulp.task('build-tests', function() {
    return gulp.src(['./test/**/*.ts', './src/**/*.ts', './typings/**/*.d.ts'], { base: './' })
        .pipe(tsc({
            noImpilcitAny: true,
            target: 'ES6',
            declaration: false,
            noExternalResolve: true,
            module: "commonjs"
        }))
        .pipe(gulp.dest('built/tests/'));
});

gulp.task('test', ['build-tests'], function() {
    return gulp.src('built/tests/test/**/*.js')
        .pipe(jasmine());
});

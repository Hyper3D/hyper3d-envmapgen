#!/bin/sh

cd "$(dirname "$0")"

git checkout master || exit $?
git checkout -B gh-pages || exit $?

npm run build || exit $?
npm run build:examples || exit $?

# Build the directory structure for the example
cp examples/dist/* examples/
git add -f examples/*.html
git add -f examples/*.js
git add -f examples/*.css
git add -f examples/*.jpg

git commit -m "Update GitHub Pages"

git push -u origin gh-pages --force

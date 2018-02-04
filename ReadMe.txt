This SPA is built on Express JS using Rollup to bundle the javascript.
The javascript is all bundled to one file /public/js/main.min.js

If built with environment set to production, the Javascript will be minified:

NODE_ENV=production ./node_modules/.bin/rollup -c

Otherwise the Javascript will not be minified so that it can be debugged:

./node_modules/.bin/rollup -c


The project also contains a linter which is used to validate the Javascript.
This is configured in .eslintrc.json and is added to Rollup in rollup.config.js


 Starting the website in Express JS:

 node server.js


 
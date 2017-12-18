/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
const fs = require('fs');
const data = fs.readFileSync(process.argv[2]);
const base64 = data.toString('base64');
process.stdout.write('const base64js = require("base64-js");\n');
process.stdout.write('module.exports = base64js.toByteArray("');
process.stdout.write(base64);
process.stdout.write('");\n');

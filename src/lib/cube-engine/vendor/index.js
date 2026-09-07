// Vendored from the `cubejs` npm package (MIT licensed, see LICENSE in this
// directory). We vendor the two files we actually use (cube.js + solve.js)
// instead of depending on the npm package directly, because published
// versions of cubejs with solving support (>=1.2.0) declare a spurious
// dependency on the `npm` CLI package itself, which drags in a very old,
// vulnerable copy of `tar`/`tough-cookie`/`uuid`. That dependency is never
// actually required by cubejs's own code (verified) -- vendoring avoids it
// entirely while keeping the exact same battle-tested cube engine and
// two-phase (Kociemba) solver.
module.exports = require("./cube");
require("./solve");

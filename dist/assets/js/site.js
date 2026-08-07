(() => {
  "use strict";

  import("./main.js").catch((error) => {
    console.error("Failed to load main site script", error);
  });
})();

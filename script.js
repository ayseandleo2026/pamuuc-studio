(() => {
  "use strict";

  import("./assets/js/site.js").catch((error) => {
    console.error("Failed to load site script", error);
  });
})();

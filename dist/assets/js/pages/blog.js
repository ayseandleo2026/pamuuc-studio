(() => {
  "use strict";

  const body = document.body;
  const pageType = body?.dataset.pageType || "";
  if (pageType !== "blog" && pageType !== "blog-post") {
    return;
  }

  const placeholderCopy = {
    en: { card: "Cover image coming soon", article: "Article image coming soon" },
    fr: { card: "Image de couverture à venir", article: "Image d’article à venir" },
    it: { card: "Immagine di copertina in arrivo", article: "Immagine articolo in arrivo" },
    es: { card: "Imagen de portada próximamente", article: "Imagen del artículo próximamente" }
  };
  const language = body.dataset.language || document.documentElement.lang || "en";
  const copy = placeholderCopy[language] || placeholderCopy.en;

  const ensureMediaShell = (selector, label) => {
    document.querySelectorAll(selector).forEach((shell) => {
      const image = shell.querySelector("img");
      if (image?.getAttribute("src")) {
        image.addEventListener("error", () => {
          shell.classList.add("is-missing-media");
          image.remove();
          if (!shell.querySelector(".blog-media-placeholder")) {
            const placeholder = document.createElement("div");
            placeholder.className = "blog-media-placeholder";
            placeholder.textContent = label;
            shell.appendChild(placeholder);
          }
        }, { once: true });
        return;
      }

      shell.classList.add("is-missing-media");
      if (!shell.querySelector(".blog-media-placeholder")) {
        const placeholder = document.createElement("div");
        placeholder.className = "blog-media-placeholder";
        placeholder.textContent = label;
        shell.appendChild(placeholder);
      }
    });
  };

  ensureMediaShell(".blog-card-media", copy.card);
  ensureMediaShell(".blog-cover", copy.article);
})();

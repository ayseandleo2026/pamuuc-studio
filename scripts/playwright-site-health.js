async (page) => {
  const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
  const defaultCheckPaths = [
    "/",
    "/fr/",
    "/it/",
    "/es/",
    "/en/blog/",
    "/fr/blog/",
    "/it/blog/",
    "/es/blog/",
    "/en/blog/custom-dental-clinic-uniforms-barcelona/",
    "/fr/blog/uniformes-clinique-dentaire-sur-mesure-barcelone/",
    "/it/blog/divise-clinica-dentale-personalizzate-barcellona/",
    "/es/blog/uniformes-clinica-dental-personalizados-barcelona/",
    "/en/blog/custom-hospitality-uniforms/",
    "/fr/blog/uniformes-hotellerie-personnalises/",
    "/it/blog/divise-hospitalita-personalizzate/",
    "/es/blog/uniformes-hosteleria-personalizados/",
    "/en/blog/wellness-studio-uniform-system/",
    "/fr/blog/uniformes-studios-bien-etre/",
    "/it/blog/divise-studi-benessere/",
    "/es/blog/uniformes-estudios-bienestar/"
  ];
  const checkPaths = (() => {
    try {
      const parsed = JSON.parse(process.env.CHECK_PATHS || "[]");
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultCheckPaths;
    } catch (error) {
      return defaultCheckPaths;
    }
  })();
  const issues = {
    console: [],
    requestFailed: [],
    badResponses: [],
    pageAuditsDesktop: [],
    pageAuditsMobile: []
  };

  const dedupeBy = (items, keyFn) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const ignoreRequestFailure = (request, errorText) => {
    return request.resourceType() === "image" && errorText === "net::ERR_ABORTED";
  };

  page.on("console", (message) => {
    if (!["warning", "error"].includes(message.type())) {
      return;
    }

    issues.console.push({
      type: message.type(),
      text: message.text(),
      page: page.url()
    });
  });

  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText || "unknown";
    if (ignoreRequestFailure(request, errorText)) {
      return;
    }

    issues.requestFailed.push({
      url: request.url(),
      type: request.resourceType(),
      error: errorText
    });
  });

  page.on("response", (response) => {
    if (response.status() < 400) {
      return;
    }

    issues.badResponses.push({
      url: response.url(),
      status: response.status(),
      type: response.request().resourceType()
    });
  });

  const collectPageAudit = async (path, { mobile }) => {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);

    if (mobile) {
      await page.evaluate(() => {
        document.querySelectorAll("details").forEach((element) => {
          element.open = true;
        });
      });
      await page.waitForTimeout(400);
    }

    await page.evaluate(async () => {
      const pageHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );
      const step = Math.max(window.innerHeight - 120, 240);

      for (let top = 0; top <= pageHeight; top += step) {
        window.scrollTo(0, top);
        await new Promise((resolve) => window.setTimeout(resolve, 160));
      }

      window.scrollTo(0, 0);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
    });

    await page.waitForTimeout(500);
    return page.evaluate(({ currentPath, isMobile }) => {
      const brokenImages = Array.from(document.images)
        .filter((img) => img.naturalWidth === 0)
        .map((img) => ({
          alt: img.alt,
          src: img.getAttribute("src"),
          currentSrc: img.currentSrc,
          loading: img.getAttribute("loading"),
          top: Math.round(img.getBoundingClientRect().top)
        }));

      return {
        path: currentPath,
        viewport: isMobile ? "mobile" : "desktop",
        finalUrl: window.location.href,
        title: document.title,
        lang: document.documentElement.lang,
        canonical: document.querySelector("link[rel='canonical']")?.getAttribute("href") || null,
        robots: document.querySelector("meta[name='robots']")?.getAttribute("content") || null,
        h1: document.querySelector("h1")?.textContent?.trim() || null,
        brokenImages
      };
    }, { currentPath: path, isMobile: mobile });
  };

  await page.setViewportSize({ width: 1440, height: 2200 });
  for (const path of checkPaths) {
    issues.pageAuditsDesktop.push(await collectPageAudit(path, { mobile: false }));
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of checkPaths) {
    issues.pageAuditsMobile.push(await collectPageAudit(path, { mobile: true }));
  }

  issues.console = dedupeBy(issues.console, (item) => `${item.type}:${item.text}:${item.page}`);
  issues.requestFailed = dedupeBy(issues.requestFailed, (item) => `${item.url}:${item.type}:${item.error}`);
  issues.badResponses = dedupeBy(issues.badResponses, (item) => `${item.url}:${item.status}:${item.type}`);

  return issues;
}

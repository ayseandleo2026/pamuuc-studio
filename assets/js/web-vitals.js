import { onCLS, onFCP, onINP, onLCP, onTTFB } from "../vendor/web-vitals.attribution.js";

const reportOptions = {
  reportAllChanges: false
};

export const installWebVitalsReporter = (reportMetric) => {
  if (typeof reportMetric !== "function") {
    return;
  }

  onCLS(reportMetric, reportOptions);
  onFCP(reportMetric, reportOptions);
  onINP(reportMetric, reportOptions);
  onLCP(reportMetric, reportOptions);
  onTTFB(reportMetric, reportOptions);
};

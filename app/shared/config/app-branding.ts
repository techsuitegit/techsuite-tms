export type AppBrandingConfig = {
  copyrightYear: string;
  companyName: string;
  appVersion: string;
  copyrightText: string;
};

export type AppFooterSegments = {
  copyrightLine: string;
  versionLabel: string;
  rightsLine: string;
};

/** Footer/branding values from `NEXT_PUBLIC_*` environment variables. */
export function getAppBrandingConfig(): AppBrandingConfig {
  return {
    copyrightYear: process.env.NEXT_PUBLIC_COPYRIGHT_YEAR ?? "",
    companyName: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "",
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "",
    copyrightText: process.env.NEXT_PUBLIC_COPYRIGHT_TEXT ?? "",
  };
}

/** Structured footer segments for styled rendering. */
export function getAppFooterSegments(config: AppBrandingConfig = getAppBrandingConfig()): AppFooterSegments {
  let copyrightLine = "";
  if (config.copyrightYear && config.companyName) {
    copyrightLine = `© ${config.copyrightYear} ${config.companyName}`;
  } else if (config.copyrightYear) {
    copyrightLine = `© ${config.copyrightYear}`;
  } else if (config.companyName) {
    copyrightLine = config.companyName;
  }

  const versionLabel = config.appVersion ? `v.${config.appVersion}` : "";
  const rightsLine = config.copyrightText;

  return { copyrightLine, versionLabel, rightsLine };
}

/** Footer line: © {year} {company} • Version {version} • {copyright text} */
export function formatAppFooterText(config: AppBrandingConfig = getAppBrandingConfig()): string {
  const { copyrightLine, versionLabel, rightsLine } = getAppFooterSegments(config);
  return [copyrightLine, versionLabel, rightsLine].filter(Boolean).join(" • ");
}

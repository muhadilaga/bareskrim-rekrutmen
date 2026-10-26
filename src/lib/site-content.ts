import { prisma } from "@/lib/prisma";
import { defaultSiteContent, type SiteContent } from "./site-content-types";

export type { SiteContent } from "./site-content-types";
export { defaultSiteContent } from "./site-content-types";

const SITE_CONTENT_SETTING_KEY = "site_content";

/**
 * Mengambil konten teks website dari database (RuntimeSetting).
 * Jika belum ada di database atau nilai parsial, gunakan defaultSiteContent sebagai fallback.
 */
export async function getSiteContent(): Promise<SiteContent> {
  try {
    const setting = await prisma.runtimeSetting.findUnique({
      where: { key: SITE_CONTENT_SETTING_KEY },
    });

    if (!setting || typeof setting.value !== "object" || setting.value === null) {
      return defaultSiteContent;
    }

    const val = setting.value as Partial<SiteContent>;
    return {
      ...defaultSiteContent,
      ...val,
    };
  } catch (err) {
    console.error("Gagal membaca site_content dari database:", err);
    return defaultSiteContent;
  }
}

/**
 * Memperbarui konten teks website di database (RuntimeSetting).
 */
export async function updateSiteContent(
  newContent: Partial<SiteContent>
): Promise<SiteContent> {
  const current = await getSiteContent();
  const merged: SiteContent = {
    ...current,
    ...newContent,
  };

  await prisma.runtimeSetting.upsert({
    where: { key: SITE_CONTENT_SETTING_KEY },
    update: {
      value: merged as unknown as object,
    },
    create: {
      key: SITE_CONTENT_SETTING_KEY,
      value: merged as unknown as object,
    },
  });

  return merged;
}

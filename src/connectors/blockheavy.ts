/**
 * Abort image / media / font requests to slash proxy bandwidth. The scraper only
 * needs the page's HTML + JS + data — image URLs live in the DOM as plain text,
 * and the vision step downloads the actual photos separately (a direct fetch,
 * not through the proxy). So this saves ~75-80% of bandwidth with no loss of
 * listing data, product identification, or dashboard thumbnails.
 *
 * On by default; set SCRAPER_BLOCK_IMAGES=false to disable if a site refuses to
 * render without images. Only image/media/font are blocked — never JS, CSS,
 * XHR/fetch, or the document itself, which the page needs to show listings.
 */
export async function blockHeavyResources(ctx: any): Promise<void> {
  if ((process.env.SCRAPER_BLOCK_IMAGES ?? "true").toLowerCase() === "false") return;
  await ctx.route("**/*", (route: any) => {
    const t = route.request().resourceType();
    return t === "image" || t === "media" || t === "font" ? route.abort() : route.continue();
  });
}

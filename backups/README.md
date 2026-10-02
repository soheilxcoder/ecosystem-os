# Legacy backup

`v18-static-site-backup.tar.gz` is a complete snapshot of the repository as of
commit `7d079b6` — the V18 FINAL static prototype (the old self-contained HTML
pages that GitHub Pages served). It was archived on 2026-10-02 when the legacy
static files were removed from the working tree in favour of the new platform
(Next.js + Fastify + PGlite).

Restore:

    tar -xzf v18-static-site-backup.tar.gz

Every file is also retrievable from git history directly, e.g.:

    git show 7d079b6:dashboard.html

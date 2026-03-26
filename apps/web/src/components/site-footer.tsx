const footerLinks = [
  { label: "About", href: "#" },
  { label: "Contact", href: "#" },
  { label: "LinkedIn", href: "#" },
  { label: "GitHub", href: "#" },
];

export function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="relative border-t border-white/10 bg-background/70 px-4 py-8 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            &copy; {currentYear} Priyam Singhal
          </p>
          <p className="text-sm text-muted-foreground">
            PTA Pilot. All rights reserved.
          </p>
        </div>

        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm"
        >
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-muted-foreground transition hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

import Link from "next/link";

export interface LegalSection {
  id: string;
  title: string;
  paragraphs: string[];
  items?: string[];
}

interface LegalPageProps {
  title: string;
  description: string;
  effectiveDate: string;
  sections: LegalSection[];
}

export function LegalPage({
  title,
  description,
  effectiveDate,
  sections,
}: LegalPageProps): React.JSX.Element {
  return (
    <main className="min-h-screen bg-dt-bg px-4 py-8 text-dt-text sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-dt-yellow">
            DeliverTrust · Tài liệu dịch vụ
          </p>
          <Link
            href="/register"
            className="inline-flex min-h-10 items-center rounded-md border border-dt-border px-4 py-2 text-sm font-medium text-dt-text transition hover:border-dt-yellow hover:text-dt-yellow"
          >
            Quay lại đăng ký
          </Link>
        </div>

        <header className="rounded-dt border border-dt-border bg-dt-panel p-6 sm:p-9">
          <h1 className="text-3xl font-semibold tracking-tight text-dt-text sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-dt-muted sm:text-base">
            {description}
          </p>
          <p className="mt-5 text-sm text-dt-muted">
            Ngày hiệu lực:{" "}
            <span className="font-medium text-dt-yellow">{effectiveDate}</span>
          </p>
        </header>

        <nav
          aria-label="Mục lục"
          className="mt-6 rounded-dt border border-dt-border bg-dt-panel p-5 sm:p-7"
        >
          <h2 className="text-base font-semibold">Mục lục</h2>
          <ol className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="leading-6 text-dt-muted transition hover:text-dt-yellow"
                >
                  {index + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="mt-6 space-y-5">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-24 rounded-dt border border-dt-border bg-dt-panel p-5 sm:p-7"
            >
              <h2 className="text-lg font-semibold leading-7 text-dt-text">
                {index + 1}. {section.title}
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-dt-muted">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.items ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </article>

        <div className="mt-8 flex justify-center">
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-dt-yellow px-5 py-2.5 text-sm font-semibold text-dt-bg transition hover:brightness-110"
          >
            Quay lại đăng ký
          </Link>
        </div>
      </div>
    </main>
  );
}

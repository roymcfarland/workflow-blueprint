import { CalendarClock, Inbox, NotebookPen } from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { BlueprintCard } from "@/components/blueprint/card";
import { getCurrentUser } from "@/lib/auth";

function HeroBoardIllustration() {
  const columns = ["Backlog", "Up Next", "In Progress", "Done"];

  return (
    <div className="relative mx-auto mt-6 w-full max-w-[18.5rem] sm:mt-10 sm:max-w-xl">
      <div className="blueprint-surface blueprint-grid-paper overflow-hidden p-3 sm:p-5">
        <div className="auto-fit-grid gap-px border border-line-strong bg-line-strong text-center [--auto-fit-min:7rem]">
          {columns.map((column, columnIndex) => (
            <div
              className={
                // On the smallest screens we hide the middle two columns to keep the
                // illustration legible — the story is "we organize work", not "we
                // have four columns".
                columnIndex === 0 || columnIndex === 3
                  ? "bg-surface-raised"
                  : "hidden bg-surface-raised sm:block"
              }
              key={column}
            >
              <div className="blueprint-eyebrow whitespace-nowrap border-b border-line-strong px-2 py-2 text-text-primary">
                {column}
              </div>
              <div className="grid min-h-44 gap-3 p-3 sm:min-h-72 sm:gap-4 sm:p-4">
                {[0, 1, 2].map((card) => (
                  <div
                    className="blueprint-note flex h-16 w-full items-center justify-center px-3 text-center text-sm text-text-primary sm:h-24"
                    key={`${column}-${card}`}
                  >
                    <div className="space-y-1">
                      <div className="mx-auto h-0.5 w-9 rounded-full bg-brand/60" />
                      <div className="mx-auto h-0.5 w-7 rounded-full bg-brand/45" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const featureBlurbs = [
  {
    icon: Inbox,
    title: "Drag tasks across columns",
    copy: "Backlog to Up Next to Done — keyboard or pointer.",
  },
  {
    icon: NotebookPen,
    title: "Notes auto-save per board",
    copy: "Capture context without leaving the workspace.",
  },
  {
    icon: CalendarClock,
    title: "See due-this-week at a glance",
    copy: "Overdue and upcoming tasks surface on the dashboard.",
  },
];

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
      <div className="blueprint-surface blueprint-surface-strong blueprint-grid-paper mx-auto flex min-h-[calc(100svh-1.5rem)] max-w-[88rem] flex-col overflow-hidden sm:min-h-[calc(100vh-3rem)]">
        <div className="auto-fit-grid min-w-0 flex-1 items-center gap-8 px-4 py-7 [--auto-fit-min:28rem] sm:px-6 sm:py-10 lg:px-12 lg:py-12">
          <section className="fade-up min-w-0 space-y-7">
            <div className="space-y-5">
              <h1 className="blueprint-display text-5xl leading-[0.94] text-text-primary sm:text-6xl lg:text-7xl">
                <span className="block">Workflow</span>
                <span className="block">Blueprint</span>
              </h1>
              <div className="h-1 w-32 max-w-full rounded-full bg-brand sm:w-40" />
              <p className="text-xl font-medium text-text-primary sm:text-2xl">
                Plan. Execute. Achieve.
              </p>
            </div>

            <HeroBoardIllustration />

            <div className="auto-fit-grid gap-4 pt-6 [--auto-fit-min:14rem]">
              {featureBlurbs.map((item) => (
                <div className="flex items-start gap-3" key={item.title}>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface-control">
                    <item.icon className="h-5 w-5 text-brand" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-text-primary">{item.title}</p>
                    <p className="text-sm text-text-muted">{item.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="fade-up min-w-0">
            <BlueprintCard className="mx-auto w-full max-w-2xl p-5 sm:p-9">
              <div className="space-y-7">
                <div className="space-y-2 text-center">
                  <h2 className="blueprint-display text-3xl text-text-primary sm:text-4xl">
                    Welcome back
                  </h2>
                  <p className="text-base text-text-muted">
                    Sign in to continue to Workflow Blueprint.
                  </p>
                </div>

                <LoginForm />
              </div>
            </BlueprintCard>
          </section>
        </div>

        <footer className="border-t border-line-soft px-6 py-4 text-center text-sm font-semibold text-text-muted lg:px-12">
          Built by{" "}
          <a
            className="text-brand underline decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
            href="https://www.brightline.io"
            rel="noreferrer"
            target="_blank"
          >
            Brightline Labs
          </a>
        </footer>
      </div>
    </div>
  );
}

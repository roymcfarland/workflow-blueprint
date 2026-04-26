import { CheckCircle2, ChartNoAxesCombined, Users } from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { BlueprintCard } from "@/components/blueprint/card";
import { getCurrentUser } from "@/lib/auth";

function HeroBoardIllustration() {
  const columns = ["Ice Box", "On Deck", "In Progress", "Done"];

  return (
    <div className="relative mx-auto mt-8 w-full max-w-[18.5rem] sm:mt-12 sm:max-w-xl">
      <div className="blueprint-surface blueprint-grid-paper overflow-hidden p-3 sm:p-5">
        <div className="auto-fit-grid gap-px border border-ink bg-ink text-center [--auto-fit-min:7rem]">
          {columns.map((column) => (
            <div
              className="bg-white/85 dark:bg-paper-strong"
              key={column}
            >
              <div className="blueprint-title whitespace-nowrap border-b border-ink px-1.5 py-2 text-[0.68rem] leading-none text-ink sm:py-3 sm:text-sm">
                {column}
              </div>
              <div className="grid min-h-44 gap-3 p-3 sm:min-h-72 sm:gap-4 sm:p-4">
                {[0, 1, 2].map((card) => (
                  <div
                    className="blueprint-note flex h-16 w-full items-center justify-center px-3 text-center text-sm text-ink sm:h-24"
                    key={`${column}-${card}`}
                  >
                    <div className="space-y-1">
                      <div className="mx-auto h-0.5 w-9 rounded-full bg-ink/50" />
                      <div className="mx-auto h-0.5 w-7 rounded-full bg-ink/40" />
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

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
      <div className="blueprint-surface blueprint-surface-strong blueprint-grid-paper mx-auto flex min-h-[calc(100svh-1.5rem)] max-w-[96rem] flex-col overflow-hidden sm:min-h-[calc(100vh-3rem)]">
        <div className="auto-fit-grid min-w-0 flex-1 items-center gap-8 px-4 py-7 [--auto-fit-min:28rem] sm:px-6 sm:py-10 lg:px-14 lg:py-12">
          <section className="fade-up min-w-0 space-y-8">
            <div className="space-y-6">
              <div>
                <h1 className="blueprint-title text-5xl leading-[0.86] text-ink sm:text-7xl lg:text-8xl">
                  Workflow
                </h1>
                <h1 className="blueprint-title text-5xl leading-[0.86] text-ink sm:text-7xl lg:text-8xl">
                  Blueprint
                </h1>
              </div>
              <div className="h-1 w-40 max-w-full rounded-full bg-ink sm:w-56" />
              <p className="text-2xl font-medium text-ink sm:text-3xl">
                Plan. Execute. Achieve.
              </p>
            </div>

            <HeroBoardIllustration />

            <div className="auto-fit-grid gap-4 pt-8 [--auto-fit-min:12rem]">
              {[
                {
                  icon: CheckCircle2,
                  title: "Organize",
                  copy: "All your tasks",
                },
                {
                  icon: ChartNoAxesCombined,
                  title: "Track",
                  copy: "What matters",
                },
                {
                  icon: Users,
                  title: "Collaborate",
                  copy: "Get things done",
                },
              ].map((item) => (
                <div className="flex items-center gap-3" key={item.title}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-ink bg-white/70 dark:bg-paper-strong">
                    <item.icon className="h-7 w-7 text-ink" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-ink">{item.title}</p>
                    <p className="text-sm text-ink-muted">{item.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="fade-up min-w-0">
            <BlueprintCard className="mx-auto w-full max-w-2xl p-5 sm:p-10">
              <div className="space-y-8">
                <div className="space-y-2 text-center">
                  <h2 className="blueprint-title text-4xl text-ink sm:text-5xl">
                    Welcome Back
                  </h2>
                  <p className="text-lg text-ink-muted">
                    Sign in to continue to Workflow Blueprint.
                  </p>
                </div>

                <LoginForm />
              </div>
            </BlueprintCard>
          </section>
        </div>

        <footer className="border-t border-ink/15 px-6 py-4 text-center text-sm font-semibold text-ink-muted lg:px-14">
          Built by{" "}
          <a
            className="text-ink underline decoration-2 underline-offset-4"
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

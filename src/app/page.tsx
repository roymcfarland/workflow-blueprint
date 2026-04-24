import { CheckCircle2, ChartNoAxesCombined, Users } from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { BlueprintCard } from "@/components/blueprint/card";
import { getCurrentUser } from "@/lib/auth";

function HeroBoardIllustration() {
  const columns = ["Ice Box", "On Deck", "In Progress", "Done"];

  return (
    <div className="relative mx-auto mt-12 max-w-xl">
      <div className="blueprint-surface overflow-hidden rounded-[2rem] bg-white/88 p-5 dark:bg-paper-strong">
        <div className="grid grid-cols-4 border-2 border-ink text-center">
          {columns.map((column) => (
            <div className="border-r-2 border-ink last:border-r-0" key={column}>
              <div className="blueprint-title border-b-2 border-ink px-2 py-3 text-2xl text-ink">
                {column}
              </div>
              <div className="grid min-h-72 gap-4 p-4">
                {[0, 1, 2].map((card) => (
                  <div
                    className="blueprint-note flex h-24 w-full items-center justify-center px-3 text-center text-sm text-ink"
                    key={`${column}-${card}`}
                    style={{
                      rotate: `${(card % 2 === 0 ? -1 : 1) * 1.8}deg`,
                    }}
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

      <div className="absolute -bottom-10 -left-10 h-24 w-24 rounded-full border-2 border-ink bg-white/88 dark:bg-paper-strong" />
      <div className="absolute -bottom-6 right-0 h-20 w-24 rounded-[1.2rem] border-2 border-ink bg-white/88 dark:bg-paper-strong" />
    </div>
  );
}

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="blueprint-surface blueprint-surface-strong mx-auto min-h-[calc(100vh-3rem)] max-w-[96rem] overflow-hidden rounded-[2rem]">
        <div className="grid min-h-[calc(100vh-3rem)] items-center gap-10 px-6 py-10 lg:grid-cols-[1.1fr_0.95fr] lg:px-14 lg:py-12">
          <section className="fade-up space-y-8">
            <div className="space-y-6">
              <div>
                <h1 className="blueprint-title text-[clamp(4.8rem,11vw,8.8rem)] leading-[0.82] text-ink">
                  Workflow
                </h1>
                <h1 className="blueprint-title text-[clamp(4.8rem,11vw,8.8rem)] leading-[0.82] text-ink">
                  Blueprint
                </h1>
              </div>
              <div className="h-1.5 w-64 rounded-full bg-ink" />
              <p className="text-[clamp(1.5rem,3vw,2.4rem)] font-medium text-ink">
                Plan. Execute. Achieve.
              </p>
            </div>

            <HeroBoardIllustration />

            <div className="grid gap-4 pt-8 sm:grid-cols-3">
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
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink">
                    <item.icon className="h-7 w-7 text-ink" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-ink">{item.title}</p>
                    <p className="text-sm text-ink-muted">{item.copy}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="fade-up">
            <BlueprintCard className="mx-auto w-full max-w-2xl p-7 sm:p-10">
              <div className="space-y-8">
                <div className="space-y-2 text-center">
                  <h2 className="blueprint-title text-[clamp(3rem,5vw,4.3rem)] text-ink">
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
      </div>
    </div>
  );
}

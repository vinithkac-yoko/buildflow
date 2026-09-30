import Link from "next/link";
import { Sparkles } from "lucide-react";
import { can } from "@/core/auth/permissions";
import { ASK_QUESTIONS } from "@/core/tools";
import { BehindAnswer, LabourAnswer, NcrAnswer, StockAnswer } from "@/components/ask/answers";
import { NoAccess } from "@/components/no-access";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { requireSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ask BUILDFlow" };

/**
 * Phase 2 preview. Four fixed questions, each answered by a real read tool in src/core/tools.
 * There is no language model here and no free-text box — that arrives in Phase 2.
 */
export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx } = await requireSession();
  if (!can(ctx, "read", "ask")) return <NoAccess />;
  const { q } = await searchParams;
  const asked = ASK_QUESTIONS.find((x) => x.id === q) ?? null;

  let answer: React.ReactNode = null;
  if (asked) {
    switch (asked.id) {
      case "behind": answer = <BehindAnswer result={await asked.tool.run(ctx)} />; break;
      case "stock": answer = <StockAnswer result={await asked.tool.run(ctx)} />; break;
      case "ncr": answer = <NcrAnswer result={await asked.tool.run(ctx)} />; break;
      case "labour": answer = <LabourAnswer result={await asked.tool.run(ctx)} />; break;
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-2">
        <Badge tone="plan"><Sparkles className="h-3.5 w-3.5" aria-hidden />Preview — AI assistant coming in Phase 2</Badge>
        <h1 className="text-2xl md:text-3xl">Ask BUILDFlow</h1>
        <p className="text-muted">Pick a question. The answer comes straight from your live project data — nothing is guessed.</p>
      </div>

      <nav aria-label="Suggested questions">
        <ul className="grid gap-2 sm:grid-cols-2">
          {ASK_QUESTIONS.map((x) => (
            <li key={x.id}>
              <Link
                href={`/ask?q=${x.id}#answer`}
                aria-current={asked?.id === x.id ? "true" : undefined}
                className={cn(
                  "panel flex min-h-14 items-center px-4 py-3 text-[16px] font-semibold hover:bg-surface-2",
                  asked?.id === x.id && "border-brand-text/60 bg-surface-2",
                )}
              >
                {x.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-1" title="Free-text questions arrive in Phase 2">
        <label htmlFor="ask-free" className="text-sm font-medium text-muted">Or type your own question</label>
        <input
          id="ask-free" disabled aria-describedby="ask-free-note" placeholder="Coming in Phase 2"
          className="min-h-14 w-full cursor-not-allowed rounded-xl border border-border bg-surface px-4 text-[16px] opacity-60"
        />
        <p id="ask-free-note" className="text-sm text-muted">Typing your own question is not available yet.</p>
      </div>

      {asked && (
        <section id="answer" aria-labelledby="answer-h" className="scroll-mt-20 space-y-3">
          <h2 id="answer-h" className="text-xl">{asked.label}</h2>
          {answer}
          <p className="text-xs text-muted">
            Answered from live data at {formatDateTime(ctx.now)} · read function <span className="code">{asked.tool.name}</span>
          </p>
        </section>
      )}
    </div>
  );
}
